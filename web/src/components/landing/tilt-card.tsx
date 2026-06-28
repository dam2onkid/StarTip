"use client";

import * as React from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * Dimensional hover card (premium-frontend-ui skill §3.2). On fine-pointer
 * devices the card tilts in 3D toward the pointer (rotateX/rotateY) and lifts
 * its content on translateZ, giving the surface tactile weight. Only
 * `transform` is animated.
 *
 * Gating: on touch devices or when `prefers-reduced-motion: reduce` is set, the
 * card renders as a plain div with no motion values or listeners.
 */
export type TiltCardProps = {
  children: React.ReactNode;
  className?: string;
  /** Max tilt in degrees. */
  max?: number;
  style?: React.CSSProperties;
  "data-cursor"?: string;
};

export function TiltCard({
  children,
  className,
  max = 8,
  ...rest
}: TiltCardProps) {
  const reduced = usePrefersReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 200, damping: 20 });
  const sy = useSpring(py, { stiffness: 200, damping: 20 });
  const rotateX = useTransform(sy, [0, 1], [max, -max]);
  const rotateY = useTransform(sx, [0, 1], [-max, max]);

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
      px.set((e.clientX - rect.left) / rect.width);
      py.set((e.clientY - rect.top) / rect.height);
    };
    const onLeave = () => {
      px.set(0.5);
      py.set(0.5);
    };
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [reduced, px, py]);

  if (reduced) {
    return (
      <div className={cn(className)} style={rest.style} data-cursor={rest["data-cursor"]}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      className={cn(className)}
      data-cursor={rest["data-cursor"]}
      style={{ ...rest.style, rotateX, rotateY, transformStyle: "preserve-3d", willChange: "transform" }}
    >
      {children}
    </motion.div>
  );
}
