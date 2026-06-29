Status: ready-for-agent

## Parent

`.scratch/web-auth-wallet-integration/PRD.md`

## What to build

Prefactor the web scaffold so the real auth + wallet flows can land on the
revised route structure. The `web-landing-page` PRD locked a route shape that
this PRD revises: the six `(auth)/dashboard/*` sub-routes and `(auth)/onboarding`
are collapsed into a single tabbed `/dashboard`, and the public discovery
surfaces become top-level routes. Restructure the scaffold to match before any
behavior is built on top of it.

Collapse the existing `(auth)/dashboard/{profile,wallet,payout,overlay,donations}`
pages and `(auth)/onboarding` into a single `/dashboard` page that renders two
tab placeholders (Donor tab, Creator tab) with no real content yet. The
`(auth)` route group is retained for `/dashboard` only.

Add public route placeholders (each a minimal page rendering a heading, no
behavior): `/login`, `/creator/explore`, `/creator/[handle]`,
`/creator/[handle]/donate`, `/overlay/[handle]`, `/docs`. These are not gated by
auth.

Add the missing API stub `api/wallet/link/challenge/route.ts` (POST, returns
501 `{ error: "not_implemented" }`) alongside the existing
`api/wallet/link/route.ts`. The other API stubs already exist and stay as 501
stubs.

Update `src/middleware.ts` so the `updateSession` matcher gates `/dashboard`
only. Public routes (`/creator/*`, `/overlay/*`, `/docs`, `/login`) are not
redirected to login. The matcher still excludes `api/`, `_next/`, and static
assets.

Update the existing scaffold tests (`src/app/(auth)/auth.test.tsx`,
`src/app/api/routes.test.ts`) so they assert on the new route shape (single
`/dashboard`, no `onboarding`, no `dashboard/*` sub-routes, public route
placeholders present, `/api/wallet/link/challenge` stub present). The
`lib/supabase/middleware.test.ts` matcher assertions are updated to the new
gating.

`pnpm build`, `pnpm typecheck`, and `pnpm test` must pass.

## Acceptance criteria

- [ ] `(auth)/dashboard` is a single page with two tab placeholders (Donor,
      Creator); the five `dashboard/*` sub-route pages and `(auth)/onboarding`
      are removed.
- [ ] Public route placeholders exist: `/login`, `/creator/explore`,
      `/creator/[handle]`, `/creator/[handle]/donate`, `/overlay/[handle]`,
      `/docs`.
- [ ] `api/wallet/link/challenge/route.ts` exists and returns 501
      `{ error: "not_implemented" }` on POST.
- [ ] Middleware gates `/dashboard` only; public routes are not redirected to
      login; `api/`, `_next/`, and static assets are excluded.
- [ ] `auth.test.tsx` and `routes.test.ts` assert on the new route shape and
      pass.
- [ ] `middleware.test.ts` matcher assertions match the new gating and pass.
- [ ] `pnpm build` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test` passes.

## Blocked by

- None - can start immediately
