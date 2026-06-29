Status: done

## Parent

`.scratch/web-auth-wallet-integration/PRD.md`

## What to build

The first end-to-end vertical slice: a Visitor requests a magic link, clicks it,
a Profile row is autocreated, and they land on an authed `/dashboard`. This
establishes the Supabase Auth session model and the `profiles` schema that every
subsequent slice builds on.

Write the `profiles` migration under `web/supabase/migrations/`. The schema
(PRD §Supabase schema):

```
id              uuid PK, default gen_random_uuid()
user_id         uuid, FK auth.users(id), UNIQUE, NOT NULL
display_name    text, NOT NULL, default 'Anonymous'
avatar_url      text, nullable
bio             text, nullable
handle          text, nullable, UNIQUE
handle_hash     bytea, nullable
owner_address   text, nullable
wallet_link_nonce           text, nullable
wallet_link_nonce_expires_at timestamptz, nullable
payout_address  text, nullable
onchain_registered        bool, NOT NULL, default false
paused         bool, NOT NULL, default false
created_at      timestamptz, NOT NULL, default now()
onchain_registered_at     timestamptz, nullable
```

`handle_hash` is `bytea` (32 bytes raw), not text hex. A trigger on
`auth.users` INSERT autocreates a `profiles` row with `display_name = 'Anonymous'`
and all Creator fields NULL. RLS: owner (`auth.uid() = profiles.user_id`) can
SELECT all columns of their row and UPDATE only `display_name`, `avatar_url`,
`bio`, `wallet_link_nonce`, `wallet_link_nonce_expires_at`. Public can SELECT
`handle`, `display_name`, `avatar_url`, `bio`, `onchain_registered` only for
rows where `onchain_registered = true AND paused = false`. All other columns
(`owner_address`, `payout_address`, `user_id`, nonces) are owner-only.
INSERT/DELETE denied to clients (service role only).

Magic link is the sole login mechanism. `/login` renders an email input and a
"Send magic link" action that calls `signInWithOtp({ email, options: {
emailRedirectTo: /auth/callback?next=... } })`. The `next` param is captured
from the query string and forwarded through the redirect.

`/auth/callback` route handler exchanges the code for a session, then redirects:
if `next` is present and not `/login`, redirect to `next`; otherwise redirect to
`/dashboard`.

The middleware `updateSession` is updated so the `isAuthRoute` check covers
`/dashboard` only (there is no `/onboarding`). Unauthenticated `/dashboard`
requests redirect to `/login`. Public routes are not gated. The Supabase session
is refreshed on every request.

`/dashboard` renders an authed shell with two tabs (Donor, Creator) as
placeholders and a logout action. The Donor tab placeholder includes a "Become a
Creator" action (no behavior yet, just the affordance so the onboarding slice
can wire it). The shell reads the session via `lib/supabase/server.ts` and
redirects to `/login` if absent.

Tests: Vitest for the `/auth/callback` handler (mocked Supabase, asserts
exchange + redirect logic including `next` param) and the updated middleware
(mocked `createServerClient`, asserts `/dashboard` redirect and public-route
pass-through). Playwright E2E for the login flow (stubbed Supabase Auth, asserts
email input, magic link send, callback redirect to `/dashboard`, logout).
Supabase RLS tests via the local stack (`supabase db reset` + SQL assertions as
anon, authenticated user A, authenticated user B) covering owner SELECT/UPDATE,
public SELECT of public fields only, and denied INSERT/DELETE.

`pnpm build`, `pnpm typecheck`, and `pnpm test` must pass.

## Acceptance criteria

- [ ] `profiles` migration exists with the schema above; `handle_hash` is
      `bytea`.
- [ ] A trigger autocreates a `profiles` row on `auth.users` INSERT with
      `display_name = 'Anonymous'` and Creator fields NULL.
- [ ] RLS policies enforce owner SELECT (all columns) + UPDATE (identity +
      nonce fields only), public SELECT (public fields, registered + not paused
      only), and deny client INSERT/DELETE.
- [ ] `/login` renders an email input and sends a magic link with
      `emailRedirectTo` carrying `next`.
- [ ] `/auth/callback` exchanges the code and redirects to `next` (if present
      and not `/login`) else `/dashboard`.
- [ ] Middleware refreshes the session, redirects unauthenticated `/dashboard`
      to `/login`, and passes public routes through.
- [ ] `/dashboard` renders an authed shell with Donor + Creator tab
      placeholders, a "Become a Creator" affordance, and logout; redirects to
      `/login` when no session.
- [ ] Vitest covers `/auth/callback` redirect logic and middleware gating.
- [ ] Playwright covers the login -> dashboard -> logout flow.
- [ ] Supabase RLS tests pass for owner, public, and denied paths.
- [ ] `pnpm build`, `pnpm typecheck`, `pnpm test` pass.

## Blocked by

- `.scratch/web-auth-wallet-integration/issues/01-restructure-routes-to-revised-shape.md`
