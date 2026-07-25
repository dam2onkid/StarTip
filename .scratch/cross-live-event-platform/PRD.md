Status: ready-for-agent
Affected scopes: web, worker, shared packages, contracts (unchanged), new live-events desktop app

# Live Event Platform Local Demo

## Problem Statement

StarTip's browser Overlay lets an audience see Donation Alerts, but a Creator
who is actively playing a game does not directly experience those events.
Browser-source effects also require a second renderer if the Creator wants the
same event on their own display, which introduces synchronization delay and
duplicate rendering paths.

StarTip needs a local macOS desktop experience that places the same captured
surface above the Creator's game. A Donation should be able to trigger a
full-screen Donation Effect such as a Jump Scare, Screen Flash, Screen Cover,
or Tunnel Vision while pointer input continues to reach the game. The Creator
must retain a simple emergency escape path, Donors must select and fund effects
through the real testnet Donation flow, and ordinary Donation Alerts and Alert
Readings must continue to work.

The first deliverable is a local demo, not a distributable desktop product. It
must prove the complete real Donation-to-effect path without mock events while
keeping authentication, pack distribution, interaction, customization, and
desktop packaging deliberately small.

## Solution

Add a macOS-first Tauri v2 Live Event Client with a normal Control Window and a
separate borderless, transparent, full-screen Game Overlay. The Creator enters
an Overlay ID, chooses a Target Display, and explicitly starts the overlay. The
Game Overlay stays always on top and passes pointer input through to a windowed
or borderless game beneath it. OBS captures this Tauri surface together with
the game, so the Creator and audience see the same renderer. The existing
browser Overlay remains a fallback and is not intended to run concurrently.

Every Worker-verified Donation creates one off-chain Live Event. A Donation
without an effect produces the existing Donation Alert and may produce an
Alert Reading through the existing Worker Text-to-Speech Provider. A Donation
with a valid Effect Intent runs one Donation Effect and displays compact
attribution without a message or Alert Reading.

The local demo bundles one signed, declarative Default Pack with four fixed
effects. Donors choose an optional effect on the donate page, subject to an
Effect Price. Creators opt into Live Events and may edit prices in the
dashboard. Effect metadata and lifecycle remain off-chain, and DonationRouter
does not change.

Live Events use a durable Creator-scoped FIFO for ordering, audit, and
idempotency, but presentation is live-only. Events missed while the client is
offline are never replayed. The client renders immediately when Realtime
delivery succeeds and sends lifecycle acknowledgements on a best-effort basis.

## User Stories

