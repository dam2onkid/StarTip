Status: done

# PRD — DonationRouter smart contract

## Problem Statement

A Creator on StarTip needs to receive Donations from Donors in a way that is trust-minimized: the platform cannot silently change the payout address, skim an uncapped fee, or invent a Donation that never settled. A Donor needs to know that the asset they send actually reaches the Creator's Payout Address (minus a bounded Platform Fee to the Treasury) and that an immutable on-chain event proves the Donation happened, so the off-chain Overlay, dashboard, and indexer can reconcile against a record the platform cannot forge.

Today none of this exists. The repo has a validated spec (`docs/specs.md` §9), a domain glossary (`CONTEXT.md`), and four ADRs, but no contract code. Without the contract there is no settlement layer, no on-chain proof, and nothing for the off-chain confirm/indexer paths to verify against.

## Solution

Implement and ship the **DonationRouter**, a Soroban smart contract in Rust that is the sole financial settlement layer for StarTip (ADR-0001). The contract holds only trust-minimized state: a Creator registry keyed by Creator ID Hash, a Platform Fee config with an immutable cap, a Treasury address, an Admin role, a Token Allowlist, a `paused` emergency switch, and per-Donation settlement that splits the fee to the Treasury and the net to the Creator's Payout Address, then emits a `DonationReceived` event carrying the Donation ID Hash.

The contract is deployed to Stellar Testnet. The Admin (via the `stellar` CLI, not the web app) configures fee, treasury, pause, and the Token Allowlist post-deploy. Creators self-register on-chain; Donors call `donate()` with a single signature that authorizes the nested token transfers via Soroban auth propagation (no `approve`/`transfer_from`). Full message, donor name, and all product data stay off-chain in Supabase (ADR-0001).

This PRD covers only the contract crate, its tests, and its build/deploy artifacts. The off-chain indexer, confirm path, and Supabase schema are separate features that consume this contract's events.

## User Stories

