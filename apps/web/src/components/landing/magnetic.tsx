"use client";

import * as React from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  type HTMLMotionProps,
} from "framer-motion";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

/**
 * Magnetic wrapper (premium-frontend-ui skill §3.2). Translates its child
 * toward the pointer based on the distance from the pointer to the element
 * center, with a spring for a smooth, weighted return. Only `transform` is
 * animated.
 *
 * Gating: the magnetic pull is disabled on touch devices and when the user has
 * set `prefers-reduced-motion: reduce`, rendering a plain wrapper instead.
 */
export type MagneticProps = Omit<HTMLMotionProps<"div">, "children"> & {
  /** 0–1, how strongly the element follows the pointer. */
  strength?: number;
  children?: React.ReactNode;
};

export function Magnetic({
  strength = 0.35,
  children,
  className,
  ...rest
}: MagneticProps) {
  const reduced = usePrefersReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 220, damping: 18, mass: 0.4 });

  React.useEffect(() => {
    if (reduced) return;
    const finePointer = window.matchMedia(
      "(hover: hover) and (pointer: fine)",
    ).matches;
    if (!finePointer) return;

    const el = ref.current;
    if (!el) return;

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      x.set((e.clientX - cx) * strength);
      y.set((e.clientY - cy) * strength);
    };
    const onLeave = () => {
      x.set(0);
      y.set(0);
    };

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [reduced, strength, x, y]);

  if (reduced) {
    return (
      <div className={className} {...(rest as React.ComponentProps<"div">)}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      style={{ x: sx, y: sy, willChange: "transform" }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
