## Web app (`apps/web`) rules

This is the Next.js frontend. Read `apps/web/CONTEXT.md` before making domain changes.

### UI

- Follow the global `DESIGN.md` for design tokens, typography, spacing, radius, and color.
- Use Tailwind CSS v4 and the shared components in `apps/web/src/components/ui/`.
- Any button or form submit that triggers an API call, a wallet signature, an on-chain transaction, or any other async work must use the `Button` component's `loading` prop.
- Set the `loading` / `busy` state before the first `await`, clear it when the work settles (success or error), and keep the visible label stable.
- `Button` renders an animated spinner prefix and auto-disables, so the caller only needs to flip one boolean.

### Amounts

- Stellar Soroban token amounts are i128 integers in raw units (the smallest divisible unit, `10^decimals` per display unit).
- Use `displayToRawAmount(display, decimals)` from `apps/web/src/lib/stellar/amount.ts` when a human types an amount.
- Use `rawToDisplayAmount(raw, decimals)` from `apps/web/src/lib/stellar/amount.ts` when rendering a stored/contract amount to a human.
- The token `decimals` comes from the on-chain `decimals()` call, mirrored into the `tokens` table by the indexer. When no allowlist entry (or no `decimals`) is available, fall back to `decimals = 0`.
- Never render a raw amount directly to a human.
- The `shouldShowAlert` filter in `apps/web/src/lib/overlay/settings.ts` compares raw `amount` against raw `minAmountRaw`. Keep that boundary raw-on-raw; only convert to display at the render boundary.

### Supabase Realtime

- A `postgres_changes` channel only delivers events for tables that belong to the `supabase_realtime` publication.
- When adding a Realtime subscription to a new table, add a migration that runs `alter publication supabase_realtime add table public.<table>` (guard with a `pg_publication_tables` check so it is idempotent). See `supabase/migrations/20260706123043_realtime_publication.sql` for the pattern.

### Testing

- Unit tests: `vitest run`
- E2E tests: `playwright test`
- Type check: `tsc --noEmit`
