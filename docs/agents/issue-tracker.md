# Issue tracker: Local Markdown

Issues and PRDs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<scope-index>-<feature-slug>/` (see `docs/agents/scopes.md` for the scope index and naming rules)
- The PRD is `.scratch/<scope-index>-<feature-slug>/PRD.md`
- Implementation issues are `.scratch/<scope-index>-<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading
- For cross-scope features, use `cross-<feature-slug>/` and list affected scopes in the PRD frontmatter

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<scope-index>-<feature-slug>/` (creating the directory if needed), using the scope index from `docs/agents/scopes.md`.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.
