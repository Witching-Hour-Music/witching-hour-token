// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Wrapped HOUR on hOUR Chain's EVM, minted on multisig-confirmed
/// proof of a lock in HourBridgeVault on Base, and burned here to request a
/// release back on Base. Deploys to hOUR Chain's EVM JSON-RPC (chain id
/// 9000); kept in this repo to reuse the existing Hardhat/Solidity
/// toolchain rather than duplicating it in the hOUR-Chain repo. See
/// hOUR-Chain docs/ADR-0007-hour-token-bridge.md.
///
/// Same trust-model limitation as HourBridgeVault: the owner alone manages
/// the signer set and threshold. Acceptable for the current single-founder
/// stage; revisit before any external signer/value at risk grows.
contract WrappedHour is ERC20, Ownable {
    error ZeroAddress();
    error InvalidThreshold();
    error NotSigner();
    error AlreadyConfirmed();
    error AlreadyProcessed();
    error MintMismatch();
    error ZeroAmount();

    event MintConfirmed(bytes32 indexed lockId, address indexed signer, uint256 confirmations);
    event Minted(bytes32 indexed lockId, address indexed to, uint256 amount);
    event BurnedForRelease(bytes32 indexed burnId, address indexed from, uint256 amount, string destAddr);
    event SignerUpdated(address signer, bool isSigner);
    event ThresholdUpdated(uint256 threshold);

    mapping(address => bool) public isSigner;
    uint256 public signerCount;
    uint256 public threshold;
    uint256 public burnNonce;

    struct Mint {
        address to;
        uint256 amount;
        uint256 confirmations;
        bool processed;
    }

    mapping(bytes32 => Mint) public mints;
    mapping(bytes32 => mapping(address => bool)) public hasConfirmed;

    constructor(
        address[] memory _signers,
        uint256 _threshold
    ) ERC20("Wrapped hOUR", "whOUR") Ownable(msg.sender) {
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

    /// @notice Each signer calls this with the same (lockId, to, amount)
    /// after independently verifying the corresponding lock on Base.
    /// Mints once `threshold` signers agree.
    function confirmMint(bytes32 lockId, address to, uint256 amount) external {
        if (!isSigner[msg.sender]) revert NotSigner();
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        Mint storage m = mints[lockId];
        if (m.processed) revert AlreadyProcessed();

        if (m.confirmations == 0) {
            m.to = to;
            m.amount = amount;
        } else if (m.to != to || m.amount != amount) {
            revert MintMismatch();
        }

        if (hasConfirmed[lockId][msg.sender]) revert AlreadyConfirmed();
        hasConfirmed[lockId][msg.sender] = true;
        m.confirmations++;

        emit MintConfirmed(lockId, msg.sender, m.confirmations);

        if (m.confirmations >= threshold) {
            m.processed = true;
            _mint(m.to, m.amount);
            emit Minted(lockId, m.to, m.amount);
        }
    }

    /// @notice Burns `amount` wHOUR to request a release of locked HOUR at
    /// `destAddr` on Base. The bridge signers watch this event and confirm
    /// the matching release in HourBridgeVault.
    function burnForRelease(uint256 amount, string calldata destAddr) external returns (bytes32 burnId) {
        if (amount == 0) revert ZeroAmount();

        burnId = keccak256(
            abi.encodePacked(address(this), msg.sender, amount, destAddr, burnNonce, block.chainid)
        );
        burnNonce++;

        _burn(msg.sender, amount);
        emit BurnedForRelease(burnId, msg.sender, amount, destAddr);
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
}
