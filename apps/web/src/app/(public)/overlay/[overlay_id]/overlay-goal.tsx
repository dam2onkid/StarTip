"use client";

import * as React from "react";
import { motion, useMotionValue } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { rawToDisplayAmount } from "@/lib/stellar/amount";

const POSITION_KEY = "startip-overlay-goal-position";

export interface OverlayGoal {
  /** Raw i128 numeric string: the sum of the goal's-token donations. */
  current: string;
  /** Raw i128 numeric string: the target amount. */
  target: string;
  /** Integer percentage of the target reached, clamped to 0-100. */
  pct: number;
  /** SAC contract address for the goal's token. */
  token: string;
  /** Token symbol for display. */
  symbol: string;
  /** Token decimals for converting raw amounts to display units. */
  decimals: number;
}

export interface OverlayGoalProps {
  goal: OverlayGoal;
}

/**
 * Overlay donation goal progress card. Renders in a fixed corner so it stays
 * visible while donation alerts play in the center. Current and target are
 * converted to display units using the token's decimals. The progress bar is
 * powered by shadcn/ui Progress, and the whole card can be dragged to
 * reposition it in the OBS browser source. The dragged offset is persisted to
 * localStorage so the position survives a page reload.
 */
export function OverlayGoal({ goal }: OverlayGoalProps) {
  const current = rawToDisplayAmount(goal.current, goal.decimals);
  const target = rawToDisplayAmount(goal.target, goal.decimals);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(POSITION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          x.set(parsed.x);
          y.set(parsed.y);
        }
      }
    } catch {
      // Ignore malformed or missing localStorage entries.
    }
  }, [x, y]);

  const handleDragEnd = React.useCallback(() => {
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify({ x: x.get(), y: y.get() }));
    } catch {
      // Ignore localStorage write errors (e.g. private mode).
    }
  }, [x, y]);

  return (
    <motion.div
      data-testid="overlay-goal"
      drag
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      style={{ x, y }}
      className="fixed top-6 left-6 z-10 w-72 cursor-move rounded-lg bg-card p-5 ring-1 ring-foreground/10 backdrop-blur-md select-none"
    >
      <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        Donation goal
      </h2>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span
          className="font-mono text-2xl font-semibold text-foreground"
          data-testid="overlay-goal-pct"
        >
          {goal.pct}%
        </span>
        <span className="text-xs text-muted-foreground">
          <span data-testid="overlay-goal-current">{current}</span>
          {" / "}
          <span data-testid="overlay-goal-target">{target}</span>
          {goal.symbol && ` ${goal.symbol}`}
        </span>
      </div>
      <Progress
        value={goal.pct}
        className="mt-3 h-2 bg-foreground/8 [&_[data-slot=progress-indicator]]:bg-primary/70"
        data-testid="overlay-goal-bar"
      />
    </motion.div>
  );
}