1. As a Creator, I want a desktop Game Overlay above my game, so that I directly experience Donation events while playing.
2. As a Creator, I want the audience to see the same Game Overlay that I see, so that the stream reaction feels authentic.
3. As a Creator, I want to capture the Tauri Game Overlay through my own OBS configuration, so that StarTip does not maintain two synchronized primary renderers.
4. As a Creator, I want the browser Overlay to remain available as a fallback, so that I can still show Donation Alerts without the desktop app.
5. As a Creator, I want the Game Overlay to cover the full Target Display, so that full-screen effects can influence the entire visible play area.
6. As a Creator, I want the Game Overlay background to remain transparent, so that the game is visible except where an effect renders.
7. As a Creator, I want pointer input to pass through the Game Overlay, so that Donation Effects do not stop me from controlling my game.
8. As a Creator, I want the local demo to support a windowed or borderless game on the same display, so that the overlay behaves predictably on macOS.
9. As a Creator, I want to select the Target Display, so that the overlay appears over the correct game monitor.
10. As a Creator, I want the client to remember the Target Display, so that repeated demo setup is fast.
11. As a Creator, I want the client to fall back to the primary display when the Target Display disappears, so that the overlay does not become inaccessible.
12. As a Creator, I want to enter my Overlay ID in the Control Window, so that the prototype can receive my Creator-scoped Live Events.
13. As a Creator, I want the Overlay ID to stay only in process memory, so that the local prototype does not introduce premature credential storage.
14. As a Creator, I want to re-enter the Overlay ID when the app restarts, so that the prototype remains explicit and simple.
15. As a Creator, I want to start the Game Overlay explicitly, so that opening the app never covers my display unexpectedly.
16. As a Creator, I want to stop the entire Game Overlay from the Control Window or menu bar, so that all alerts and effects disappear immediately.
17. As a Creator, I want the app to keep running in the macOS menu bar after I close the Control Window, so that the overlay remains active while I play.
18. As a Creator, I want a compact connection status, so that I know whether the client can receive live events.
19. As a Creator, I want connection states named `Disconnected`, `Connecting`, `Ready`, `Overlay Running`, and `Connection Lost`, so that the current state is understandable.
20. As a Creator, I want the client to reconnect automatically after a network interruption, so that I do not need to stop playing.
21. As a Creator, I want a `Reconnect Now` action, so that I can retry immediately during a demo.
22. As a Creator, I want connection errors to stay out of the Game Overlay, so that operational messages never appear on stream.
23. As a Creator, I want events missed while offline not to replay after reconnect, so that old reactions never appear out of context.
24. As a Creator, I want ordinary Donations to render the existing Donation Alert, so that Tauri can replace the browser Overlay as the primary surface.
25. As a Creator, I want ordinary Donation Alerts to honor my alert duration, minimum amount, sound, Text-to-Speech, and Voice settings, so that moving to Tauri preserves core Overlay behavior.
26. As a Creator, I want an Alert Reading to apply only to Donations without an effect, so that speech does not conflict with effect audio.
27. As a Creator, I want a Donation Alert to render immediately while TTS is synthesized, so that Worker latency does not delay visual acknowledgement.
28. As a Creator, I want Worker TTS synthesis to time out after three seconds, so that slow speech never stalls the live queue.
29. As a Creator, I want a failed Alert Reading not to hide or fail its Donation Alert, so that the core visual remains reliable.
30. As a Creator, I want TTS to use the existing server-side provider and configured Voice, so that Tauri and the browser fallback sound consistent.
31. As a Creator, I want Tauri audio to use the macOS default output, so that the local demo does not install an audio driver.
32. As a Creator, I want local test controls for Alert Reading and Jump Scare audio, so that I can verify OBS routing before the demo.
33. As a Creator, I want to configure OBS visual and audio capture myself, so that the MVP focuses on core Live Event behavior.
34. As a Creator, I want to opt into Live Events, so that Donors cannot select effects until I choose to participate.
35. As a Creator, I want Live Events to be disabled by default, so that existing Creator donate pages do not change unexpectedly.
36. As a Creator, I want to edit the Effect Price of each Default Pack effect, so that I control the minimum Donation required.
37. As a Creator, I want Default Pack prices prefilled, so that I can enable Live Events without designing a price list.
38. As a Creator, I want disabling Live Events to prevent new Effect Intents, so that Donors stop seeing effect options immediately.
39. As a Creator, I want disabling Live Events before settlement to suppress an earlier Effect Intent, so that my current choice takes priority.
40. As a Creator, I want a suppressed effect Donation to fall back to an ordinary Donation Alert, so that the Donation is still acknowledged.
41. As a Creator, I want the dashboard toggle not to control an effect already running locally, so that remote settings and emergency controls remain easy to understand.
42. As a Creator, I want a fixed Emergency Stop shortcut, so that I can stop a disruptive effect without leaving the game.
43. As a Creator, I want `Control + Option + Command + E` to stop current effect media and audio, so that the emergency action is immediate.
44. As a Creator, I want Emergency Stop to clear queued Donation Effects but keep ordinary Donation Alerts and the Game Overlay active, so that core Donation acknowledgement continues.
45. As a Creator, I want an explicit `Stop Overlay` action distinct from Emergency Stop, so that I can shut down the entire presentation surface.
46. As a Creator, I want the Control Window to show the current effect and queue length, so that I can see what the live client is doing.
47. As a Creator, I want four local effect test buttons, so that I can prepare the renderer without creating fake events in the primary demo flow.
48. As a Creator, I want no advanced settings or log viewer in the local demo, so that the Control Window remains focused.
49. As a Donor, I want `No effect` to be the default Donation choice, so that Donation Effects remain optional.
50. As a Donor, I want to see the four available Donation Effects and their minimum prices, so that I can choose the reaction I want to trigger.
51. As a Donor, I want a short effect preview, so that I understand what I am funding.
52. As a Donor, I want selecting an effect to raise an amount below its minimum, so that I do not accidentally submit an ineligible Donation.
53. As a Donor, I want to donate more than the minimum, so that the full amount still supports the Creator.
54. As a Donor, I want deselecting an effect not to reduce the amount I entered, so that the form never silently changes my intended Donation downward.
55. As a Donor, I want the final `Pay & Donate` confirmation to show Creator, amount, token, and effect, so that I approve the exact action.
56. As a Donor, I want the entire amount to remain a Donation, so that there is no hidden effect surcharge or separate fee.
57. As a Donor, I want the Default Pack prices to begin at 1 test USDC for Screen Flash, 2 for Jump Scare, 3 for Tunnel Vision, and 5 for Screen Cover, so that the demo has clear pricing.
58. As a Donor, I want effect prices to have a 0.10 test USDC platform floor, so that accidental zero-value configurations are rejected.
59. As a Donor, I want my effect selection bound before signing, so that the server cannot substitute a different effect later.
60. As a Donor, I want a single-use Effect Intent to expire, so that an abandoned intent cannot trigger a future Donation Effect.
61. As a Donor, I want an effect to be issued only after the Worker verifies settlement in a Stellar ledger, so that unpaid effects cannot run.
62. As a Donor, I want the effect to appear without waiting for the full indexer pipeline, so that the reaction remains timely.
63. As a Donor, I want a Donation with an effect to show my name, amount, token, and effect name, so that viewers know who triggered it.
64. As a Donor, I want my message excluded from compact effect attribution, so that the effect remains readable and less vulnerable to disruptive text.
65. As a Donor, I want ordinary Donations to keep showing the full Donation Alert and eligible Alert Reading, so that existing behavior remains intact.
66. As a viewer, I want a Jump Scare to choose a bundled image or GIF at random, so that repeated Donations feel varied.
67. As a viewer, I accept that consecutive Jump Scares may repeat an asset, so that the MVP randomization stays simple.
68. As a viewer, I want a Jump Scare asset to play its bundled audio at 70% volume, so that the effect has an immediate audiovisual impact.
69. As a viewer, I want Jump Scare media centered at up to 80% of the display, so that it is visible without requiring a second renderer.
70. As a viewer, I want a static Jump Scare to last two seconds and a GIF to be capped at four seconds, so that it cannot dominate the stream indefinitely.
71. As a viewer, I want Screen Flash to fade through white once over one second, so that it is noticeable without a repeating strobe.
72. As a viewer, I want Screen Cover to obscure the central 70% for three seconds, so that it disrupts play while leaving some visual context.
73. As a viewer, I want Tunnel Vision to leave a central circular view of about 35% for five seconds, so that it meaningfully narrows the Creator's vision.
74. As a platform operator, I want every verified Donation to create exactly one Live Event, so that Donation Alerts and Donation Effects share one ordering model.
75. As a platform operator, I want `effect` to be optional on a Live Event, so that an ordinary Donation does not require a second event type.
76. As a platform operator, I want Effect Intent, Live Event, lifecycle, pricing, and pack metadata to remain off-chain, so that DonationRouter stays focused on settlement.
77. As a platform operator, I want DonationRouter unchanged, so that the local demo introduces no contract migration risk.
78. As a platform operator, I want Live Events persisted before Realtime notification, so that ordering, audit, and idempotency do not depend on transient delivery.
79. As a platform operator, I want Realtime delivery to remain live-only, so that reconnect never produces a stale reaction.
80. As a platform operator, I want one active effect at a time in FIFO order, so that visual effects do not overlap unpredictably.
81. As a platform operator, I want an event to start within 30 seconds, so that a delayed effect does not lose its live context.
82. As a platform operator, I want events held past the deadline to become `expired`, so that the queue has a clear terminal outcome.
83. As a platform operator, I want events with no client acknowledgement by the deadline to become `missed`, so that offline delivery is observable.
84. As a platform operator, I want acknowledgements to be idempotent and forward-only, so that retries cannot regress lifecycle state.
85. As a platform operator, I want the client to render without waiting for an acknowledgement response, so that audit traffic never delays the effect.
86. As a platform operator, I want terminal lifecycle states of `completed`, `failed`, `stopped`, `missed`, and `expired`, so that support data has stable meanings.
87. As a platform operator, I want an effect failure not to retry automatically, so that a broken effect does not surprise the Creator later.
88. As a maintainer, I want first-party signed declarative Effect Packs, so that the desktop client never executes arbitrary downloaded code.
89. As a maintainer, I want the Default Pack bundled with the app, so that a live Donation never triggers an asset download.
90. As a maintainer, I want pack versions immutable and Live Events pinned to exact versions, so that an effect remains reproducible.
91. As a maintainer, I want the desktop renderer bundled rather than loaded from a remote URL, so that a web deployment cannot change code during a stream.
92. As a maintainer, I want the browser fallback and Tauri to consume shared renderer components, so that visual behavior has one maintained implementation.
93. As a maintainer, I want the Control Window, event domain, renderer, and effect manifests separated into clear modules, so that future platforms can reuse the stable core.
94. As a maintainer, I want lifecycle records and Worker logs available without an event-history UI, so that the MVP remains debuggable without building analytics.
95. As a demo operator, I want the primary acceptance flow to use a real test USDC Donation, so that the demo proves the platform rather than a local animation.

