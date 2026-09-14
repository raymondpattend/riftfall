# Click-to-visible-shot implementation

Implemented locally on top of `e37110b5eb9996cecfda22e1665ca62e4a4611ad`. No deployment or history rewrite was performed.

## Behavior

- An eligible gun click creates the actual local tracer geometry in the input handler, before the next render. Practice uses the same provisional path when execution is waiting on a movement input. Rifle, shotgun pellets, sniper, and Gun Game gun variants use the current weapon's range, spread, focus and aim. World collision limits the provisional endpoint. Player hits are not predicted.
- Command sequence IDs accompany authoritative events and results. The local client suppresses its matching authoritative tracer, while hit markers, damage, kills, sound and recoil remain authoritative. Pending shots reserve ammo internally without mutating the authoritative snapshot. Accepted results release reservations; rejected results remove remaining tracer geometry and release speculative cooldowns. Death, warp, round reset and stage changes reconcile prediction.
- Creation time uses a server-time estimate from admission and correlated ping/pong timing. Viewed-world time remains separate and server rewind remains capped at 500 ms. Commands still expire at 400 ms; future timestamps have a bounded 150 ms tolerance. Queue receipt and resolution times are recorded separately. A clock estimate cannot establish exact one-way latency under asymmetric transit.
- The server holds at most one buffered fire command and eight commands total. A later non-fire action cancels buffered fire, but still waits for its own movement input. Weapon changes cancel shots for the previous weapon. A pending shot for the newly selected weapon survives its own input acknowledgment. Gun Game commands include the stage they were created for. Previous-weapon cooldown carryover is capped at the 320 ms swap duration.
- Each connection has one snapshot in flight. State produced while waiting is replaced by the latest state. Events and command results remain queued until the exact delivery acknowledgment, independently of the simulation's old 100-event history. A delivery taking over two seconds, or exceeding 512 events / 128 results, closes the connection rather than silently losing feedback. Non-advancing snapshots and delayed ping replies also trigger recovery. This intentionally reduces snapshot frequency on higher-latency links; it trades update frequency for bounded backlog.

The Worker uses normal supported WebSocket sends plus application acknowledgments, without relying on browser-only buffering properties. [Cloudflare WebSocket documentation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).

## Validation method

`npm run test:shot-delay` runs Chrome against Vite on port 5173 and a local Worker on port 8787. It mutes audio, uses real mouse events, delays WebSocket delivery in order in both directions, and applies deterministic small jitter. No UDP-style packet reordering is modeled.

The render hook reads actual pixels after the first scene render, compares against a render with only tracer geometry hidden, and verifies that the tracer contributes pixels in the very first frame following the input event. It writes that frame as PNG. Timing includes GPU readback overhead and is not a hardware mouse-to-monitor-photon measurement. These are local samples, not production latency percentiles.

The development-only diagnostic ring retains at most 256 entries: input handler, send success/failure, provisional tracer, first rendered frame, authoritative tracer, snapshot receipt, and command outcome. Each command result includes server receipt and resolution in simulation seconds; snapshot time records the state sent. Client durations use the browser's own monotonic clock. No raw subtraction of unrelated client/server clocks is used for the reported delays.

Additional coverage includes taps, held fire, failed sends, reload suppression, 0/250 and 250/0 ms asymmetric transit, expired uplink commands, a 700 ms ordered downlink stall, 6,000 bytes/second downlink throttling and recovery, a 2,500 ms stall with explicit disconnect, practice respawn, and all 20 Gun Game stages through real browser clicks. Unit regressions cover queue caps, replay, future timestamps, missing movement acknowledgments, state changes, empty magazines, provisional reservation/rejection, duplicate tracer suppression and reliable event retention.

## Measured local results

Chrome 152.0.7977.83, sound muted. Each value is one input-to-frame or input-to-result sample in milliseconds.

| Mode / added RTT | Rifle visible / result | Shotgun visible / result | Sniper visible / result |
| --- | ---: | ---: | ---: |
| online / 0 ms | 13.9 / 78.6 | 9.4 / 67.6 | 12.0 / 74.4 |
| online / 50 ms | 10.2 / 105.9 | 5.6 / 104.7 | 17.9 / 104.9 |
| online / 150 ms | 13.2 / 231.1 | 18.4 / 210.4 | 8.6 / 222.8 |
| online / 250 ms | 14.4 / 465.3 | 10.6 / 321.3 | 11.6 / 332.7 |
| practice | 15.9 / 0.7 | 9.7 / 0.5 | 8.1 / 0.0 |

All 15 weapon/mode samples contributed tracer pixels in the first rendered frame after input. All four delay settings passed held-fire, failed-send, reload, stall, bandwidth recovery and disconnect checks. Both asymmetric-delay checks passed; the 600 ms uplink command expired with an explicit result.

331 unit tests pass. Production build passes with the existing bundle-size warning. The local Worker API checks pass across seven arena/mode configurations. The existing movement timing check passes for FFA, Gun Game and parkour at 0/50/150/250 ms added RTT. All 20 Gun Game stages passed the focused browser check.

Reproduce with local Vite and Worker running:

```sh
npm test
npm run build
npm run test:shot-delay
node tests/shot-stage-browser.mjs
node tests/cloudflare-api-check.mjs
node tests/multiplayer-timing-check.mjs
```

Do not run all socket-heavy suites within one rate-limit window: the local Worker applies its 30 sessions/minute admission limit. The first sequential API + movement test attempt hit that limit; the movement check passed after the window reset.

[Detailed timings and correlated diagnostics](test-results/shot-delay/results.json) and [example first shotgun frame](test-results/shot-delay/shotgun-250.png) are saved locally in the ignored test-results directory.

## Production verification and limits

On September 14, 2026, the live site served `/assets/index-DkI9W8X9.js`. Inspection found the old `at:this.snapshot.time` command timestamp and no `snapshot-ack` support. This verifies that the served client still has the old path, but does not identify the exact deployed Worker revision or measure live gameplay. The new implementation has not been deployed or compared in a live match. The reported “18 minutes” remains unverified.

A simultaneous client/Worker rollout is required. Existing open tabs need to refresh and rejoin because the new Worker requires snapshot acknowledgments. The provisional endpoint may differ from the server's hit endpoint; only authoritative events produce hit feedback. Browser network injection models ordered application delivery, not a physical congested network or Cloudflare production infrastructure. The existing Three.js bundle-size warning remains.

## Review of changed visuals

The existing arena, weapon models, weapon sights, camera controls, page layout, typography and palette are preserved. The changed visual is the game's existing tracer geometry, now shown earlier. Frame captures verify visible, unclipped shot geometry rather than an audio-only or muzzle-flash substitute. The design instructions were reviewed against the changed surface: no new decorative cards, typography, gradients, icons, overlays, entrance animation or nonfunctional controls were introduced. Recovery and rejection messages use the existing notice and connection UI. This is a scoped review of the changes, not a redesign or certification of every pre-existing interface element.
