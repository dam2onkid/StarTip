Status: ready-for-agent

## Parent

`.scratch/mvp-scope-completion/PRD.md`

## What to build

The QR code vertical slice. A Creator has a QR code encoding their full donate
URL (`/creator/[handle]/donate`) on their dashboard and on their public
Creator profile, with a "Download PNG" button so they can save a
high-resolution image for OBS or print. A Donor scanning the QR lands directly
on the donate page for the correct Creator.

A new pure library module holds the URL logic:

- `lib/creators/qr.ts`: `buildDonateUrl(handle, origin) -> string`. Pure,
  client-safe. Returns the absolute donate URL for the handle.

A client-side QR library (e.g. `qrcode` or `qrcode.react`) is added as a
dependency. The dashboard active Creator panel gets a QR card that renders the
QR as an `<svg>`/`<canvas>` and offers a "Download PNG" button. The public
Creator profile page renders the same QR (without the download button, or with
it, matching the dashboard).

## Acceptance criteria

- [ ] `buildDonateUrl(handle, origin)` produces the correct absolute
      `/creator/[handle]/donate` URL for a given handle and origin.
- [ ] The dashboard active Creator panel renders a QR card with a QR image
      encoding the Creator's donate URL.
- [ ] The QR card has a "Download PNG" button that saves a high-resolution
      PNG of the QR.
- [ ] The public Creator profile page renders a QR encoding the Creator's
      donate URL.
- [ ] vitest covers `buildDonateUrl` as a pure function.
- [ ] `creator-tab.test.tsx` is extended to assert the QR card renders an
      image with the donate URL.
- [ ] `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

None - can start immediately
