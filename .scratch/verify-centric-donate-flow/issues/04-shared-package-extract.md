# 04 - Extract packages/shared/ from apps/web/src/lib/

Status: done
Role: backend

## Task

Create `packages/shared/` as `@startip/shared` and move server-only library
code out of `apps/web/src/lib/` so both `apps/web/` and `apps/worker/` can
import it without duplication.

## Changes

### Create `packages/shared/`

```
packages/shared/
  package.json
  tsconfig.json
  src/
    donations/
      confirm.ts       # moved from apps/web/src/lib/donations/confirm.ts
      moderation.ts    # moved
      validation.ts    # moved
    indexer/
      dispatch.ts      # moved
    stellar/
      server.ts        # moved, drop `import "server-only"`
      token.ts         # moved
    supabase/
      service.ts       # moved
```

### `packages/shared/package.json`

```json
{
  "name": "@startip/shared",
  "private": true,
  "type": "module",
  "exports": {
    "./donations/*": "./src/donations/*.ts",
    "./indexer/*": "./src/indexer/*.ts",
    "./stellar/*": "./src/stellar/*.ts",
    "./supabase/*": "./src/supabase/*.ts"
  },
  "dependencies": {
    "@stellar/stellar-sdk": "^16.0.1",
    "@supabase/supabase-js": "^2.108.2",
    "zod": "^4.4.3"
  }
}
```

(Match versions to `apps/web/package.json`.)

### `packages/shared/tsconfig.json`

Extend the root or a shared base. `moduleResolution: "bundler"` or
`"nodenext"` to support the `exports` map.

### Move files

Move these from `apps/web/src/lib/` to `packages/shared/src/`:

| From                      | To                        |
| ------------------------- | ------------------------- |
| `donations/confirm.ts`    | `donations/confirm.ts`    |
| `donations/moderation.ts` | `donations/moderation.ts` |
| `donations/validation.ts` | `donations/validation.ts` |
| `indexer/dispatch.ts`     | `indexer/dispatch.ts`     |
| `stellar/server.ts`       | `stellar/server.ts`       |
| `stellar/token.ts`        | `stellar/token.ts`        |
| `supabase/service.ts`     | `supabase/service.ts`     |

Move the corresponding `.test.ts` files too (they test the moved code).

### Drop `import "server-only"`

`stellar/server.ts` has `import "server-only"` at the top. This is a Next.js
guard that throws if imported into a client component. In `packages/shared/`,
the guard is meaningless (worker is not Next.js). Remove the import. The
caller (Next.js route or worker) is responsible for not importing server
code into client bundles.

### Update `apps/web/` imports

In `apps/web/src/`, replace imports of moved files:

```ts
// Before
import { confirmDonation } from "@/lib/donations/confirm";
import { processPoll } from "@/lib/indexer/dispatch";

// After
import { confirmDonation } from "@startip/shared/donations/confirm";
import { processPoll } from "@startip/shared/indexer/dispatch";
```

Files to update (grep `@/lib/donations/confirm`, `@/lib/donations/moderation`,
`@/lib/donations/validation`, `@/lib/indexer/dispatch`, `@/lib/stellar/server`,
`@/lib/stellar/token`, `@/lib/supabase/service`):

- `apps/web/src/app/api/donations/confirm/route.ts` (will be replaced by
  verify proxy in issue 06, but update import for now if it stays briefly)
- `apps/web/src/app/api/indexer/poll/route.ts`
- `apps/web/src/lib/donations/prepare.ts` (will be deleted in issue 06, skip)
- Any other files referencing the moved modules

### Add `@startip/shared` to `apps/web/package.json`

```json
"dependencies": {
  "@startip/shared": "workspace:*",
  ...
}
```

## What stays in `apps/web/src/lib/`

Browser-only or Next.js-context-dependent code:

- `donations/donate.ts` (wallet sign, browser stubs)
- `donations/trustline-check.ts`, `donations/trustline.ts`
- `stellar/client.ts` (browser RPC, env-derived)
- `supabase/client.ts`, `supabase/middleware.ts`, `supabase/server.ts`
  (Next.js SSR cookie context)
- `wallet/`, `onboarding/`, `nav/`, `donor/`, `creators/`, `env.ts`, `utils.ts`

## Verification

- `turbo run typecheck` passes.
- `turbo run test` passes (moved test files run from shared package).
- `apps/web/` dev server boots, donate page loads, indexer poll route works.

## Dependencies

- Issue 03 (Turborepo setup) must land first.