## Implementation Decisions

### Product and platform boundary

- The initial deliverable is a local macOS development build. Signing,
  notarization, DMG packaging, Mac App Store distribution, auto-update, and
  external Creator onboarding are not required.
- The supported game presentation is windowed or borderless on the same Target
  Display. Native macOS fullscreen Spaces are not an acceptance requirement.
- The desktop app uses Tauri v2 with a React/Vite frontend and a thin Rust
  native shell.
- The desktop app has two windows: a normal Control Window and a separate
  transparent, borderless, full-screen, always-on-top Game Overlay.
- The Game Overlay ignores pointer events for the entire MVP. Selective
  hitboxes and exclusive interaction are reserved for a future contract
  version.
- The Creator explicitly starts the Game Overlay. Closing the Control Window
  leaves the active app available through the macOS menu bar.
- Target Display is selected manually and persisted as non-sensitive app
  settings. Automatic game-process detection is not part of the MVP.
- Overlay ID is prototype access for one Creator's Live Event stream and
  lifecycle writes only. It cannot change pricing, pack state, or Creator
  configuration.
- Overlay ID remains in memory and is not persisted. It must never appear in
  logs, URLs, localStorage, or error reports.

### Monorepo boundaries

- Add a new desktop app module for the Tauri Control Window, native shell, menu
  bar lifecycle, Target Display management, global shortcut, and Game Overlay.
