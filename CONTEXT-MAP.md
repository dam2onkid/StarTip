# Context Map

This repo has multiple bounded contexts. Each context has its own `CONTEXT.md` file and may have its own `docs/adr/` directory. The system-wide glossary and ADRs live at the repo root.

| Context | `CONTEXT.md` path | ADRs path |
|---|---|---|
| System / root | `./CONTEXT.md` | `./docs/adr/` |
| Web app | `./apps/web/CONTEXT.md` | `./apps/web/docs/adr/` |
| Worker | `./apps/worker/CONTEXT.md` | `./apps/worker/docs/adr/` |
| Shared packages | `./packages/shared/CONTEXT.md` | `./packages/shared/docs/adr/` |
| Contracts | `./contracts/CONTEXT.md` | `./contracts/docs/adr/` |

Start with the system `CONTEXT.md`, then read the `CONTEXT.md` for the context you are about to work in.
