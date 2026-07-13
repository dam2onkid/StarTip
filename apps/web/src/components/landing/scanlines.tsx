/**
 * Subtle CRT scanline overlay. Pure CSS, pointer-events: none, sits above the
 * grain/atmosphere but below content so the terminal background reads as one
 * cohesive layer without hurting readability.
 */
export function Scanlines() {
  return <div className="scanlines" aria-hidden="true" />;
}
