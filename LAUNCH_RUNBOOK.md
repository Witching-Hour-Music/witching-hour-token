# hOUR Launch Runbook

This document is the operational sequence for launching `hOUR` on Base.

It is not marketing copy.
It is the record of what must be true before launch, what happens during launch, and what changes are permitted after launch.

## Execution Order

Use this as the working checklist. Do not skip steps.

### 1. Freeze the launch inputs

- Confirm LP allocation in `hOUR`
- Confirm reserve allocation in `hOUR`
- Confirm initial ETH amount for the pool
- Confirm any non-LP reserve destinations
- Confirm the exact launch timestamp

### 2. Preflight the wallets

- Confirm the deployer wallet still holds the intended launch allocation
- Confirm the liquidity wallet is funded with the final ETH amount
- Confirm the reward wallet is correct
- Confirm no tokens were sent to the wrong destination

### 3. Prepare the site

- Keep the public site copy on `Trading disabled`
- Keep swap and market actions hidden or disabled until liquidity exists
- Keep the token page aligned with chain truth

### 4. Execute launch

- Transfer LP allocation to the liquidity wallet if needed
- Create the `hOUR / ETH` pool on Aerodrome
- Add liquidity on Aerodrome
- Confirm the pool is visible and indexed
- Call `enableTrading()`

### 5. Verify post-launch state

- Confirm `tradingEnabled = true`
- Confirm owner still matches the expected wallet
- Confirm fees still match the expected values
- Confirm the pool is active and swappable
- Confirm the public site now reflects live chain state

### 6. Publish only after checks pass

- Publish the announcement only after chain state and UI state agree
- Do not post if the site is stale
- Do not tune parameters unless the change is critical

## Current Contract

- Token: `Witching Hour`
- Symbol: `hOUR`
- Network: `Base`
- Chain ID: `8453`
- Contract: `0xFC1c0FFF99845676A588CE21c28C4859F3035866`
- BaseScan: `https://basescan.org/address/0xFC1c0FFF99845676A588CE21c28C4859F3035866#code`

## Custody

- Owner wallet: `0x52864a2EabcBa4E8421e541c8E0Ca74c55724732`
- Custody decision: keep single EOA through launch completion, then migrate to multisig
- Liquidity wallet: `0xA327c87770893178144C422511cfaC682c926C6A`
- Reward wallet: `0x8AF9F8d7f71f0625794544DC3aaF36d2c75b60F0`
- Treasury wallet: use liquidity wallet temporarily unless separated later

### Owner Power Rule

After LP is live and trading is stable:

- reduce privileges
- either lock fee behavior in practice or transfer ownership to multisig
- make no post-launch parameter changes unless the reason is critical

No routine tuning after launch.

## Launch Venue

- DEX venue: `Aerodrome`
- Network: `Base`
- Pair: `hOUR / ETH`

## Preconditions

The launch does not proceed until all items below are true.

- Liquidity wallet funded with final ETH amount
- Reward wallet confirmed
- LP allocation finalized
- Reserve split finalized
- Site copy explicitly shows: `Trading disabled` before launch
- Launch timestamp selected only after LP funding is ready

## Allocation Decisions Still Required

These values are still open and must be written here before execution:

- LP allocation in `hOUR`
- reserve allocation in `hOUR`
- launch ETH amount for the initial pool
- any non-LP reserve destinations beyond current wallets

## Launch Sequence

1. Confirm the deployer wallet still holds the intended launch allocation.
2. Transfer LP allocation to the liquidity wallet if it is not already there.
3. Create the `hOUR / ETH` pool on Aerodrome.
4. Add liquidity on Aerodrome.
5. Confirm the pool is visible and indexed.
6. Verify the public site still shows trading disabled before go-live.
7. Call `enableTrading()`.
8. Re-check contract state:
   - `tradingEnabled = true`
   - owner still matches expected wallet
   - fees still match expected values
9. Re-check market state:
   - pool active
   - pair swappable
10. Re-check public site state:
    - token page reflects live chain state
    - launch messaging matches actual chain state
11. Publish the public announcement only after chain state and UI state agree.

## Verification Checklist

Before public announcement, verify all of the following:

- pool exists on Aerodrome
- LP was added to the intended pair
- no tokens were sent to the wrong destination
- `tradingEnabled` is `true`
- fees remain:
  - burn: `2`
  - liquidity: `3`
  - reward: `2`
- token page on the site reflects chain truth

## Rollback And Failure Rules

### LP added, trading not enabled

- do nothing publicly
- do not announce
- verify pool correctness first
- enable trading only after confirming the pool and wallet state are correct

### Trading enabled, site stale

- pause announcement
- fix cache or UI immediately
- do not post publicly until the site reflects live state

### Wrong wallet receives tokens

- stop immediately
- do not proceed with LP
- recover if possible
- if recovery is not possible and the error is severe, reassess whether redeploy is required

### Announcement authority

- only the owner wallet operator can greenlight the public launch

## Public Truth

### Before Launch

The site and public statements should say:

`Token deployed. Trading not yet enabled. LP not active.`

### After Launch

The site and public statements should say:

`Trading live. LP active on Aerodrome.`

### Chain-Derived Facts

- `tradingEnabled`
- LP pool existence
- token supply
- transfers
- current fee values

### Manual Facts

- site messaging
- launch announcement copy
- editorial framing

## Locked Decisions

- custody: single EOA before launch, multisig after launch
- venue: Aerodrome on Base
- pair: `hOUR / ETH`
- admin posture: reduce control post-launch, no active tuning unless emergency

## Immediate Next Actions

1. Write the LP allocation, reserve allocation, and initial ETH amount into this file.
2. Fund the liquidity wallet and verify the reward wallet.
3. Set the launch timestamp and confirm owner approval.
4. Run the launch sequence in order.
5. Prepare the post-launch multisig migration plan before launch day, even if the transfer happens after launch.
