Status: ready-for-agent

# Move the browser fallback onto the shared Donation Alert renderer

## What to build

Keep the browser Overlay as a reliable fallback while making it consume the same maintained Donation Alert renderer as the Live Event Client. The browser fallback retains existing ordinary Donation behavior and may represent an effect Donation as a normal Donation Alert because it is not a concurrent synchronized effect renderer.

## Acceptance criteria

- [ ] The browser Overlay and Live Event Client consume the shared Donation Alert components and display contracts.
- [ ] Existing browser Overlay alert duration, minimum amount, sound, Text-to-Speech, Voice, queueing, and moderation behavior remains intact.
- [ ] Ordinary Donations remain visually and behaviorally consistent across the browser fallback and Live Event Client.
- [ ] The browser Overlay does not download or execute desktop Effect Pack code.
- [ ] An effect Donation may degrade to a normal browser Donation Alert when the fallback is used.
- [ ] The supported flow does not require the browser Overlay and Tauri Game Overlay to render the same effect concurrently.
- [ ] Existing Realtime-stub and Playwright coverage is updated to protect the shared behavior without replacing the real primary acceptance flow.
- [ ] Pixel-focused browser verification confirms the shared renderer migration introduces no visible regression.

## Blocked by

- Render the signed Default Pack through shared components
- Deliver ordinary Donations to the Live Event Client

## Comments

