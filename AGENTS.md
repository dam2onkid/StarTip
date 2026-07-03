## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles, using default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Design system

Before changing UI, read `DESIGN.md` and follow its design tokens, component guidance, typography,
spacing, radius, and color choices. Treat it as the source of truth for visual decisions unless the
user explicitly asks for a different direction.

## Writing style

Avoid using em dashes ("—"). Prefer commas, colons, parentheses, or splitting into separate sentences.

## Loading state on async buttons

Any button (or form submit) that triggers an API call, a wallet signature, an
on-chain transaction, or any other async work must show a loading state on the
button itself while the work is in flight, so the app always feels alive.

Concretely: set a `loading` / `busy` state before the first `await`, clear it
when the work settles (success or error), and pass it to the shared
`Button` component's `loading` prop. `Button` renders an animated spinner
prefix and auto-disables, so the caller only needs to flip one boolean. Keep
the visible label stable (e.g. "Sign in" stays "Sign in" with a spinner) so
accessible names and tests that query by button name do not break.

For multi-phase flows (e.g. prepare -> submit -> confirm), a phase-driven
label swap ("Preparing..." / "Submitting..." / "Confirming...") is acceptable
and already used by the donate form. The key requirement is that the button is
visibly disabled and signals activity for the entire duration of the async
work, including the wait for an indexer / Realtime mirror when the UI blocks
on it.
