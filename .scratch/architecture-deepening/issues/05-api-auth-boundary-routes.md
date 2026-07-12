Status: done

## Parent

`/private/var/folders/tk/rmcx56cx2gz8r5jfsgdrnn5m0000gn/T/architecture-review-20260712-142520.html` (StarTip architecture review)

# Create the API auth boundary and migrate protected routes

## What to build

A shared `AuthContext` boundary with `requireAuthedProfile` and
`requireAuthedCreator` helpers. Migrate all protected routes to use the boundary
for session validation, profile loading, and ownership checks. The inline
`getUser` + profile-loading snippets remain in the route files until ticket 06.

## Acceptance criteria

- [ ] The `AuthContext` boundary module exists with unit tests.
- [ ] The boundary returns a typed auth context or a typed auth error.
- [ ] All protected routes delegate to the boundary and return the same
      401/404/403 errors.
- [ ] Existing route tests still pass.

## Blocked by

- None — can start immediately.
