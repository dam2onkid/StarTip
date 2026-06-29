/**
 * `/login` — public magic link login page placeholder. Both Donor and Creator
 * share this single login entry. No behavior yet; the Supabase magic link form
 * lands in a later issue.
 */
export default function LoginPage() {
  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-4 px-6 py-24">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Login</h1>
      <p className="text-muted-foreground">
        Magic link login form placeholder. Enter your email to receive a
        sign-in link.
      </p>
    </section>
  );
}