- Add a shared Live Events domain module for schemas, validation, lifecycle,
  FIFO behavior, and API contracts without React or Tauri dependencies.
- Add a shared Overlay Renderer module for Donation Alerts, compact effect
  attribution, and effect presentation consumed by both Tauri and the browser
  fallback.
- Add a shared Effect Packs module for manifest schemas, signature and hash
  verification contracts, immutable version identifiers, asset metadata, and
  the bundled Default Pack.
- The Worker owns Effect Intent creation and consumption, Stellar ledger
  verification, durable Live Event persistence, Realtime publication,
  lifecycle acknowledgements, and TTS.
- The Web app owns Donor effect selection, Effect Price validation, Creator
  opt-in and pricing controls, preview UI, and the browser fallback.
- DonationRouter and contract packages remain unchanged.

### Shared renderer and pack security

- Tauri bundles the React renderer, effect runtime, and Default Pack. It never
  loads the remote browser Overlay page as executable desktop UI.
- The browser fallback imports the same renderer components where behavior is
  shared, but it may render a normal Donation Alert for an effect Donation
  because it is a fallback rather than a synchronized effect renderer.
- Effect Packs are first-party, signed, declarative, and immutable by version.
  They cannot contain arbitrary JavaScript, Rust, native code, or remote asset
  URLs.
- The local demo bundles one Default Pack. There is no pack download, update,
  marketplace, enablement, or management UI.
- The manifest defines stable pack, version, effect, asset, duration, scaling,
  audio, and safety metadata. Runtime input may select identifiers only within
  the validated manifest.
- A Live Event pins the exact pack ID, pack version, and effect ID.

### Default Pack contract

- The pack includes exactly Jump Scare, Screen Flash, Screen Cover, and Tunnel
  Vision.
- Jump Scare selects uniformly at random from bundled images and GIFs.
  Consecutive repeats are allowed. A static image displays for two seconds. A
  GIF is capped at four seconds. Media is centered and capped at 80% of the
  display. Optional bundled asset audio is preloaded and played at fixed 70%
  volume.
- Screen Flash fades through white once over one second and never repeats a
  strobe sequence.
- Screen Cover obscures the central 70% of the display for three seconds while
  leaving the perimeter visible.
