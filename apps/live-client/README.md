# StarTip Live Event Client

A macOS-first Tauri v2 desktop application for managing a transparent, pointer-pass-through game overlay.

## Features

- Control Window to set the Overlay ID and Target Display.
- Game Overlay launched full-screen on the selected display.
- Menu bar tray icon with Show Control Window, Stop Overlay, and Quit actions.
- Target Display preference is persisted across launches.

## Development

```bash
pnpm install
pnpm tauri dev
```

Run Rust unit tests:

```bash
pnpm test
```
