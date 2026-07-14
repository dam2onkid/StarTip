"use client";

import type { OnboardingState } from "@/lib/onboarding/state";

/** The four-gate progress indicator. The active gate and those before it are
 * lit; the rest are dim. Rendered as a horizontal track with a fill that
 * advances to the active gate, so progress is legible at a glance. */
export function GateStepper({ state }: { state: OnboardingState }) {
  const order: OnboardingState[] = [
    "profile_pending",
    "wallet_pending",
    "onchain_pending",
    "active",
  ];
  const labels: Record<OnboardingState, string> = {
    profile_pending: "Handle",
    wallet_pending: "Wallet",
    onchain_pending: "On-chain",
    active: "Active",
  };
  const activeIdx = order.indexOf(state);
  const progress = (activeIdx / (order.length - 1)) * 100;
  return (
    <div
      className="creator-gate-stepper rounded-xl border border-foreground/8 bg-foreground/[0.02] p-4"
      data-testid="gate-stepper"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground/80">
          Onboarding
        </span>
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground/80">
          {activeIdx + 1} / {order.length}
        </span>
      </div>
      {/* Progress track: a thin neutral rail with a lime fill to the active gate. */}
      <div
        aria-hidden
        className="relative mb-4 h-1 w-full overflow-hidden rounded-full bg-foreground/8"
      >
        <div
          className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-primary/70 transition-transform duration-500 ease-out"
          data-testid="gate-stepper-bar"
          style={{ transform: `scaleX(${progress / 100})` }}
        />
      </div>
      <ol className="grid grid-cols-2 gap-3 text-xs text-muted-foreground sm:flex sm:items-center sm:justify-between">
        {order.map((s, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          return (
            <li key={s} className="flex min-w-0 items-center gap-2">
              <span
                className={
                  "inline-flex h-6 w-6 items-center justify-center rounded-full border text-[0.65rem] transition-colors " +
                  (active
                    ? "border-primary/60 text-primary bg-primary/10"
                    : done
                      ? "border-foreground/30 text-foreground bg-foreground/5"
                      : "border-foreground/10 text-muted-foreground/50")
                }
                aria-current={active ? "step" : undefined}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={active ? "truncate text-foreground" : "truncate"}>
                {labels[s]}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