1. As a Donor, I want to donate a Stellar asset to a Creator through a single on-chain transaction, so that I do not have to sign multiple approvals.
2. As a Donor, I want the contract to reject my donation if the Creator is not registered, so that my asset is not sent to a nonexistent recipient.
3. As a Donor, I want the contract to reject my donation if the Creator is inactive, so that I do not send funds to someone who has paused receiving.
4. As a Donor, I want the contract to reject my donation if the contract is paused, so that I am not sending funds during an emergency halt.
5. As a Donor, I want the contract to reject my donation if the token is not on the Token Allowlist, so that a malicious token contract cannot produce a fake DonationReceived event.
6. As a Donor, I want the contract to reject a zero-amount donation, so that no empty Donation event is emitted.
7. As a Donor, I want the contract to emit a DonationReceived event with the Donation ID Hash, so that the off-chain indexer can link the on-chain settlement to my message and donor name.
8. As a Donor, I want the DonationReceived event to record the fee amount and net amount separately, so that the dashboard can show the exact split.
9. As a Creator, I want to self-register on-chain with my Handle hash and a Payout Address, so that the platform does not need to hold an admin key to onboard me.
10. As a Creator, I want my owner address to be the invoker of `register_creator`, so that the on-chain registry proves I control the wallet that owns the Creator entry.
11. As a Creator, I want to update my Payout Address on-chain, so that I can rotate where my Donations land without re-registering.
12. As a Creator, I want only my owner address to be able to update my Payout Address, so that nobody else can redirect my funds.
13. As a Creator, I want to pause myself (set `active = false`), so that I can stop receiving Donations while I am offline or reconfiguring.
14. As a Creator, I want to unpause myself, so that I can resume receiving Donations without admin involvement.
15. As a Creator, I want my registry entry's storage TTL to be extended every time I am touched, so that my entry does not archive after 30 days of inactivity.
16. As an Admin, I want to set the Treasury address, so that the Platform Fee flows to the platform's wallet.
17. As an Admin, I want to set the Platform Fee in basis points, so that I can tune the platform take rate.
18. As an Admin, I want the contract to reject a fee above `max_fee_bps`, so that a compromised admin key cannot drain Creators.
19. As an Admin, I want `max_fee_bps` to be immutable after construction, so that the cap cannot be raised later to bypass the trust anchor.
20. As an Admin, I want to pause the entire contract, so that I can halt all Donations during an incident.
21. As an Admin, I want to unpause the contract, so that Donations can resume after an incident is resolved.
22. As an Admin, I want to add a token to the Token Allowlist, so that Donors can donate that asset.
23. As an Admin, I want to remove a token from the Token Allowlist, so that I can delist a compromised or deprecated asset.
24. As an Admin, I want to force-pause a malicious Creator, so that I can stop Donations to a scam Creator without waiting for the Creator to self-pause.
25. As an Admin, I want to transfer the Admin role to a new address, so that I can rotate the admin key before demos or recover from a compromised key.
26. As an Admin, I want only the current Admin to be able to transfer the Admin role, so that nobody else can seize control.
27. As the off-chain indexer, I want every state change to emit a typed event (CreatorRegistered, CreatorPayoutUpdated, CreatorActiveChanged, PlatformFeeUpdated, TreasuryUpdated, PausedChanged, AdminUpdated, TokenAllowlistUpdated, DonationReceived), so that I can mirror on-chain state into Supabase.
28. As the off-chain confirm path, I want reverts to use a typed error enum, so that I can decode the revert reason and surface it to the Donor.
29. As the off-chain confirm path, I want the DonationReceived event to carry the creator_id_hash, token, amount, fee_amount, net_amount, treasury_address, payout_address, and donation_id_hash, so that I can verify the event matches the pending row before marking confirmed.
30. As a developer, I want the contract to live in a `contracts/` Cargo workspace separate from the Next.js app, so that the Rust and JS toolchains do not interfere.
31. As a developer, I want the contract pinned to `soroban-sdk = 26.1.0`, so that the build is reproducible and CAP-0058 `__constructor` is supported.
32. As a developer, I want to build the contract with `stellar contract build`, so that the WASM artifact is produced for deployment.
33. As a developer, I want to deploy the contract with `stellar contract deploy` passing constructor args, so that initialization is atomic at deploy time.
34. As a developer, I want the contract to skip zero-amount token transfers, so that a zero Platform Fee does not produce zero-transfer events or revert on token contracts that reject zero amounts.
35. As a developer, I want the contract to use a packed `Config` struct in instance storage, so that admin operations are one read and one write.
36. As a developer, I want the contract to use a `DataKey::Creator(BytesN<32>)` enum variant for the persistent map, so that the storage key scheme is explicit and extensible.
37. As a developer, I want unit tests that cover every donate logic branch and every authorization rule, so that I can refactor without breaking settlement.
38. As a developer, I want one integration test that deploys the built WASM to a local network and runs register then add_token then donate end-to-end, so that I catch build, deploy, and real SAC token regressions.

## Implementation Decisions

- **Crate layout.** A new `contracts/` Cargo workspace at the repo root containing the `donation-router` crate. The crate is a `cdylib` producing Soroban WASM. The Next.js app remains at the repo root and is unaffected.

- **SDK baseline (ADR-0004).** `soroban-sdk = 26.1.0`, MSRV 1.91.0. The `testutils` feature is a dev-dependency for unit tests. Release profile uses `opt-level = "z"`, `overflow-checks = true`, `lto = true`, `panic = "abort"` per Soroban best practice.

- **Initialization.** CAP-0058 `__constructor(admin, treasury_address, platform_fee_bps, max_fee_bps)`. No guarded `initialize()`. The constructor validates `platform_fee_bps <= max_fee_bps` and stores the packed `Config` (with `paused = false` and an empty `token_allowlist`). `max_fee_bps` has no setter and is immutable for the life of the contract.

- **Storage layout.** Instance storage holds a single packed `Config` struct: `admin`, `treasury_address`, `platform_fee_bps`, `max_fee_bps`, `paused`, `token_allowlist: Vec<Address>`. Persistent storage uses a `DataKey` enum with one variant, `Creator(BytesN<32>)`, mapping Creator ID Hash to a `Creator { owner, payout_address, active }` struct. No other storage. No per-Donation storage, no seen-hash set.

