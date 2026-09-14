# Multiplayer and sight fixes

The server no longer accepts client positions. Clients send sequenced 60 Hz inputs in bounded batches; shared physics handles acceleration, collisions, sliding, jump limits, jump pads and modifiers. The server admits movement against elapsed simulation time with at most 250 ms of catch-up credit. Idle clients continue falling after that grace period. Snapshots carry authoritative motion and the last processed input; clients rebuild prediction by replaying only unacknowledged inputs. Warps discard old inputs, including inputs arriving between a teleport and the next tick. Grapple and gadget/knockback impulses now update server motion.

Actions carry independent aim, selected weapon, warp, sequence, input reference and snapshot/render times. They wait for their referenced movement. The server keeps at most eight pending actions, rejects duplicates, and expires commands older than 400 ms. Fire waits for its authoritative cooldown rather than losing a request merely because rendering batched two requests together. Shot origins remain server-owned. The transport refuses sends above 16 KiB of queued data and returns failure; the engine reports that the action was not sent. No client damage or confirmed hit markers are invented.

Remote positions use a shared 100 ms interpolation timeline. Hitscan tests use up to 500 ms of server history and reject invalid times. Interpolation cannot cross death, respawn or teleport boundaries. Current arena geometry still occludes shots. The fairness tradeoff remains: a victim can perceive a hit after reaching cover because the shooter saw their earlier position. Moving geometry is not itself rewound.

Client movement advances in fixed steps at 10–144 FPS. The Worker retains fractional elapsed time and catches up through fixed steps after 100–500 ms stalls. Both cap catch-up at 500 ms; longer pauses intentionally discard excess simulation work. The transport heartbeats independently of rendering and closes after 12 seconds without snapshots, even when pongs continue. Disconnect returns to the existing lobby and clears stale actions and prediction. Returning from a suspended tab checks snapshot age. Rejoining is manual.

Non-sniper viewmodels are lower in hip fire and focus, keeping sights below the crosshair. All 13 non-sniper gun variants were checked in both poses, including Gun Game. Sniper pose and scope behavior remain unchanged.

## Validation

- 308 unit tests pass, including the existing combat, relic, lunge, Gun Game and parkour suites.
- Reproduction: a 40-unit client error is removed on the first authoritative snapshot while preserving newer predicted input; after acknowledgment, position error is zero.
- Forged positions at x=20,40,60,80,100 cause zero displacement. Sequenced movement stops before the test wall at x=5. Duplicate, nonfinite, out-of-range and stale-warp inputs are rejected.
- Two-second walking and sprinting at 10,20,60,144 FPS produce 12.646 and 19.455 units respectively in the shared-physics fixture. Held rifle fire stays within 14–16 shots over two seconds at all four rates.
- Deterministic moving-target hits succeed at 0,50,150,250 ms RTT; cover, warp/life boundaries, invalid times, atomic aim, command expiry and acknowledgment ordering have regressions.
- Local Worker API checks pass seven arena/mode configurations, movement, actions, guest authorization, chat, host departure, ownership transfer and rematch.
- The final two-browser run passed on retry after one chat-opening timeout; that timing instability remains a test limitation. Two-browser checks pass room admission, public listing, chat controls, ownership transfer and cleanup with no runtime errors.
- Two local WebSocket clients with ordered delay and 0–10 ms jitter pass all three modes at 0,50,150,250 ms RTT. Each run acknowledges all 36 inputs. FFA and Gun Game displacements are 3.428 units at every delay; parkour is 3.545 units including platform carry. Commands delayed behind a 600 ms head-of-line stall expire in all 12 runs.
- Browser sight checks inspect all non-sniper poses and confirm sniper scoped view still hides the viewmodel. Before/after images were visually reviewed; the rifle's sight no longer covers the center reticle.
- Production build passes. The existing Three.js bundle-size warning remains.

Run `npm test` and `npm run build`. With `npm run dev:worker -- --local` running, run `node tests/cloudflare-api-check.mjs`, `node tests/cloudflare-browser-check.mjs`, and `node tests/multiplayer-timing-check.mjs`. With `npm run dev` running, run `node tests/scope-visibility-check.mjs`.

## Limits and visual review

These are controlled local checks, not production load tests or a complete impaired-network playthrough of every ability. Platform interpolation and abrupt externally applied impulses can still produce corrections. Rewind is intentionally bounded; sufficiently late shots expire. Browsers may suspend timers, so indefinite background sessions are not promised. This changes the multiplayer wire protocol: old cached clients must reload when this version is eventually deployed.

The design instructions were checked against the changed scope composition and existing connection flow. No new typography, color system, decorative surfaces, icons, layout blocks or animations were introduced. Sight clearance was measured for every affected model and visually checked. Existing crosshair, HUD text, margins and controls remain readable; sniper behavior is preserved. The existing lobby and chat controls were exercised in real browsers. This is a focused visibility fix, not a redesign of the game's established visual style.