- Tunnel Vision applies a dark mask with a central circular view of
  approximately 35% of display width for five seconds.
- All effects end automatically, remain pointer-pass-through, and expose no
  Creator intensity, duration, or cooldown settings.
- The initial Default Pack Effect Prices are 1 test USDC for Screen Flash, 2
  for Jump Scare, 3 for Tunnel Vision, and 5 for Screen Cover.
- A shared platform floor of 0.10 test USDC applies to all Creator-edited
  Effect Prices.

### Creator controls

- Add a `Live Events Enabled` opt-in, defaulting to false.
- When disabled, the donate page shows no Donation Effect choices and the
  server refuses to create new Effect Intents.
- Creators can edit the four Effect Prices in the dashboard. Visual behavior,
  audio, duration, and intensity are not configurable.
- Live Events Enabled is checked again when settlement is verified. An earlier
  Effect Intent is suppressed if the Creator has since disabled Live Events.
- A suppressed effect is converted to an ordinary Donation Alert with a
  machine-readable `creator_disabled` reason and no automatic refund.
- The dashboard toggle does not stop a local effect already running.
- `Control + Option + Command + E` is a fixed global Emergency Stop shortcut.
  It immediately stops current effect media and audio and clears queued effect
  events while leaving ordinary Donation Alerts and the Game Overlay active.
- `Stop Overlay` ends the entire Game Overlay, including ordinary Donation
  Alerts.

### Donor flow and Effect Intent

- `No effect` is the default Donation choice.
- When Live Events are enabled, the donate form displays the four effects,
  previews, current Effect Prices, and the platform floor.
- Selecting an effect raises an amount below the minimum to the current Effect
  Price. Deselecting an effect does not lower the amount.
- The final Pay & Donate confirmation includes Creator, token, total amount,
  and selected effect.
- Effect Price is the minimum total Donation, not a surcharge. The full amount
  follows normal DonationRouter fee splitting and settlement.
- The server creates a single-use, expiring Effect Intent before signature.
  It binds Creator, token, minimum amount, pack ID, pack version, effect ID,
  Donation preparation identity, and expiry.
- Effect Intent is entirely off-chain. No effect data or lifecycle data is
  added to DonationRouter or its events.
- Worker ledger verification matches the settled Creator, token, amount, and
  Donation reference to the locked Effect Intent. Client-submitted effect data
  after settlement is never trusted.
- Worker issues the Live Event after ledger verification and before waiting
  for the full indexer pipeline. Effect Intent identity is the idempotency key
  that prevents duplicate effect events.

### Live Event envelope and lifecycle

- Every Worker-verified Donation produces exactly one Live Event.
- The envelope includes event ID, server sequence, Donation identity, Creator
  identity, Donor Name, raw amount, token identity and metadata needed for
  display, creation time, expiry time, and optional effect metadata.
- A Donation without an effect has `effect = null` and renders a Donation
  Alert.
- A Donation with an effect contains exact pack, version, and effect
  identifiers and renders compact attribution containing Donor Name, display
  amount, token symbol, and effect name. It does not show the Donation message
  and does not produce an Alert Reading.
- Live Event lifecycle is forward-only:
  `queued -> started -> completed | failed | stopped`, with `queued -> missed`
  and `queued -> expired` terminal alternatives.
- `completed`, `failed`, `stopped`, `missed`, and `expired` are terminal.
- Lifecycle mutations are idempotent and reject backward transitions.
- Client rendering is never blocked on acknowledgement responses.
- The client sends `started` when rendering begins, then a terminal
  acknowledgement. Requests are best-effort and safe to retry.
- The event deadline is fixed at 30 seconds after creation. It must begin
  before the deadline but may finish after it.
- An event received into a local queue but held beyond the deadline becomes
  `expired`. An event with no client acknowledgement by the deadline becomes
  `missed`.
- Events missed while offline are never replayed after reconnect.

### FIFO and runtime behavior

- One Donation Effect is active at a time. Effects do not interrupt each other
  and enter one Creator-scoped FIFO.
- Ordinary Donation Alerts and effect events share one server sequence. The
  renderer must preserve this observable order.
- An effect failure moves the event to `failed` and advances the queue. It is
  never retried automatically.
- Emergency Stop moves the active effect to `stopped`, clears queued effects,
  and allows subsequent ordinary Donation Alerts to continue.