- **Token validation (ADR-0004).** `donate()` checks `token_allowlist.contains(token)` and reverts with `TokenNotAllowed` if absent. Two admin functions maintain the list: `add_token(Address)` and `remove_token(Address)`, each emitting `TokenAllowlistUpdated { token, added }`. The Admin must add the XLM SAC and USDC testnet SAC addresses post-deploy before any donation can succeed.

- **Authorization.** Every state-changing function calls `require_auth()` on the authorized address, except `set_creator_active` which uses OR-authorization: it calls the non-panicking `requires_auth()` on both the Creator's owner and the Admin, and reverts with `Unauthorized` only if neither returns true. Soroban binds the authorization to the current call arguments, so the OR-auth cannot be replayed for a different Creator.

- **Donate logic.** `donate(creator_id_hash, token, amount, donation_id_hash)` requires donor auth, checks `!paused`, creator exists, creator active, `amount > 0`, token in allowlist, computes `fee_amount = amount * platform_fee_bps / 10_000` and `net_amount = amount - fee_amount`, skips the fee transfer when `fee_amount == 0` and the net transfer when `net_amount == 0`, extends the TTL of the Creator entry and instance storage, then emits `DonationReceived`. Transfers use `token::Client::transfer` with the donor as the from-address; Soroban auth propagation covers the nested calls so the donor signs once.

- **No payout validation (ADR-0004).** `register_creator` and `update_creator_payout` do not validate `payout_address`. A Creator who sets it to the contract address will permanently strand funds (no withdrawal function exists). This is a documented trade-off; the off-chain UI must warn the Creator before submission.

- **No on-chain replay tracking (ADR-0004).** The contract does not track seen `donation_id_hash` values. Replay protection is off-chain via the `donations` table unique constraint. On-chain tracking would be unbounded storage growth.

- **TTL strategy (ADR-0004).** Every code path that reads or writes a Creator entry extends its persistent TTL to ~518400 ledgers (30 days): `register_creator`, `update_creator_payout`, `set_creator_active`, `donate()`. Instance storage TTL is extended on every config-touching call. No manual bump function.

- **Admin rotation (ADR-0004).** `set_admin(new_admin)` guarded by `require_auth(current_admin)`, emitting `AdminUpdated { old_admin, new_admin }`. Single-step (no propose/accept).

- **Error handling (ADR-0004).** A typed `#[contracterror]` enum: `Unauthorized`, `Paused`, `CreatorNotFound`, `CreatorInactive`, `InvalidAmount`, `TokenNotAllowed`, `FeeCapExceeded`, `AlreadyRegistered`. No bare `panic!` with strings.

- **Events.** Nine events: `DonationReceived`, `CreatorRegistered`, `CreatorPayoutUpdated`, `CreatorActiveChanged`, `PlatformFeeUpdated`, `TreasuryUpdated`, `PausedChanged`, `AdminUpdated`, `TokenAllowlistUpdated`. All use `#[contractevent]` structs so the indexer can decode them.

- **Public function surface.** `__constructor`, `register_creator`, `update_creator_payout`, `set_creator_active`, `set_admin`, `set_treasury_address`, `set_platform_fee_bps`, `set_paused`, `add_token`, `remove_token`, `donate`. No getters are required for the MVP (the indexer reads events; the CLI can read storage directly), but read-only helpers may be added if tests need them.

- **Build and deploy.** `stellar contract build` produces the WASM. `stellar contract deploy --wasm <path> --source <admin> --network testnet -- --admin <addr> --treasury_address <addr> --platform_fee_bps <n> --max_fee_bps 500` initializes atomically. Post-deploy the Admin runs `add_token` for the XLM SAC and USDC testnet SAC addresses via the CLI.

## Testing Decisions

- **What makes a good test here.** Tests exercise the contract's public API through its observable behavior: does the call succeed or revert, which error code, what event is emitted, what storage state results. They do not assert on internal helper functions or storage key encoding. A test that needed to know the internal `DataKey` enum shape to verify behavior would be testing implementation details.

