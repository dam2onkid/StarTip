Status: ready-for-agent

## Parent

`.scratch/web-unified-nav/PRD.md`

## What to build

Make the nav's right cluster auth-aware. The root layout resolves the Supabase
session server-side (via the existing `lib/supabase/server.ts`
`createServerClient` + `auth.getUser` pattern) and passes auth state plus the
caller's Profile identity (display_name, email, avatar_url) to the nav. The nav
renders one of two right clusters alongside the Donate Wallet connector from
slice 2:

**Unauthenticated:** the existing "Become a Creator" CTA, retargeted to
`/signup` (it currently links to `/login`). The CTA remains a single Tertiary
action per `DESIGN.md`.

**Authenticated:** the CTA is replaced by a static notification bell and an
avatar menu. The bell is an icon-only button that opens an empty-state dropdown
("No notifications yet"). The avatar menu is a button showing the caller's
avatar (or a fallback when `avatar_url` is null) that opens a dropdown with a
header (display_name + email) and two items:

- **Dashboard** — links to `/dashboard`.
- **Logout** — calls Supabase Auth `signOut` via the browser client, then
  navigates to `/login`. Reuse the logout logic from the existing
  `LogoutButton` (`app/(auth)/dashboard/logout-button.tsx`); do not duplicate the
  signOut call in a second place. The existing `LogoutButton` component may be
  refactored so its `onLogout` handler is shared by both the dashboard and the
  nav avatar menu.

The left cluster (Logo + Discover) and the Donate Wallet connector (slice 2) are
unchanged across both states.

E2E covers: the unauthenticated right cluster shows the "Become a Creator" CTA
pointing at `/signup`; the authenticated right cluster shows the bell and avatar
menu (no CTA); the avatar menu opens, shows display_name + email, and the
"Dashboard" link points at `/dashboard`; "Logout" clears the session and
navigates to `/login`.

`pnpm build`, `pnpm typecheck`, and `pnpm test` must pass.

## Acceptance criteria

- [ ] The root layout resolves the Supabase session server-side and passes auth
      state + Profile identity (display_name, email, avatar_url) to the nav.
- [ ] Unauthenticated right cluster shows the "Become a Creator" CTA linking to
      `/signup` (alongside the Donate Wallet connector).
- [ ] Authenticated right cluster replaces the CTA with a notification bell and
      an avatar menu (alongside the Donate Wallet connector).
- [ ] The notification bell opens an empty-state dropdown.
- [ ] The avatar menu shows the caller's avatar (or a fallback) and a dropdown
      with a display_name + email header.
- [ ] The avatar menu's "Dashboard" item links to `/dashboard`.
- [ ] The avatar menu's "Logout" item reuses the existing `LogoutButton` logic
      (shared signOut handler, not duplicated), clears the session, and
      navigates to `/login`.
- [ ] E2E asserts the unauth CTA target, the auth avatar menu contents, the
      Dashboard link, and the logout flow.
- [ ] `pnpm build`, `pnpm typecheck`, `pnpm test` pass.

## Blocked by

- `.scratch/web-unified-nav/issues/01-hoist-nav-isolate-overlay-finalize-left-links.md`
- `.scratch/web-unified-nav/issues/02-donate-wallet-connector-in-nav.md`
