Status: ready-for-agent

# Launch a pointer-pass-through Game Overlay on the selected display

## What to build

Add the macOS-first Tauri v2 Live Event Client with a focused Control Window and a separate Game Overlay. A Creator can enter an Overlay ID, select a Target Display, and explicitly start a transparent full-display surface above a windowed or borderless game while pointer input continues to reach the game.

The app must remain controllable from the macOS menu bar after the Control Window closes. Overlay ID is prototype access held only in process memory, while the non-sensitive Target Display preference is remembered.

This slice also establishes the desktop scope and Live Event Platform bounded-context documentation needed by later tickets.

## Acceptance criteria

- [ ] Opening the Live Event Client never covers a display until the Creator explicitly starts the Game Overlay.
- [ ] The Control Window accepts an Overlay ID without placing it in logs, URLs, local storage, persisted settings, or error reports.
- [ ] Restarting the app requires the Overlay ID to be entered again.
- [ ] The Creator can select a Target Display and the non-sensitive selection is remembered across restarts.
- [ ] If the selected display is unavailable, the client falls back to the primary display without making the Game Overlay inaccessible.
- [ ] The Game Overlay is transparent, borderless, full-screen on the Target Display, always on top, and ignores pointer events.
- [ ] A representative windowed or borderless game beneath the Game Overlay continues receiving pointer input.
- [ ] Closing the Control Window leaves an active client available through the macOS menu bar.
- [ ] Stop Overlay immediately removes the entire Game Overlay, including any visible alert or effect.
- [ ] Native command tests cover display selection and fallback, full-screen sizing, always-on-top behavior, pointer passthrough, menu-bar lifecycle, and Stop Overlay.
- [ ] The scope index, context map, and domain documentation identify the new Live Event Client boundary and use the PRD glossary.

## Blocked by

- Render the signed Default Pack through shared components

## Comments

