# 03 - Turborepo setup, move web/ to apps/web/, add contracts/ shim

Status: Untriaged
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
