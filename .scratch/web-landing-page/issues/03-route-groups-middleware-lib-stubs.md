Status: ready-for-agent

## Parent

`.scratch/web-landing-page/PRD.md`

## What to build

Scaffold the remaining route groups, the Supabase middleware guard, the shared
library modules (Supabase and Stellar client splits), the API route handler
stubs, and the Supabase CLI init. This issue can run in parallel with the landing
page content and motion issues because it touches different files.

Create the `(auth)` route group under `src/app/`. Add a `layout.tsx` that
renders a minimal dashboard navigation shell placeholder (a nav bar with the
StarTip wordmark and placeholder links; no real routing logic yet). Add
`onboarding/page.tsx` as a placeholder ("Onboarding coming soon"). Add the
`dashboard/` directory with `page.tsx` and the six sub-route placeholders from
spec §12.2 (`profile`, `wallet`, `payout`, `overlay`, `donations`). Each
placeholder renders a simple heading. These exist so the route shape is locked
for subsequent feature PRDs.

Create the `api/` directory under `src/app/` with route handler stubs for every
endpoint in spec §12.3: `creators/route.ts`, `wallet/link/route.ts`,
`donations/prepare/route.ts`, `donations/confirm/route.ts`,
`indexer/poll/route.ts`, and `creators/[handle]/route.ts`. Each stub exports the
appropriate HTTP method handler(s) (POST for the mutation routes, GET for the
read routes) and returns a 501 status with a JSON body
`{ error: "not_implemented" }`. This locks the API contract shape without
implementing behavior.

Create `src/middleware.ts` using `@supabase/ssr`'s `updateSession` helper to
refresh the Supabase JWT on every request. The matcher covers `(auth)/*` and
excludes `api/`, `_next/`, and static assets. Unauthenticated requests to
`(auth)/*` redirect to a placeholder login URL constant. The Supabase Auth
client is wired via the server module but no login UI is implemented here.

Create `src/lib/supabase/server.ts` exporting `createServerClient` (for RSC and
route handlers, reading cookies via `next/headers`). Create
`src/lib/supabase/client.ts` exporting `createBrowserClient` (for client
components; overlay will use the anon key, dashboard will use the user JWT).
Both read their URL and keys from the validated env module established in issue
01.

Create `src/lib/stellar/server.ts` exporting `rpc` and `horizon` instances for
server-side use, marked with `import "server-only"` so it cannot be bundled into
a client component. Create `src/lib/stellar/client.ts` exporting the network
passphrase, contract ID, and a lazily-initialized `rpc` instance for client-side
transaction building. Both read from the validated env module.

Initialize the Supabase CLI at `web/supabase/` via `supabase init`, producing
`config.toml` and an empty `migrations/` directory. No migrations are written.
The local stack is not started in this issue.

Install the `@supabase/ssr` and `@stellar/stellar-sdk` dependencies. Do not
install the Stellar Wallets Kit or Framer Motion or Lenis in this issue; those
belong to the onboarding/donate and motion issues respectively.

`pnpm build` and `pnpm typecheck` must pass with all stubs and lib modules in
place.

## Acceptance criteria

- [ ] `src/app/(auth)/layout.tsx` renders a minimal dashboard nav shell
      placeholder.
- [ ] `src/app/(auth)/onboarding/page.tsx` renders a placeholder.
- [ ] `src/app/(auth)/dashboard/page.tsx` and the five sub-route placeholders
      (`profile`, `wallet`, `payout`, `overlay`, `donations`) render
      placeholders.
- [ ] `src/app/api/` contains six route handler stubs, each returning 501 with
      `{ error: "not_implemented" }`.
- [ ] `src/middleware.ts` refreshes the Supabase session and redirects
      unauthenticated `(auth)/*` requests to a placeholder login URL; the
      matcher excludes `api/`, `_next/`, and static assets.
- [ ] `src/lib/supabase/server.ts` exports `createServerClient`; reads cookies
      via `next/headers`.
- [ ] `src/lib/supabase/client.ts` exports `createBrowserClient`.
- [ ] `src/lib/stellar/server.ts` exports `rpc` and `horizon`; marked
      `server-only`.
- [ ] `src/lib/stellar/client.ts` exports network passphrase, contract ID, and
      a lazily-initialized `rpc` instance.
- [ ] `web/supabase/config.toml` and an empty `web/supabase/migrations/`
      directory exist.
- [ ] `@supabase/ssr` and `@stellar/stellar-sdk` are installed; Stellar Wallets
      Kit, Framer Motion, and Lenis are NOT installed.
- [ ] `pnpm build` passes.
- [ ] `pnpm typecheck` passes.

## Blocked by

- `.scratch/web-landing-page/issues/01-scaffold-dark-theme-hero.md`
