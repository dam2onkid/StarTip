# Scoped agent rules

This repo uses per-scope `AGENT.md` files.
Devin CLI loads the workspace root `AGENTS.md` at session start, then discovers subdirectory `AGENT.md` files lazily when it accesses files in that directory.
This keeps the agent focused on the package or app it is working in.

## Scope index

| Scope index | Scope | Path | `AGENT.md` |
|---|---|---|---|
| `web` | Web app | `apps/web/` | `apps/web/AGENT.md` |
| `wrk` | Worker | `apps/worker/` | `apps/worker/AGENT.md` |
| `shr` | Shared packages | `packages/shared/` | `packages/shared/AGENT.md` |
| `cnt` | Contracts | `contracts/` | `contracts/AGENT.md` |

## Naming features in `.scratch/`

Every feature directory under `.scratch/` uses the scope index as a prefix.

Format:

```
.scratch/<scope-index>-<feature-slug>/
```

- `<scope-index>` is the short code from the table above.
- `<feature-slug>` is kebab-case and describes the feature.
- Do not use underscores, spaces, or uppercase.
- Do not add a scope index that does not appear in the table without updating this file.

Examples:

- `.scratch/web-landing-page/`
- `.scratch/wrk-tip-indexer/`
- `.scratch/cnt-donation-router-v2/`

### Cross-scope features

Pick the scope that owns the primary user-facing behavior or the surface that consumes most of the implementation work.
If no scope clearly owns it, use `cross-<feature-slug>/` and list all affected scopes in the PRD's `Affected scopes:` frontmatter.

### Grandfathered directories

A few existing `.scratch/` directories were created before this convention and do not have a scope prefix.
Leave them as-is. All new features must follow the prefix rule.

## Adding a new scope

1. Choose a new 2-4 letter scope index that does not collide with existing ones.
2. Create `<scope>/AGENT.md` with rules specific to that scope.
3. Add a row to the table above.
4. Add the scope to `CONTEXT-MAP.md` and create `<scope>/CONTEXT.md` if it introduces a new bounded context.
