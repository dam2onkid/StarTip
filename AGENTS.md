## Agent skills

### Issue tracker

Issues and PRDs live as markdown files under `.scratch/<scope-index>-<feature-slug>/`.
See `docs/agents/issue-tracker.md` for tracker conventions and `docs/agents/scopes.md` for the scope index.

### Triage labels

Canonical triage roles plus a local `done` status. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context: `CONTEXT-MAP.md` at the repo root points to per-context `CONTEXT.md` files.
See `docs/agents/domain.md`.

### Scoped agent rules

This repo uses per-scope `AGENT.md` files.
Devin CLI loads the workspace root `AGENTS.md` at session start, then discovers subdirectory `AGENT.md` files lazily when it accesses files in that directory.
This keeps each session focused on the package or app it is touching.

The scope index and `AGENT.md` locations live in `docs/agents/scopes.md`.

## Design system

Before changing UI, read `DESIGN.md` and follow its design tokens, component guidance, typography,
spacing, radius, and color choices. Treat it as the source of truth for visual decisions unless the
user explicitly asks for a different direction.

## Writing style

Avoid using em dashes ("—"). Prefer commas, colons, parentheses, or splitting into separate sentences.
