// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Draft interface only — not implemented, not audited, not deployed.
/// Documents the on-chain settlement hook for royalty-settlement-instruction
/// events produced off-chain by hOUR Chain (see hOUR-Chain
/// docs/ADR-0006-clique-tee-oracle-clob-loyalty.md). A royalty-settlement
/// instruction is triggered by a CLOB fill (Hyperliquid, via Clique Wallet),
/// a loyalty-reward vesting, or an attested off-chain sale report, computed
/// against the versioned contributor/rights-split graph, and is expected to
/// arrive here already verified by hOUR Chain's PQC signature profile
/// (ADR-0002) and, where the triggering fact is off-chain, a Clique TLS
/// Oracle attestation.
///
/// Before implementing: this moves funds, so it needs its own design pass
/// (replay protection, split-graph version binding, pause/cancel path) and a
/// security review — do not wire this to HourToken or any live wallet
/// without that review.
interface IRoyaltySettlementReceiver {
    struct SettlementInstruction {
        address payee;
        uint256 amount;
        address asset;
    }

    /// @param eventId hOUR Chain event id this settlement instruction came from.
    /// @param splitGraphRef reference to the rights-split graph version used.
    /// @param instructions payee/amount/asset tuples to settle.
    function settleRoyaltyInstructions(
        bytes32 eventId,
        bytes32 splitGraphRef,
        SettlementInstruction[] calldata instructions
    ) external;
}
