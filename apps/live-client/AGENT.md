## Live Event Client (`apps/live-client`) rules

macOS-first Tauri v2 desktop application for the Live Event Platform. Invoke the `tauri-v2` skill for Tauri-specific work.

### Domain

- Read `apps/live-client/CONTEXT.md` and the PRD in `.scratch/cross-live-event-platform/PRD.md` before making domain changes.
- The Overlay ID is the Live Event channel boundary. It lives in `GameOverlay` memory and is used as the Supabase Realtime channel filter and the lifecycle ack scope. The server persists it in `live_events` for the lifetime of the event and then terminal; the client never logs it or stores it in settings.
- The Target Display is non-sensitive and is persisted to `settings.json` in the app config directory.

### Rust

- Follow idiomatic Rust naming and keep Tauri command handlers thin. Core logic belongs in `src/display.rs` and `src/overlay.rs`.
- Window management must be testable behind the `WindowFactory` / `OverlayWindow` traits.

### Frontend

- Follow the global `DESIGN.md` tokens for the Control Window.
- The overlay view (`label === "overlay"`) must remain transparent, borderless, and pointer-pass-through at the OS level.

### Testing

- Rust unit tests: `cd src-tauri && cargo test`
- Type check: `pnpm typecheck` (TypeScript + `cargo check`)
