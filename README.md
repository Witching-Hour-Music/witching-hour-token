# Witching Hour Token

`hOUR` is the token layer for the Witching Hour ecosystem on Base.

It is the on-chain signal behind the project’s identity, access, future app hooks, and broader economy. The contract is live, verified, and intentionally held in a pre-launch configuration while the app and launch flow are finalized.

## Token

- Name: `Witching Hour`
- Symbol: `hOUR`
- Network: `Base`
- Chain ID: `8453`
- Contract: `0xFC1c0FFF99845676A588CE21c28C4859F3035866`
- BaseScan: `https://basescan.org/address/0xFC1c0FFF99845676A588CE21c28C4859F3035866#code`

## Supply

- Fixed supply: `21,369,777 hOUR`
- Decimals: `18`
- Contract verified on BaseScan

## Current Launch State

- deployed
- verified
- liquidity not added yet
- trading not enabled yet
- owner still active

## Ecosystem Role

The token repo sits alongside:

- `witching-hour`: the main website and public-facing brand surface
- `witching-hour-live`: the live capture and session control stack
- `witching-hour-token`: the token contract and app integration package

`hOUR` is intended to support future app experiences, community identity, and on-chain coordination around the wider Witching Hour project.

## What This Repo Contains

- the deployed `HourToken` contract
- deployment and verification tooling
- a read-only inspection script for live contract state
- app-ready integration constants and ABI exports

## App Integration

Use these files when handing the token to an app team or another package:

- `INTEGRATION.md`
- `src/integration/hourToken.js`
- `.env.example`

These files provide the deployed address, Base chain config, token metadata, and the app-facing ABI without requiring the app to dig through Hardhat internals.

## Current Admin / Risk Notes

The contract is deliberately not in a final post-launch state:

- `tradingEnabled` is currently `false`
- the owner can still enable trading
- fee settings remain owner-controlled
- witching-hour settings remain owner-controlled

That is intentional while launch sequencing is still being finalized.

The repo now exports `hOUR` metadata from `src/integration/hourToken.js` so the app can consume the same address, chain, and ABI values without a second hardcoded copy.

## Live Values

Confirmed on-chain:

- owner: `0x52864a2EabcBa4E8421e541c8E0Ca74c55724732`
- liquidity wallet: `0xA327c87770893178144C422511cfaC682c926C6A`
- reward wallet: `0x8AF9F8d7f71f0625794544DC3aaF36d2c75b60F0`
- burn fee: `2`
- liquidity fee: `3`
- reward fee: `2`
- witching start: `0`
- witching end: `0`

## Operational Commands

Inspect the live Base deployment:

```bash
npm run inspect:base
```

## Links

- BaseScan: `https://basescan.org/address/0xFC1c0FFF99845676A588CE21c28C4859F3035866#code`
- GitHub: `https://github.com/witchinghourartcollective/witching-hour-token`
