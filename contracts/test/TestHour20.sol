// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice TEST-ONLY stand-in for HourToken, used solely to exercise the
/// HourBridgeVault/WrappedHour lock-mint flow on Base Sepolia for free,
/// before any real deployment. Never deploy this to Base mainnet; it has
/// no fee logic, no trading gate, and is not the real HOUR token.
contract TestHour20 is ERC20 {
    constructor(address recipient, uint256 initialSupply) ERC20("Test Hour", "tHOUR") {
        _mint(recipient, initialSupply);
    }
}
