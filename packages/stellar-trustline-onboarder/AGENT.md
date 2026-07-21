## Stellar trustline onboarder (`packages/stellar-trustline-onboarder`) rules

Trustline establishment and onboarding helpers. Read `packages/stellar-trustline-onboarder/CONTEXT.md` before making domain changes.

### Scope

- Keep this package focused on trustline/asset onboarding.
- Do not add application-specific business logic from `apps/web`.

### Testing

- Unit tests: `vitest run`
- Type check: `tsc --noEmit`
