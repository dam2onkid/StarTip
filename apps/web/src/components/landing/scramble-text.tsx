"use client";

import * as React from "react";
import { useInView } from "framer-motion";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

const DEFAULT_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomChar(charset: string) {
  return charset[Math.floor(Math.random() * charset.length)] ?? "";
}

function scramble(text: string, charset: string) {
  return text
    .split("")
    .map((char) => (char === " " ? char : randomChar(charset)))
    .join("");
}

interface ScrambleTextProps {
  text: string;
  className?: string;
  disabled?: boolean;
  duration?: number;
  delay?: number;
  charset?: string;
}

export function ScrambleText({
  text,
  className,
  disabled: disabledProp,
  duration = 1.2,
  delay = 0,
  charset = DEFAULT_CHARSET,
}: ScrambleTextProps) {
  const reduced = usePrefersReducedMotion();
  const disabled = disabledProp || reduced;
  const inViewRef = React.useRef<HTMLSpanElement>(null);
  const visibleRef = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(inViewRef, { once: true, amount: 0.5 });

  React.useLayoutEffect(() => {
    const visible = visibleRef.current;
    if (!visible) return;

    if (disabled) {
      visible.textContent = text;
      return;
    }

    if (!inView) {
      visible.textContent = text;
      return;
    }

    visible.textContent = scramble(text, charset);

    const startTime = performance.now();
    const length = text.length;
    const lockOffset = length > 0 ? duration / length : 0;

    let rafId = 0;
    const tick = (now: number) => {
      const elapsed = now - startTime;
      let out = "";
      for (let i = 0; i < length; i++) {
        const target = text[i];
        if (target === " " || target === "\n" || target === "\t") {
          out += target;
        } else if (elapsed >= i * lockOffset + delay) {
          out += target;
        } else {
          out += randomChar(charset);
        }
      }
      visible.textContent = out;

      if (elapsed < duration + delay) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [disabled, inView, text, duration, delay, charset]);

  return (
    <span ref={inViewRef} className={className}>
      <span ref={visibleRef} aria-hidden={!disabled} />
      {!disabled && <span className="sr-only">{text}</span>}
    </span>
  );
}
