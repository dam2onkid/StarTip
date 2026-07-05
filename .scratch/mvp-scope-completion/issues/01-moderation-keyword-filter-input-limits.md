Status: done

## Parent

`.scratch/mvp-scope-completion/PRD.md`

## What to build

The moderation and input-validation vertical slice. A donation whose message
or donor name contains a banned keyword is auto-hidden at insert time (set
`moderation_status = 'auto_hidden'`) so it never briefly flashes on the
Overlay before the Creator manually hides it. A donation whose `message` or
`donor_name` exceeds the length limit is rejected at the prepare boundary with
a clear 400 error before any on-chain transaction is built.

Two new pure server-only library modules hold the policy:

- `lib/donations/moderation.ts`: `classifyMessage(message, donorName) ->
  'visible' | 'auto_hidden'`. Case-insensitive substring match against a fixed
  short MVP banned-words array. Single source of truth.
- `lib/donations/validation.ts`: `validateMessage(message) ->
  { ok: true } | { ok: false, error }` and `validateDonorName(name)` with the
  same shape. Limits: `message` <= 280 chars, `donor_name` <= 32 chars.

These are wired into every insert path:

- `prepareDonation`: call `validateMessage` / `validateDonorName` before the
  pending row insert; return `400 invalid_message` / `invalid_donor_name` on
  failure. Call `classifyMessage` and set the pending row's
  `moderation_status` accordingly.
- `confirmDonation` (no-existing-row insert fallback): call `classifyMessage`
  for the message. On the promote-existing-row path, re-run `classifyMessage`
  only if the row is still `pending` (so a prepare-time `auto_hidden` is not
  overwritten).
- Indexer orphan-donation insert fallback: no message is available, so the
  row is `visible` with `donor_name = "Anonymous"`; no change to the
  promote-existing-row path.

The on-chain Donation is never blocked by moderation; only the Overlay
visibility is affected. The Creator can still see `auto_hidden` rows in their
moderation list and un-hide a false positive.

## Acceptance criteria

- [x] `classifyMessage` returns `'auto_hidden'` for a message or donor name
      containing a banned keyword (case-insensitive substring match), and
      `'visible'` for clean input, including empty/null message.
- [x] `validateMessage` rejects input over 280 chars; `validateDonorName`
      rejects input over 32 chars; both accept valid input.
- [x] `POST /api/donations/prepare` returns `400 invalid_message` /
      `invalid_donor_name` for over-limit input, before any pending row is
      inserted.
- [x] A prepare call with a banned keyword inserts a pending row with
      `moderation_status = 'auto_hidden'`.
- [x] The confirm no-existing-row insert path sets `moderation_status` via
      `classifyMessage`.
- [x] The confirm promote-existing-row path does not overwrite a
      prepare-time `auto_hidden` with `visible`.
- [x] vitest covers `moderation.ts` and `validation.ts` as pure functions.
- [x] `prepare.test.ts` and `confirm.test.ts` are extended to assert the new
      behavior.
- [x] `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

None - can start immediately
