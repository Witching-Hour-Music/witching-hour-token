# hOUR App Integration

Use the tracked config in `src/integration/hourToken.js` when wiring this token into the app.

## Deployment

- Network: Base
- Chain ID: `8453`
- Token address: `0xFC1c0FFF99845676A588CE21c28C4859F3035866`
- BaseScan: `https://basescan.org/address/0xFC1c0FFF99845676A588CE21c28C4859F3035866#code`

## Live contract state

- Name: `Witching Hour`
- Symbol: `hOUR`
- Decimals: `18`
- Total supply: `21,369,777 * 10^18`
- Owner: `0x52864a2EabcBa4E8421e541c8E0Ca74c55724732`
- Trading enabled: `false`
- Burn fee: `2`
- Liquidity fee: `3`
- Reward fee: `2`
- Witching start: `0`
- Witching end: `0`

## Constructor wallets

- Liquidity wallet: `0xA327c87770893178144C422511cfaC682c926C6A`
- Reward wallet: `0x8AF9F8d7f71f0625794544DC3aaF36d2c75b60F0`

## App notes

- There is no liquidity yet.
- `tradingEnabled` is currently `false`.
- The deployer wallet currently holds the full supply.
- The owner still controls trading activation, fees, fee exemptions, and witching hours.
- Do not present this token as live-trading until liquidity exists and `enableTrading()` has been called.
- Treat `src/integration/hourToken.js` as the canonical app-facing source of truth for address, chain, and ABI values.

## Suggested UI behavior

- Show a clear "not live" state while `tradingEnabled` is `false`.
- Hide or disable swap and market actions until liquidity exists.
- Surface `tradingEnabled`, fees, and witching window from chain reads.
- Keep admin actions separate from the public app UI.