- Losing Realtime connection does not display error UI on the Game Overlay.
  The Control Window shows `Connection Lost`.
- The client reconnects with exponential backoff and jitter and exposes a
  `Reconnect Now` action. Reconnection starts a new live boundary and does not
  request historical event replay.

### Donation Alerts and Text-to-Speech

- Donations without effects use the existing Donation Alert visual and resolve
  the same alert duration, minimum amount, sound, Text-to-Speech, and Voice
  settings as the browser Overlay.
- A Donation with an effect bypasses the ordinary alert minimum because it was
  validated against Effect Price.
- Alert Reading is core for ordinary Donations only.
- The client renders the Donation Alert immediately and requests Worker TTS in
  parallel using the Overlay ID scope.
- The Worker constructs reading text from the verified Donation and stored
  Voice. The client cannot submit arbitrary text for synthesis.
- The Tauri synthesis wait has a fixed three-second timeout. Failure or timeout
  silently omits the Alert Reading without hiding or failing the Donation
  Alert.
- The alert remains visible for the greater of configured alert duration and
  the duration of an Alert Reading that began before timeout.
- Tauri plays alert sound, Alert Reading, and effect audio through the macOS
  default output device.
- OBS audio routing remains Creator-configured. The app does not install or
  bundle a virtual audio device.

### Control Window

- The local demo Control Window contains Overlay ID input, Target Display
  selection, connection status, Start/Stop Overlay, current event, queue
  length, four local effect tests, Alert + TTS test, the Emergency Stop
  shortcut reminder, concise error text, and retry.
- It has no log viewer, event history, analytics, refund controls, pack
  manager, advanced settings, or production authentication.
- Local test buttons execute the same bundled renderer and assets but do not
  substitute for the primary real Donation acceptance flow.

### Persistence and schema

- Add Creator opt-in and per-effect pricing storage with owner-write access and
  public/server-readable values needed by the donate flow.
- Add single-use Effect Intent persistence with expiry, consumption identity,
  Creator, token, raw minimum amount, Donation preparation binding, pack
  version, effect ID, and suppression reason.
- Add durable Live Event persistence with Creator sequence, envelope payload,
  lifecycle, timestamps, deadline, terminal reason, and acknowledgement
  metadata.
- Add the Live Event persistence table to the Supabase Realtime publication
  using the repository's idempotent publication migration pattern.
- RLS and API boundaries must prevent one Overlay ID from reading or mutating
  another Creator's events.
- Lifecycle rows remain available for developer queries and logs. There is no
  dashboard history UI.

### ADR alignment

- Follow ADR 0008: OBS captures the Tauri Game Overlay; browser Overlay is a
  fallback, not a concurrent primary renderer.
- Follow ADR 0009: Effect Packs are signed, declarative, and cannot execute
  arbitrary code.
- Follow ADR 0010: Live Event persistence provides FIFO, audit, and
  idempotency while presentation remains live-only with no reconnect replay.
- Follow ADR 0011: Tauri bundles the shared renderer and Default Pack instead
  of loading a remote page.
- Preserve the existing on-chain/off-chain boundary and make no
  DonationRouter changes.

## Testing Decisions

- Tests assert externally observable behavior and contracts rather than
  internal function calls, DOM structure, Rust implementation details, or
  database query order.
- The primary release seam is one real macOS testnet E2E:
  Donor web -> test USDC Donation -> Worker ledger verification -> Effect
  Intent validation -> durable Live Event -> Supabase Realtime -> Tauri Game
  Overlay -> lifecycle acknowledgement.
- The primary E2E must use a real Overlay ID, real Worker and Supabase
  services, a real testnet settlement, and the actual Tauri development app.
  It must not inject a mock Live Event.
- The E2E covers one ordinary Donation Alert with Worker TTS and all four
  Donation Effects. It verifies the Creator and OBS can see the same Tauri
  visual output.
- The E2E verifies pointer input still reaches a representative windowed or
  borderless game under the transparent Game Overlay.
- The E2E verifies FIFO ordering with multiple real Donations, the 30-second
  deadline, Emergency Stop, Live Events Enabled suppression, disconnect state,
  automatic reconnect, and no replay.
- Existing browser donate Playwright flows are prior art for driving the Donor
  journey and asserting Pay & Donate behavior.
