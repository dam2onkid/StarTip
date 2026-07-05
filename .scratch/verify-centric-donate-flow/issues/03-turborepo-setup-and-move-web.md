# 03 - Turborepo setup, move web/ to apps/web/, add contracts/ shim

Status: done
Role: infra

## Task

Adopt Turborepo with the `apps/` + `packages/` convention per ADR-0006.
Move `web/` to `apps/web/`, add a `package.json` shim for `contracts/` so
`turbo run build` includes the Rust contract.

## Changes

### Move `web/` to `apps/web/`

```bash
git mv web apps/web
```

### Update `.gitignore`

All `web/...` entries become `apps/web/...`:
- `web/.next/` -> `apps/web/.next/`
- `web/out/` -> `apps/web/out/`
- `web/build/` -> `apps/web/build/`
- `web/dist/` -> `apps/web/dist/`
- `web/.env` -> `apps/web/.env`
- `web/.env*.local` -> `apps/web/.env*.local`
- `web/next-env.d.ts` -> `apps/web/next-env.d.ts`
- `web/test-results/` -> `apps/web/test-results/`
- `web/playwright-report/` -> `apps/web/playwright-report/`
- `web/playwright/.cache/` -> `apps/web/playwright/.cache/`
- `web/.e2e-local-creds.md` -> `apps/web/.e2e-local-creds.md`

Also add `contracts/node_modules/` (empty, from pnpm workspace scan).

### `pnpm-workspace.yaml`

```yaml
packages:
  - apps/*
  - packages/*
  - contracts
```

### Root `package.json`

```json
{
  "name": "startip",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "lint": "turbo run lint",
    "dev": "turbo run dev",
    "contracts:build": "cd contracts && make build",
    "contracts:test": "cd contracts && make test",
    "contracts:integration": "cd contracts && make integration-test"
  },
  "devDependencies": {
    "turbo": "^2.5.0"
  }
}
```

(Pin a version published at least 7 days ago at install time.)

### `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "target/wasm32-unknown-unknown/release/*.wasm"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

### `contracts/package.json` (shim, no JS deps)

```json
{
  "name": "@startip/contracts",
  "private": true,
  "scripts": {
    "build": "make build",
    "test": "make test",
    "integration-test": "make integration-test"
  }
}
```

## Verification

- `pnpm install` at root succeeds, links workspace packages.
- `turbo run build` builds contracts (WASM) + web (Next.js).
- `turbo run typecheck` typechecks all TS packages.
- `turbo run test` runs web vitest + cargo test.
- `apps/web/` dev server boots: `cd apps/web && pnpm dev`.
- Playwright config (`apps/web/playwright.config.ts`) uses relative
  `testDir: "./tests"` and is portable without changes.

## Dependencies

- None. This is foundational; issues 04, 05, 06 depend on this.

## Comments

- Review (2026-07-05): `pnpm-workspace.yaml` currently only lists `web`, so
  this is a clean starting point. No conflicts found. Triaged
  `ready-for-agent`.
- Done (2026-07-05): All changes applied. `web/` moved to `apps/web/` via
  `git mv`, `.gitignore` paths updated, `pnpm-workspace.yaml` now lists
  `apps/*`, `packages/*`, `contracts`. Root `package.json` orchestrates via
  Turbo with `packageManager: pnpm@11.5.0` (required by turbo 2.10 to
  resolve workspaces). `turbo.json` created. `contracts/package.json` shim
  added. Turbo pinned to `2.10.0` (published 2026-06-24, 11 days old,
  satisfies the 7-day rule). Verification: `pnpm install` links 3 workspace
  projects; `turbo run build` builds contracts WASM
  (`target/wasm32v1-none/release/donation_router.wasm`, 15372 bytes) + web
  Next.js production build; `turbo run typecheck` passes (web tsc);
  `turbo run test` passes (web vitest 435 passed + contracts cargo test);
  `cd apps/web && pnpm dev` boots and `curl localhost:3000` returns 200.
  Deviation: `turbo.json` `outputs` includes both
  `target/wasm32v1-none/release/*.wasm` (actual stellar 27.0.0 target) and
  `target/wasm32-unknown-unknown/release/*.wasm` (the spec's path) since
  the stellar CLI now builds to `wasm32v1-none`. Pre-existing lint errors
  in `apps/web/tests/*.spec.ts` are out of scope for this infra issue.
