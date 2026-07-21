## Worker (`apps/worker`) rules

This is the Hono/Node.js backend worker. Read `apps/worker/CONTEXT.md` before making domain changes.

### API

- Use Hono for routing and middleware.
- Validate input with Zod.
- Keep routes small and delegate to shared helpers from `@startip/shared` where possible.

### Amounts

- Stellar Soroban token amounts are i128 integers in raw units (the smallest divisible unit, `10^decimals` per display unit).
- Use raw amounts for all internal logic and contract calls.
- Convert to display units only at response boundaries, and only when the response is meant for a human.

### Testing

- Unit tests: `vitest run`
- Type check: `tsc --noEmit`