- Existing Overlay Playwright and Realtime-stub tests are prior art for
  observable alert queueing and browser fallback behavior. The stub remains
  acceptable for component regression tests, but never for the primary E2E.
- Worker HTTP tests exercise Effect Intent creation, pricing validation,
  settlement matching, lifecycle transitions, Overlay ID scoping, and
  acknowledgements through public request/response contracts with dependency
  injection.
- Database integration tests exercise unique sequencing, one-use Effect
  Intents, expiry, idempotent acknowledgement transitions, RLS isolation, and
  idempotent Realtime publication migration behavior.
- Shared schema contract tests prove Web, Worker, and Tauri accept and reject
  the same Live Event versions and malformed payloads.
- Shared FIFO state tests assert observable ordering, one active effect,
  deadline handling, effect failure advancement, and Emergency Stop behavior.
- Renderer tests use the real manifest and deterministic clocks to assert
  fixed durations, dimensions, attribution fields, absence of messages and
  TTS for effect Donations, and ordinary alert/TTS behavior.
- Jump Scare tests replace only the random-number source at the module boundary
  to prove every bundled asset can be selected and consecutive repetition is
  accepted. The primary E2E uses normal randomness.
- Tauri command tests cover Target Display selection/fallback, full-screen
  window sizing, always-on-top configuration, cursor-event passthrough, global
  shortcut registration, and Stop Overlay behavior through the highest native
  command boundary available.
- Manual pixel-focused verification on the Target Display is required for the
  transparent composition, effect geometry, GIF scaling, macOS menu bar
  behavior, and OBS visual/audio capture because these are OS compositor
  behaviors not faithfully represented by DOM-only tests.
- Validation must include targeted lint, typecheck, Rust format/lint/tests,
  database migration tests, Web/Worker/shared unit suites, browser Playwright
  coverage, the Tauri development build, and the real testnet E2E.
- Any unrelated baseline failure discovered during validation must be fixed or
  explicitly separated with evidence; touched paths must remain clean and
  non-flaky.

## Out of Scope

- Windows, Linux, iOS, Android, or distributable macOS support.
- Native macOS fullscreen Space compatibility.
- Signed/notarized DMG, Mac App Store, auto-update, installer, or external
  Creator distribution.
- Device pairing, passkey login inside Tauri, production device credentials,
  Keychain storage, or persisted Overlay ID.
- Automatic game-process or game-window discovery.
- Selective interactive hitboxes, exclusive input mode, minigames, or
  server-controlled arbitrary interactive UI.
- Creator customization of effect intensity, duration, geometry, cooldown,
  media, audio volume, or safety presets.
- Multiple Effect Packs, pack downloads, pack updates, pack manager,
  marketplace, or third-party packs.
- Arbitrary remote JavaScript, native plugins supplied by pack authors, or
  server-supplied asset URLs.
- Shuffle bags, seeded randomness, weighting, or repeat prevention for Jump
  Scare assets.
- Automatic readiness heartbeat or disabling effects based on client online
  state.
- Replaying missed events after reconnect.
- Delivery acknowledgement that blocks rendering.
- Automatic refund, surcharge, paid-effect guarantee, SLA, or dispute
  workflow.
- Event history, retry controls, lifecycle analytics, Creator success-rate UI,
  or support dashboard.
- Local/system Text-to-Speech provider in Tauri.
- Automatic OBS setup, virtual audio driver installation, or audio routing.
- Concurrent browser and Tauri effect rendering.
- Any DonationRouter, contract ABI, or on-chain event changes.
- Production asset CDN, pack signing key rotation, revocation service, or
  remote pack distribution.

## Further Notes

- This PRD specifies a local demo but requires a real testnet Donation path.
  Local test controls are preparation aids only.
- Tauri Game Overlay is the primary renderer. Creators should not enable the
  browser Overlay simultaneously during the demo.
- The local demo must make the global Emergency Stop and Stop Overlay actions
  discoverable before the Creator starts the overlay.
- Effect Price is a minimum total Donation and must never be described as a
  separate fee.
- A Creator may disable Live Events at any time. Creator control wins at
  settlement, and a suppressed effect degrades to an ordinary Donation Alert.
- TTS remains a core feature for ordinary Donations, but never runs for a
  Donation Effect.
- Domain vocabulary is defined in the system glossary. The Live Event Platform
  bounded context and scope documentation should be added when the desktop app
  scaffold is created.
