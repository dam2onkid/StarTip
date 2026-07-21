## Shared (`packages/shared`) rules

Shared TypeScript libraries used by `apps/web` and `apps/worker`. Read `packages/shared/CONTEXT.md` before making domain changes.

### Exports

- Maintain the `exports` map in `package.json`. New submodules must be added explicitly.
- Keep packages framework-agnostic. Do not import React, Next.js, Hono, or any app-specific dependency here.

### Amounts

- Do not hardcode token `decimals`. Accept `decimals` as a parameter in any amount conversion helper.
- If an amount conversion is used by both `apps/web` and `apps/worker`, consider moving the pure helper here.

### Testing

- Unit tests: `vitest run`
- Type check: `tsc --noEmit`
