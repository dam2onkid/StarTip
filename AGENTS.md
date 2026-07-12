## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical triage roles plus a local `done` status. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Design system

Before changing UI, read `DESIGN.md` and follow its design tokens, component guidance, typography,
spacing, radius, and color choices. Treat it as the source of truth for visual decisions unless the
user explicitly asks for a different direction.

## Writing style

Avoid using em dashes ("—"). Prefer commas, colons, parentheses, or splitting into separate sentences.

## Loading state on async buttons

Any button (or form submit) that triggers an API call, a wallet signature, an
on-chain transaction, or any other async work must show a loading state on the
button itself while the work is in flight, so the app always feels alive.

Concretely: set a `loading` / `busy` state before the first `await`, clear it
when the work settles (success or error), and pass it to the shared
`Button` component's `loading` prop. `Button` renders an animated spinner
prefix and auto-disables, so the caller only needs to flip one boolean. Keep
the visible label stable (e.g. "Sign in" stays "Sign in" with a spinner) so
accessible names and tests that query by button name do not break.

For multi-phase flows (e.g. prepare -> submit -> confirm), a phase-driven
label swap ("Preparing..." / "Submitting..." / "Confirming...") is acceptable
and already used by the donate form. The key requirement is that the button is
visibly disabled and signals activity for the entire duration of the async
work, including the wait for an indexer / Realtime mirror when the UI blocks
on it.

## Display vs raw token amounts

Stellar Soroban token amounts are i128 integers in **raw units** (the smallest
divisible unit, `10^decimals` per display unit). The contract, the
`donations.amount` column, and the `donation_goals.target_amount` column all
store raw numeric strings (e.g. `90000000` for 9 XLM at 7 decimals). The UI
must never render a raw amount directly to a human; it must convert to display
units first.

Concretely: use the shared helpers in `apps/web/src/lib/stellar/amount.ts`:

- `displayToRawAmount(display, decimals)` when the human types an amount
  (donate form, donation goal editor).
- `rawToDisplayAmount(raw, decimals)` when rendering a stored/contract amount
  to a human (overlay alert, donation goal card, donation history).

The token's `decimals` comes from the on-chain `decimals()` call, mirrored into
the `tokens` table by the indexer. When no allowlist entry (or no `decimals`)
is available, fall back to `decimals = 0`, which renders the raw amount
unchanged. Never hardcode a decimals value per token; always read it from the
`tokens` row so an issuer changing decimals does not silently break the UI.

The `shouldShowAlert` filter in `lib/overlay/settings.ts` compares **raw**
`amount` against raw `minAmountRaw` (the server resolves `min_amount` from
display to raw using the same decimals). Keep that boundary raw-on-raw; only
convert to display at the render boundary.

## Supabase Realtime publication

A `postgres_changes` channel only delivers events for tables that belong to the
`supabase_realtime` publication. The publication starts empty, so any new table
that the UI subscribes to (e.g. `donations` for the overlay, `profiles` for the
dashboard creator tab) must be added to it via a migration. Without the
publication entry the channel subscribes successfully but never receives
events, and changes only appear on a full page refresh, which is easy to
misdiagnose as a "Realtime bug".

When adding a Realtime subscription to a new table, add a migration that runs
`alter publication supabase_realtime add table public.<table>` (guard with a
`pg_publication_tables` check so it is idempotent). See
`supabase/migrations/20260706123043_realtime_publication.sql` for the pattern.
