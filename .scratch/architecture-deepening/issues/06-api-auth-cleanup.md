Status: done

## Parent

`/private/var/folders/tk/rmcx56cx2gz8r5jfsgdrnn5m0000gn/T/architecture-review-20260712-142520.html` (StarTip architecture review)

# Remove inline auth duplication from API routes

## What to build

Delete the old inline `getUser` + profile-loading snippets from the protected
routes that were migrated to the `AuthContext` boundary. The auth boundary is the
single seam for session and profile access.

## Acceptance criteria

- [x] No protected route duplicates the `createServerClient` + `getUser` + load
      profile sequence.
- [x] All protected routes still return the correct 401/404/403 errors.
- [x] Existing route tests still pass.

## Blocked by

- 05 - Create the API auth boundary and migrate protected routes