- **Primary seam: `soroban-sdk` testutils, public API.** All unit tests live in a `#[cfg(test)]` module in the crate and use `Env::default()`, `register_test_contract`, mock addresses (with `Address::simulate_auth_for` or testutils auth), and a mock token contract (the SDK ships a `MockAuth` and a token test contract) to drive `donate()`. This seam covers: constructor validation, every donate logic branch (paused, missing creator, inactive creator, zero amount, token not allowed, fee split math, zero-fee skip, zero-net skip), every authorization rule (owner-only payout update, OR-auth for set_creator_active, admin-only config, donor auth for donate), event emission (all nine events with correct fields), and TTL extension behavior.

- **Secondary seam: one integration test on a local network.** A single test (Rust, using `soroban-env-host` testutils against a local `stellar network container`, or a shell script invoking `stellar contract deploy` and `stellar contract invoke` against a local network) that builds the WASM, deploys with constructor args, runs `add_token` for a real SAC token, `register_creator`, and `donate`, and asserts the `DonationReceived` event is visible via `stellar event`. This seam exists only to catch build, deploy, CLI encoding, and real SAC token regressions. Behavior coverage lives in the primary seam.

- **Prior art.** No Rust tests exist in this repo yet (the contract is greenfield). The `soroban` skill documents the testutils patterns and the local-network integration pattern; the SDK's own example contracts (the auth example, the increment contract) are the reference shape for unit tests, and the SDK's integration test harness is the reference shape for the secondary seam.

- **Test scope boundary.** Fuzz, property, and mutation tests are out of scope for the MVP (ADR-0004). The unit suite is deterministic and covers the enumerated branches above.

## Out of Scope

- The off-chain indexer (`/api/indexer/poll`), the confirm path (`/api/donations/confirm`), and the Supabase `donations` schema. Those consume this contract's events but are separate features.
- The Creator onboarding frontend, wallet link flow, and Supabase Auth integration (ADR-0002).
- The donate page UI, asset selector, trustline guidance, and Stellar Wallets Kit integration (ADR-0002, specs §7.6).
- The Overlay, dashboard, and moderation UI.
- Admin panel UI. Admin operations run via the `stellar` CLI (ADR-0001).
- Contract upgradeability. The MVP ships a non-upgradeable contract; a future factory/proxy pattern is post-MVP.
- Two-step admin transfer (propose/accept). Single-step is locked in (ADR-0004).
- On-chain replay tracking for `donation_id_hash` (ADR-0004).
- Payout address validation on-chain (ADR-0004).
- Fuzz, property, and mutation tests (ADR-0004).
- Mainnet deployment. Testnet only for the MVP.
- A `withdraw` / rescue function for funds stranded by a bad `payout_address`. Documented risk, no mitigation on-chain.

## Further Notes

- This PRD is the implementation of `docs/specs.md` §9 as refined by ADR-0004. The spec and ADR are the source of truth for behavior; this PRD does not re-litigate them.
- Domain vocabulary follows `CONTEXT.md`: Creator, Donor, Handle, Creator ID Hash, Donation, Donation ID Hash, Payout Address, Treasury, Admin, Platform Fee, DonationRouter, Token Allowlist, Overlay, Moderation Status. The PRD uses these terms as defined there.
- The contract has no read-only getters in the MVP function list. If the indexer or CLI needs to read state directly during development, `stellar contract invoke --view` can read storage, or read-only helpers can be added later without affecting the event contract the off-chain paths depend on.
- Post-deploy runbook step (not part of this PRD's code, but a dependency for any donation to succeed): the Admin must call `add_token` for the XLM SAC contract address and the USDC testnet SAC contract address on Testnet. These addresses are network-specific and should be documented in the deploy runbook when the off-chain feature that consumes this contract is built.
- The contract's event schema is the integration contract with the off-chain indexer and confirm path. Any change to event field names, order, or types after deployment breaks the off-chain consumers and is effectively a redeploy.