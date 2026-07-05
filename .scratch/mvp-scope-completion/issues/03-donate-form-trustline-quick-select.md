Status: done

## Parent

`.scratch/mvp-scope-completion/PRD.md`

## What to build

The donate-form vertical slice: trustline guidance and amount quick-select.
Both modify the donate form, so they ship as one slice to avoid two agents
touching the same file.

**Trustline guidance:** before building `donate()`, the donate form checks
whether the Donor's wallet has a trustline to the selected non-native token
(via the RPC `getAccount` response, which includes trustlines). If the Donor
lacks a trustline, the form tells them and builds a two-op transaction
(`change_trust` then `donate()`) for the Donor to sign once. If
`change_trust` fails at simulation, the form surfaces a `trustline_failed`
error and does not submit `donate()`. The trustline step is skipped entirely
for native XLM and for any token the Donor already holds a trustline/balance
for.

**Amount quick-select:** the donate form gets quick-select buttons (1, 5, 10)
alongside the custom amount field. Tapping a button sets the custom field to
that value and highlights the button. Editing the custom field after tapping a
quick-select button clears the highlight.

A new pure library module holds the trustline decision logic:

- `lib/donations/trustline.ts`: `needsTrustline(token, hasTrustline) ->
  boolean` (returns `false` for native XLM SAC and for a token the Donor
  already has a trustline to, `true` for a non-native token with no
  trustline) and `buildChangeTrustOp(token, donorAddress) -> xdr.Operation`.

The existing `__STARTIP_DONATE_STUB__` E2E seam is extended to cover the
two-op `change_trust` + `donate()` path.

## Acceptance criteria

- [ ] `needsTrustline` returns `false` for native XLM and for a token the
      Donor already has a trustline to, `true` for a non-native token with no
      trustline.
- [ ] `buildChangeTrustOp` produces a valid `ChangeTrust` op XDR.
- [ ] The donate form renders quick-select buttons (1, 5, 10) and a custom
      amount field.
- [ ] Tapping a quick-select button sets the custom field to that value and
      highlights the button; editing the custom field clears the highlight.
- [ ] When the Donor picks a non-native token they lack a trustline to, the
      form tells them a trustline is required.
- [ ] When `needsTrustline` is true, the form builds a two-op
      `change_trust` + `donate()` transaction for the Donor to sign.
- [ ] When `needsTrustline` is false (native XLM or existing trustline), the
      form skips the trustline step and builds `donate()` only.
- [ ] If `change_trust` fails at simulation, the form surfaces a
      `trustline_failed` error and does not submit `donate()`.
- [ ] vitest covers `trustline.ts` as a pure function.
- [ ] `donate-form.test.tsx` is extended to assert quick-select behavior,
      trustline guidance rendering, and the `trustline_failed` error.
- [ ] A Playwright E2E covers the `change_trust` + `donate()` two-op path via
      the `__STARTIP_DONATE_STUB__` seam.
- [ ] `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

None - can start immediately
