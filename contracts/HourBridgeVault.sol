// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Locks HOUR deposits bound for hOUR Chain and releases them back on
/// multisig-confirmed proof of a burn on hOUR Chain. This is a trusted
/// bridge — the signer set is the entire security boundary, not a
/// trust-minimized light-client bridge. See hOUR-Chain docs/ADR-0007.
///
/// Known limitation: the owner alone manages the signer set and threshold
/// (same trust level as HourToken's existing Ownable governance). The owner
/// could lower the threshold and self-approve releases. Acceptable for the
/// current single-founder stage; revisit before any external signer/value
/// at risk grows.
contract HourBridgeVault is Ownable {
    error ZeroAddress();
    error InvalidThreshold();
    error NotSigner();
    error AlreadyConfirmed();
    error AlreadyProcessed();
    error ReleaseMismatch();
    error ZeroAmount();

    event Locked(bytes32 indexed lockId, address indexed from, uint256 amount, string destAddr);
    event ReleaseConfirmed(bytes32 indexed releaseId, address indexed signer, uint256 confirmations);
    event Released(bytes32 indexed releaseId, address indexed to, uint256 amount);
    event SignerUpdated(address signer, bool isSigner);
    event ThresholdUpdated(uint256 threshold);

    IERC20 public immutable hourToken;

    mapping(address => bool) public isSigner;
    uint256 public signerCount;
    uint256 public threshold;
    uint256 public lockNonce;

    struct Release {
        address to;
        uint256 amount;
        uint256 confirmations;
        bool processed;
    }

    mapping(bytes32 => Release) public releases;
    mapping(bytes32 => mapping(address => bool)) public hasConfirmed;

    constructor(
        address _hourToken,
        address[] memory _signers,
        uint256 _threshold
    ) Ownable(msg.sender) {
        if (_hourToken == address(0)) revert ZeroAddress();

        hourToken = IERC20(_hourToken);

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

    /// @notice Locks `amount` HOUR for release as wrapped HOUR at `destAddr`
    /// on hOUR Chain. Caller must have approved this contract first.
    function lock(uint256 amount, string calldata destAddr) external returns (bytes32 lockId) {
        if (amount == 0) revert ZeroAmount();

        lockId = keccak256(
            abi.encodePacked(address(this), msg.sender, amount, destAddr, lockNonce, block.chainid)
        );
        lockNonce++;

        bool ok = hourToken.transferFrom(msg.sender, address(this), amount);
        require(ok, "transferFrom failed");

        emit Locked(lockId, msg.sender, amount, destAddr);
    }

    /// @notice Each signer calls this with the same (releaseId, to, amount)
    /// after independently verifying the corresponding burn on hOUR Chain.
    /// Executes the release once `threshold` signers agree.
    function confirmRelease(bytes32 releaseId, address to, uint256 amount) external {
        if (!isSigner[msg.sender]) revert NotSigner();
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        Release storage r = releases[releaseId];
        if (r.processed) revert AlreadyProcessed();

        if (r.confirmations == 0) {
            r.to = to;
            r.amount = amount;
        } else if (r.to != to || r.amount != amount) {
            revert ReleaseMismatch();
        }

        if (hasConfirmed[releaseId][msg.sender]) revert AlreadyConfirmed();
        hasConfirmed[releaseId][msg.sender] = true;
        r.confirmations++;

        emit ReleaseConfirmed(releaseId, msg.sender, r.confirmations);

        if (r.confirmations >= threshold) {
            r.processed = true;
            bool ok = hourToken.transfer(r.to, r.amount);
            require(ok, "transfer failed");
            emit Released(releaseId, r.to, r.amount);
        }
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
