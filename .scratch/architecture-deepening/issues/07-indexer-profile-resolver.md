Status: done

## Parent

`/private/var/folders/tk/rmcx56cx2gz8r5jfsgdrnn5m0000gn/T/architecture-review-20260712-142520.html` (StarTip architecture review)

# Create the Creator profile resolver and migrate indexer and verify paths

## What to build

A `CreatorProfileResolver` module and a shared `bytea` formatting helper in
`packages/shared`. Migrate the indexer dispatch handlers to use the resolver for
looking up a `Creator` by `handle_hash`. Migrate the donation verify path to use
the shared `bytea` helper.

## Acceptance criteria

- [ ] `resolveProfileByHandleHash` exists and hides the `handle_hash` formatting
      and `profiles` lookup.
- [ ] A shared `bytea` helper exists and is used by both the indexer and the
      verify path.
- [ ] All indexer dispatch handlers resolve the creator profile through the new
      module.
- [ ] The donation verify path uses the shared `bytea` helper.
- [ ] Indexer poll and donation verify tests still pass.

## Blocked by

- None - can start immediately.
