# Classic operations: `stellar tx new` / `stellar tx op add`

Both `stellar tx new <OP>` and `stellar tx op add <OP>` expose the same operation set. `tx new` starts a fresh envelope; `tx op add` appends to an existing one (pass the envelope XDR as the trailing `[TX_XDR]` arg or via stdin). Every operation takes the **Transaction Options** (`--source-account`/`--inclusion-fee`/`--build-only`) and most take **RPC** + **Signing** groups — see the parent SKILL.md for those shared groups. Only the operation-specific flags are listed here.

Amounts are in **stroops** (1 stroop = 0.0000001 of the unit) unless noted. Assets use the `CODE:ISSUER` form (e.g. `USDC:GABC...`) or `native` for XLM.

## Payments & accounts

### `payment`
Send an asset to a destination.
- `--destination <ACCOUNT>` (required)
- `--amount <STROOPS>` (required)
- `--asset <ASSET>` (default `native`)

### `create-account`
Create and fund a new account.
- `--destination <ACCOUNT>` (required)
- `--starting-balance <STROOPS>` (default 1 XLM)

### `account-merge`
Transfer the source account's entire XLM balance to another account and remove the source account.
- `--account <ACCOUNT>` (required, the account to merge into; accepts muxed `M...`)

### `path-payment-strict-send`
Send an asset via path finding, specifying the **send** amount.
- `--send-asset <ASSET>`, `--send-amount <STROOPS>` (required)
- `--destination <ACCOUNT>`, `--dest-asset <ASSET>`, `--dest-min <STROOPS>` (required)

### `path-payment-strict-receive`
Send an asset via path finding, specifying the **receive** amount.
- `--send-asset <ASSET>`, `--send-max <STROOPS>` (required)
- `--destination <ACCOUNT>`, `--dest-asset <ASSET>`, `--dest-amount <STROOPS>` (required)

## Trustlines & assets

### `change-trust`
Create, update, or delete a trustline.
- `--line <ASSET>` (required)
- `--limit <STROOPS>` (default max int64; `0` removes the trustline)

### `set-trustline-flags`
Configure authorization/clawback flags on another account's trustline (issuer only).
- `--trustor <ACCOUNT>` (required)
- `--asset <ASSET>` (required)
- Set: `--set-authorize`, `--set-authorize-to-maintain-liabilities`, `--set-trustline-clawback-enabled`
- Clear: `--clear-authorize`, `--clear-authorize-to-maintain-liabilities`, `--clear-trustline-clawback-enabled`

### `clawback`
Clawback an asset from an account (issuer only, requires clawback-enabled flag).
- `--from <ACCOUNT>`, `--asset <ASSET>`, `--amount <STROOPS>` (all required)

### `clawback-claimable-balance`
Clawback a claimable balance by its ID.
- `--balance-id <BALANCE_ID>` (required, 64-char hex)

## Claimable balances

### `create-claimable-balance`
Create a balance claimable by specified accounts.
- `--amount <STROOPS>` (required)
- `--asset <ASSET>` (default `native`)
- `--claimant <CLAIMANT>` (repeatable; format `account_id` or `account_id:predicate_json`)

### `claim-claimable-balance`
Claim a claimable balance.
- `--balance-id <BALANCE_ID>` (required, 64-char hex)

## Offers (DEX)

### `manage-sell-offer`
Create, update, or delete a sell offer.
- `--selling <ASSET>`, `--buying <ASSET>`, `--amount <STROOPS>`, `--price <PRICE>` (all required)
- `--offer-id <ID>` (omit to create; pass existing ID to update; amount `0` deletes)

### `manage-buy-offer`
Create, update, or delete a buy offer. Same flags as `manage-sell-offer` (`--selling`, `--buying`, `--amount`, `--price`, `--offer-id`).

### `create-passive-sell-offer`
Create a passive sell offer on the DEX.
- `--selling <ASSET>`, `--buying <ASSET>`, `--amount <STROOPS>`, `--price <PRICE>` (all required)

## Liquidity pools

### `liquidity-pool-deposit`
Deposit assets into a liquidity pool.
- `--liquidity-pool-id <ID>` (required)
- `--max-amount-a <STROOPS>`, `--max-amount-b <STROOPS>` (required)
- `--max-price <PRICE>`, `--min-price <PRICE>`

### `liquidity-pool-withdraw`
Withdraw assets from a liquidity pool.
- `--liquidity-pool-id <ID>` (required)
- `--amount <STROOPS>` (required, pool shares)
- `--min-amount-a <STROOPS>`, `--min-amount-b <STROOPS>` (required)

## Account configuration

### `set-options`
Set account flags, thresholds, signers, home domain, inflation destination. All flags optional.
- `--inflation-dest <ACCOUNT>`
- `--master-weight`, `--low-threshold`, `--med-threshold`, `--high-threshold` (0-255)
- `--home-domain <DOMAIN>`
- `--signer <SIGNER>`, `--signer-weight <0-255>` (weight 0 removes)
- Issuer auth flags (set/clear pairs): `--set-required`/`--clear-required`, `--set-revocable`/`--clear-revocable`, `--set-clawback-enabled`/`--clear-clawback-enabled`, `--set-immutable`/`--clear-immutable`

### `manage-data`
Set, modify, or delete an account data entry (key/value).
- `--data-name <NAME>` (required, up to 64 bytes)
- `--data-value <HEX>` (up to 64 bytes hex; omit to delete the entry)

### `bump-sequence`
Bump the account's sequence number to invalidate older transactions.
- `--bump-to <SEQ>` (required)

## Sponsorship

### `begin-sponsoring-future-reserves`
Begin sponsoring future reserves for another account.
- `--sponsored-id <ACCOUNT>` (required)

### `end-sponsoring-future-reserves`
End sponsoring future reserves. No operation-specific flags (uses `--source-account`).

### `revoke-sponsorship`
Revoke sponsorship of a ledger entry or signer.
- `--account-id <ACCOUNT>` (required for all sponsorship types)
- Pick one target: `--asset <ASSET>` (trustline), `--data-name <NAME>` (data entry), `--offer-id <ID>` (offer), `--liquidity-pool-id <ID>`, `--claimable-balance-id <ID>`, or `--signer-key <KEY>` (signer sponsorship)
