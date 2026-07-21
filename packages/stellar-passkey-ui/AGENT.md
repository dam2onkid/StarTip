## Stellar passkey UI (`packages/stellar-passkey-ui`) rules

Reusable passkey UI components and logic. Read `packages/stellar-passkey-ui/CONTEXT.md` before making domain changes.

### Scope

- Keep this package focused on passkey presentation and helpers.
- Do not add application-specific business logic from `apps/web`.

### Testing

- Unit tests: `vitest run`
- Type check: `tsc --noEmit`
