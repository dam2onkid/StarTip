"use client";

import * as React from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { buildDonateUrl } from "@/lib/creators/qr";

/**
 * QR code for a Creator's donate URL.
 *
 * Renders an SVG QR encoding the absolute `/creator/[handle]/donate` URL so a
 * Donor scanning it lands directly on the donate page for the correct Creator.
 * The URL is built by the pure {@link buildDonateUrl} helper, the single source
 * of truth shared with the dashboard QR card.
 *
 * The origin is resolved from `window.location.origin` on the client (in a
 * `useEffect`, so SSR and the first client render share the empty-origin state
 * and there is no hydration mismatch). On the very first paint the QR encodes a
 * root-relative URL; it is repainted with the absolute URL the moment the
 * effect runs, which is immediate after hydration.
 *
 * When `downloadable` is set, a "Download PNG" button serializes the rendered
 * SVG to a high-resolution (1024x1024) PNG and triggers a file download, so a
 * Creator can save a crisp image for OBS or print. The SVG-to-PNG path keeps
 * the QR sharp at any size because the QR is generated as vector geometry, then
 * rasterized onto a large canvas, rather than upscaling a small bitmap.
 *
 * Visual language follows DESIGN.md: the QR sits on a white surface (required
 * for reliable scanning) with the Graphite neutral as the foreground color, and
 * the Download PNG button is a ghost/outline variant so it never competes with
 * the single lime CTA on the route.
 */
export function QrCode({
  handle,
  origin,
  downloadable = false,
  showUrl = false,
  fileName,
  className,
}: {
  handle: string;
  /** Explicit origin. When omitted, resolves from `window.location.origin`. */
  origin?: string;
  /** Render the "Download PNG" button. */
  downloadable?: boolean;
  /** Render the encoded donate URL as readable text below the QR. */
  showUrl?: boolean;
  /** Override the downloaded file name (defaults to `startip-<handle>-donate.png`). */
  fileName?: string;
  className?: string;
}) {
  const [resolvedOrigin, setResolvedOrigin] = React.useState(origin ?? "");
  React.useEffect(() => {
    if (origin) return;
    if (typeof window !== "undefined") {
      setResolvedOrigin(window.location.origin);
    }
  }, [origin]);

  const url = buildDonateUrl(handle, resolvedOrigin);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [downloading, setDownloading] = React.useState(false);

  async function downloadPng() {
    const svg = svgRef.current;
    if (!svg) return;
    setDownloading(true);
    try {
      const xml = new XMLSerializer().serializeToString(svg);
      const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
      const svgUrl = URL.createObjectURL(svgBlob);
      try {
        const img = await loadImage(svgUrl);
        const size = 1024;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D context unavailable.");
        // QR codes scan best on a white background; fill before drawing.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        const pngUrl = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = pngUrl;
        a.download = fileName ?? `startip-${handle}-donate.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } finally {
        URL.revokeObjectURL(svgUrl);
      }
    } catch {
      // Swallow: a failed download should not crash the dashboard. The button
      // returns to its resting state so the creator can retry.
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className={className} data-testid="qr-code">
      <div className="inline-flex rounded-lg bg-white p-3 ring-1 ring-foreground/10">
        <QRCodeSVG
          ref={svgRef}
          value={url}
          size={240}
          level="M"
          marginSize={2}
          bgColor="#ffffff"
          fgColor="#0E1013"
          title={`Donate to ${handle} on StarTip`}
        />
      </div>
      {showUrl ? (
        <p
          className="mt-3 font-mono text-xs text-muted-foreground break-all"
          data-testid="donate-url"
        >
          {url}
        </p>
      ) : null}
      {downloadable ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={downloadPng}
          loading={downloading}
          disabled={downloading}
          className="mt-3 self-start"
          data-testid="qr-download-png"
        >
          Download PNG
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Load an `HTMLImageElement` from a URL, resolving once it has decoded so the
 * caller can draw it onto a canvas. Rejects on decode/load error.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not render QR image."));
    img.src = src;
  });
}
