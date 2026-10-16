// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./IRoyaltySettlementReceiver.sol";

/// @notice DRAFT -- UNAUDITED. Do not deploy against HourToken or any live
/// wallet without a security review (see IRoyaltySettlementReceiver.sol and
/// hOUR-Chain docs/ADR-0006-clique-tee-oracle-clob-loyalty.md).
///
/// Design decisions (open for review):
///
/// - Trust model mirrors HourBridgeVault (ADR-0007): an N-of-M signer set
///   confirms each settlement instruction before funds move. The off-chain
///   event this contract settles is only as trustworthy as the signers who
///   independently verified its hOUR Chain PQC signature (ADR-0002) and, for
///   off-chain-triggered instructions, its Clique TLS Oracle attestation --
///   this contract does not and cannot verify either on-chain (no PQC
///   precompile, no TLS Oracle attestation verifier in EVM). Same known
///   limitation as HourBridgeVault: the owner alone manages signers/
///   threshold/splitGraphRefs. Acceptable for the current single-founder
///   stage; revisit before external signer/value at risk grows.
/// - Replay protection: `eventId` can only ever be confirmed/settled once
///   (`processed`), independent of `threshold` --  mirrors HourBridgeVault's
///   `releases[releaseId].processed`.
/// - splitGraphRef binding: the owner explicitly registers each valid
///   splitGraphRef before any instruction referencing it can be confirmed.
///   An instruction against an unregistered or revoked split graph version
///   reverts. This stops a stale or forged split-graph reference from
///   redirecting royalties.
/// - Pull-payment, not push: `settleRoyaltyInstructions` only credits an
///   internal `claimable[payee][asset]` ledger; payees withdraw via
///   `claim`. This means one bad instruction (a payee address that reverts
///   or blocks transfers, e.g. a blacklisted USDC holder) can't block the
///   rest of the batch, and removes the reentrancy surface a push-transfer
///   loop to N arbitrary addresses would otherwise have.
/// - Pausable: owner can halt new confirmations in an incident; does not
///   affect `claim` (payees can always withdraw what's already credited).
contract RoyaltySettlement is IRoyaltySettlementReceiver, Ownable, ReentrancyGuard, Pausable {
    error ZeroAddress();
    error InvalidThreshold();
    error NotSigner();
    error AlreadyConfirmed();
    error AlreadyProcessed();
    error InstructionsMismatch();
    error EmptyInstructions();
    error ZeroAmount();
    error UnregisteredSplitGraph();
    error NothingToClaim();

    event SplitGraphRegistered(bytes32 indexed splitGraphRef, bool valid);
    event SettlementConfirmed(bytes32 indexed eventId, address indexed signer, uint256 confirmations);
    event SettlementExecuted(bytes32 indexed eventId, bytes32 indexed splitGraphRef, uint256 instructionCount);
    event Claimed(address indexed payee, address indexed asset, uint256 amount);
    event SignerUpdated(address signer, bool isSigner);
    event ThresholdUpdated(uint256 threshold);

    mapping(address => bool) public isSigner;
    uint256 public signerCount;
    uint256 public threshold;

    mapping(bytes32 => bool) public isValidSplitGraph;

    struct PendingSettlement {
        bytes32 splitGraphRef;
        bytes32 instructionsHash;
        uint256 confirmations;
        bool processed;
    }

    mapping(bytes32 => PendingSettlement) public settlements;
    mapping(bytes32 => mapping(address => bool)) public hasConfirmed;

    /// payee => asset => withdrawable amount.
    mapping(address => mapping(address => uint256)) public claimable;

    constructor(address[] memory _signers, uint256 _threshold) Ownable(msg.sender) {
        for (uint256 i = 0; i < _signers.length; i++) {
            if (_signers[i] == address(0)) revert ZeroAddress();
            if (!isSigner[_signers[i]]) {
                isSigner[_signers[i]] = true;
                signerCount++;
            }
        }

        if (_threshold == 0 || _threshold > signerCount) revert InvalidThreshold();
        threshold = _threshold;
    }

    /// @notice Each signer calls this with the full instruction set after
    /// independently verifying the hOUR Chain event's PQC signature (and, for
    /// an off-chain-triggered instruction, its Clique TLS Oracle
    /// attestation). Credits `claimable` once `threshold` signers agree on
    /// the exact same (splitGraphRef, instructions).
    function settleRoyaltyInstructions(
        bytes32 eventId,
        bytes32 splitGraphRef,
        SettlementInstruction[] calldata instructions
    ) external override whenNotPaused {
        if (!isSigner[msg.sender]) revert NotSigner();
        if (instructions.length == 0) revert EmptyInstructions();
        if (!isValidSplitGraph[splitGraphRef]) revert UnregisteredSplitGraph();

        bytes32 instructionsHash = keccak256(abi.encode(instructions));

        PendingSettlement storage s = settlements[eventId];
        if (s.processed) revert AlreadyProcessed();

        if (s.confirmations == 0) {
            s.splitGraphRef = splitGraphRef;
            s.instructionsHash = instructionsHash;
        } else if (s.splitGraphRef != splitGraphRef || s.instructionsHash != instructionsHash) {
            revert InstructionsMismatch();
        }

        if (hasConfirmed[eventId][msg.sender]) revert AlreadyConfirmed();
        hasConfirmed[eventId][msg.sender] = true;
        s.confirmations++;

        emit SettlementConfirmed(eventId, msg.sender, s.confirmations);

        if (s.confirmations >= threshold) {
            s.processed = true;

            for (uint256 i = 0; i < instructions.length; i++) {
                SettlementInstruction calldata ins = instructions[i];
                if (ins.payee == address(0) || ins.asset == address(0)) revert ZeroAddress();
                if (ins.amount == 0) revert ZeroAmount();
                claimable[ins.payee][ins.asset] += ins.amount;
            }

            emit SettlementExecuted(eventId, splitGraphRef, instructions.length);
        }
    }

    /// @notice Withdraw accumulated royalties for `asset`. Caller must have
    /// funded this contract with `asset` out-of-band (e.g. the treasury
    /// transfers settlement funds in before/alongside confirmation) -- this
    /// contract does not pull funds itself.
    function claim(address asset) external nonReentrant {
        uint256 amount = claimable[msg.sender][asset];
        if (amount == 0) revert NothingToClaim();

        claimable[msg.sender][asset] = 0;
        bool ok = IERC20(asset).transfer(msg.sender, amount);
        require(ok, "transfer failed");

        emit Claimed(msg.sender, asset, amount);
    }

    function setSplitGraphValid(bytes32 splitGraphRef, bool valid) external onlyOwner {
        isValidSplitGraph[splitGraphRef] = valid;
        emit SplitGraphRegistered(splitGraphRef, valid);
    }

    function setSigner(address signer, bool enabled) external onlyOwner {
        if (signer == address(0)) revert ZeroAddress();
        if (isSigner[signer] == enabled) return;

        isSigner[signer] = enabled;
        if (enabled) {
            signerCount++;
        } else {
            signerCount--;
            if (threshold > signerCount) revert InvalidThreshold();
        }

        emit SignerUpdated(signer, enabled);
    }

    function setThreshold(uint256 _threshold) external onlyOwner {
        if (_threshold == 0 || _threshold > signerCount) revert InvalidThreshold();
        threshold = _threshold;
        emit ThresholdUpdated(_threshold);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
