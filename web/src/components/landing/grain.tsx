/**
 * Fixed photographic grain + atmospheric depth overlays
 * (premium-frontend-ui skill §4). Pure CSS, server-safe, pointer-events: none.
 * The grain sits above content but below the cursor; the atmosphere sits behind
 * content. Both are decorative and hidden from assistive tech via aria-hidden.
 */
export function Grain() {
  return (
    <>
      <div className="atmosphere" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
    </>
  );
}
