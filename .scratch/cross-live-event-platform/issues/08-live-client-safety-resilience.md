Status: done

# Make the live client safe during play and network failure

## What to build

Complete the operational controls needed to run the Live Event Client during a game. The Control Window reports connection and queue state, supports local preparation tests, reconnects without stale replay, and exposes distinct Emergency Stop and Stop Overlay actions.

Emergency Stop immediately ends active effect media and audio and clears queued Donation Effects while keeping the Game Overlay and ordinary Donation Alerts active. Stop Overlay removes the entire presentation surface.

## Acceptance criteria

- [x] The Control Window uses exactly the connection states Disconnected, Connecting, Ready, Overlay Running, and Connection Lost.
- [x] Connection errors and operational text appear only in the Control Window, never on the Game Overlay.
- [x] The client reconnects with exponential backoff and jitter after connection loss.
- [x] Reconnect Now starts an immediate retry.
- [x] Reconnection establishes a new live boundary and never requests or renders events missed while offline.
- [x] The Control Window shows the current event and queue length.
- [x] Four local effect test controls exercise the real bundled renderer and assets without creating primary-flow Live Events.
- [x] An Alert and Text-to-Speech test and a Jump Scare audio test allow local OBS routing preparation.
- [x] The fixed Control + Option + Command + E global shortcut is registered and discoverable before overlay start.
- [x] Emergency Stop immediately stops current effect media and audio, marks an active effect stopped, and clears queued Donation Effects.
- [x] Emergency Stop leaves the Game Overlay active and allows ordinary Donation Alerts, including later alerts, to continue.
- [x] Stop Overlay remains a separate explicit action that ends alerts, effects, audio, and the entire Game Overlay.
- [x] The Control Window has no log viewer, event history, analytics, refund controls, pack manager, or advanced settings.
- [x] The system glossary is corrected so Emergency Stop consistently reflects the PRD behavior of preserving the Game Overlay and ordinary Donation Alerts.
- [x] Native boundary and end-to-end tests cover the global shortcut, queue clearing, active media cancellation, reconnect, connection status, and no replay.

## Blocked by

- Preserve FIFO ordering and terminal lifecycle outcomes

## Comments

