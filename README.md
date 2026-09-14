# Riftfall

A complete desktop 3D browser arena: four custom maps, first-person combat, five FFA weapons, a 20-weapon Gun Game ladder, seven pocket relics, legendary abilities, party modifiers, ground loot, practice bots, and live friend rooms. Combat modes are first to 20 eliminations; PARKOUR is first to the finish.

## Play locally

Requires Node.js 22.12+ (tested with Node 24).

```sh
npm ci
npm run dev
```

Open the address printed by Vite. Choose Practice for an instant match, Host a room to create a multiplayer arena, or Join friends with a six-character code. Click Resume game to capture the mouse when prompted. Escape releases it. The game requires a desktop browser with WebGL and a mouse/keyboard; the lobby fits phones, but touch gameplay is not implemented.

## Deploy to Cloudflare

Production: https://riftfall.narroorg.workers.dev

The app, assets, room directory, and live multiplayer simulation run on Cloudflare. All online players connect to a per-room Durable Object over same-origin WebSockets. There is no P2P, WebRTC, PeerJS, or TURN fallback.

```sh
npm ci
npx wrangler login
npm run deploy
```

`wrangler.jsonc` provisions SQLite-backed Durable Objects and asset hosting. New accounts should update `account_id`. Preserve the namespace migrations, including the retired signaling namespace. No TURN secrets are needed.

For local multiplayer, run `npm run build`, then `npm run dev:worker`. Open port 8787, or run `npm run dev` in another terminal for hot reload; Vite proxies `/api` and game WebSockets to port 8787.

### Server lifecycle

- Every online room runs the shared game simulation on Cloudflare at 20 ticks per second. Browsers render the arena and predict their own movement; Cloudflare owns combat, bots, inventory, scoring, and rounds.
- Room creators get game-master permissions, not a browser game server. When they leave, another connected player inherits those permissions and the match continues.
- Rooms end when the last human leaves. Abandoned connections expire after 30 seconds, and the simulation timer stops when no connections remain.
- Public room leases renew on the server every 30 seconds and expire after 90 seconds. The directory has a five-second edge cache.
- Rooms are ephemeral. Deployments, runtime restarts, and service interruptions can end an active match; players should refresh and create a new room. Match state is not saved for recovery.
- Active simulation keeps a Durable Object running and consumes Cloudflare compute under the account's plan. Static assets are served separately. No paid-plan upgrade is performed by deployment.
- Origin checks, connection limits, bounded messages, server-assigned chat identity, and owner-only controls protect room isolation. Movement remains client-predicted and bounded, suitable for casual play rather than competitive anti-cheat.

Use `npm run deploy` for future releases. The old address, `riftfall.vercel.app`, remains a redirect to Cloudflare. Its redirect configuration lives in `migration/vercel-redirect`.

## Controls

| Input | Action |
| --- | --- |
| WASD + mouse | Move and look |
| Left mouse | Automatic fire or sword swing |
| Right mouse / Left Ctrl | Focus or scope with any gun; aim a sword launch |
| Aim sword, then click | Launch toward the targeted player (24m reach, 1.2s cooldown). Control-click also works on Mac |
| V | AOTE teleport or AOTD Dragon Rage |
| Space, then Space again | Jump, then double jump |
| Tap Right Shift | Toggle sprint on or off |
| Hold either Shift | Sprint while held |
| C while sprinting | Slide |
| R | Reload; reserve ammo is unlimited |
| 1–5 or mouse wheel | Change weapon |
| Q | Throw a grenade; 3.5-second cooldown |
| E | Grapple a wall or tower within 28m; costs 10 mana |
| F | Disabled |
| G near ground loot | Pick up a weapon or relic |
| X | Use the pocket relic in your sixth hotbar slot |
| Tab | Hold for scoreboard |
| Escape | Release mouse; pause practice or open room menu |

Opponents have white outlines through walls. A confirmed hit flashes that opponent’s outline red for 0.65 seconds only on the shooter’s screen. Remote weapon changes animate a draw motion; bullets have thick, bright tracers. Sword launches stop at walls and only damage an opponent at striking distance.

The HUD shows available jumps, mana, ammo, cooldowns, scores, and a minimap. At 35 health or less a persistent red border warns you. Practice pauses while the menu is open; online rooms keep running.

## Arsenal and damage

In FFA, all players spawn with three guns, two empty sword slots, 100 health, 50 shield and 100 mana. AOTE and AOTD are drop-only and never granted on spawn. AOTE remains usable until you die; AOTD is consumed by one use. Small supplies auto-collect. Ground weapons equip with a quick swap animation and refill their magazine; sword drops also refill mana.

| Slot | Weapon | Behavior |
| --- | --- | --- |
| 1 | Wayfinder AR | 8 body damage; 100 headshot damage, so a fully healthy/shielded player takes two headshots |
| 2 | Breachcaster | Eight 4-damage pellets; any headshot is an instant elimination |
| 3 | Longshot | Any hit eliminates instantly, even at maximum shield |
| 4 | Aspect of the End | Find on the ground; lost on death. 15 body damage; aimed head hit eliminates. V teleports up to 9m through open space, costs 15 mana; 0.22s cooldown |
| 5 | Aspect of the Dragons | Drop-only. One swing or 14m Dragon Rage blast instantly eliminates on hit, then consumes the sword even if you miss. No mana required. Reverts to AOTE if owned, otherwise the rifle |

Bots deal half normal damage, capped at 12 damage per hit, so practice fights last longer. Human sniper and headshot rules remain as requested. Walls block gunfire, blasts and grenades. Spawn protection lasts 2.5 seconds and ends when you attack. Death respawns you after 3 seconds. The first player to 20 wins, scoring stops, and the host can restart the round.

## Gun Game

Select **Gun Game · 20 weapons** under Game mode before starting practice or hosting. Friends joining your room automatically use its mode and arena. Each credited elimination moves you one stage, replaces your only weapon, refills its magazine and plays the swap animation. Dying keeps your stage. The twentieth elimination, with the final Crown Blade, wins. Rematch resets everyone to stage one.

The first 16 guns shuffle once per round, with the same order for everyone. The gun pool is Sidekick, Wayfinder AR, Short Fuse, Needle SMG, Copperhead, Scout, Breachcaster, Ranger Carbine, Pocket Auto, Street Sweeper, Longshot, Heavy Hand, Drumrunner, Quad Barrel, Frostbite, Pulse Carbine. Stages 17–20 remain Scrap Saber, Dragon Cleaver, Aspect of the End, and Crown Blade. Each has a distinct model and icon plus its own magazine, fire timing, damage or reach. The lobby's **View all 20 weapons** opens the illustrated ladder.

Only the current stage weapon is available. Weapon switching, all ground loot, pocket relics and Q grenades are disabled, including random Relic party gifts and nukes. Small automatic health/shield/mana/speed supplies, grappling, jumps and other game master modifiers still work. All four swords can launch toward an aimed opponent. Stage 19's End Sword also teleports with V. Hold Ctrl to scope any sniper. Pistols and shotguns retain instant headshots; rifles and the SMG deal 100 headshot damage. All human sniper hits and the final Crown Blade are one-tap. Bots retain their gentler damage cap.

The host owns stages and ignores attempts to select another weapon. An old movement packet cannot undo a promotion. A single shotgun discharge stops applying pellets after an elimination so it cannot skip multiple stages.

## Game master modifiers

Open **Game master** in the lobby to set rules for a practice match or hosted room. While playing, press Escape, then Game master. The room host controls this panel; guests cannot change room rules. Changes are sent to every player immediately.

- Movement speed: 0.5× to 3×.
- Jump boost: 0.5× to 3×.
- Cooldowns: default quick timing, 2× faster, 4× faster or 2× slower.
- One-tap mode: any nonzero hit eliminates, regardless of the usual weapon damage.
- Instant respawn: return in about 50ms instead of 3 seconds.
- Low gravity: extended air time for trick shots.
- Infinite mana: abilities never consume mana. AOTD and pocket relics still use charges.
- Extra jumps: four jumps before landing.
- Fast reloads: reload magazines in 35% of the usual time.
- Pinball knockback: hits launch rivals backward.
- Life steal: recover health equal to 25% of damage actually dealt.
- Shield regeneration: restore 8 shield/second after 5 seconds without taking damage.
- Party loot: start each life with a random pocket relic; relic pickups and spawn gifts have double charges. Enabling it also gives a relic to living players whose pocket is empty.

**Chaos party** combines 2× movement, 1.5× jumps, infinite mana, instant respawn and 4× faster abilities. **One-tap duel** enables one-tap damage and instant respawn. **Pinball** combines low gravity, knockback, four jumps and instant respawn. **Relic party** combines random relic gifts, doubled charges, fast reloads, infinite mana and quick abilities. **Default** resets everything. Normal damage remains lower; prior headshot and sniper rules are preserved unless the host enables the broader one-tap mode.

AOTE can chain while holding right mouse or V. Default ability cooldowns are 0.22s for AOTE, 1.5s for grapple, 3.5s for grenades. Mana regenerates at 16/second. Weapon changes play a 0.32s lower-and-raise animation; reloading tilts the weapon, moves the magazine and shows progress.

## Unique ground loot

Drops have real 3D models, rarity beacons and an on-screen pickup prompt. Press G within range; you cannot grab them through a wall. They respawn after 22 seconds and are shared across the room.

- **Rift Orb:** full mana; immediately resets teleport and grapple cooldowns. Does not restore a consumed AOTD.
- **Dragon Heart:** full 100 shield and +35 health.
- **Five weapon drops:** rare rifle, epic shotgun/AOTE, legendary sniper/AOTD. Picking one up equips it. Guns get a full magazine; AOTD grants one use.
- **Small supplies:** health canisters, shield vials, mana prisms and speed pickups. Speed lasts 10 seconds.

Choose an arena in the lobby before starting practice or hosting. Joining players automatically load the host's map. Each has 12 safe spawns, cover, climbable routes, supplies, launch pads and the complete ground-loot set. The minimap is drawn from that arena's collision geometry.

- **The Crown:** the original floating citadel and rift monument.
- **Skyforge Foundry:** a raised industrial catwalk circuit and climbable central furnace.
- **Glacier Run:** an ice canyon, snowy ridges and two bridge crossings.
- **Sunstruck Dunes:** a stepped desert temple with four stair approaches and ruined courtyards.

## Pocket relics

Open **Relics** in the lobby or pause menu for the illustrated field guide. Collect a relic with **G** and use it with **X**. You carry one type at a time; a new pickup replaces it. Remaining charges and cooldown appear in the sixth hotbar slot. Relics are drop-only by default and reset on death. Their normal reuse cooldown is 0.65 seconds, adjusted by the game master.

| Relic | What it does | Uses per pickup |
| --- | --- | --- |
| Ice Spray Wand | A 12m cone slows rivals to 35% movement speed for 3 seconds and deals 10 base damage | 2 |
| Bonzo Staff | Balloons explode after 1.1 seconds into confetti, up to 32 damage and knockback within 6m. Everyone nearby can take damage, including the user | 3 |
| Swap Pearl | Trade places with a visible rival you aim at within 28m; a missed swap keeps its charge | 1 |
| Gravity Orb | Place a 7m-radius vortex ahead that pulls rivals for 5 seconds | 1 |
| Healing Totem | Plant an 8-second, 6m-radius zone that heals everyone inside for 12 health/second, including rivals | 1 |
| Rocket Jump | Launch upward and forward, knocking nearby rivals away without self-damage | 2 |
| Rift Nuke | Unlocks at 10 eliminations; a 3-second warning before a lethal 26m blast with special kill-credit rules | 1 |

Walls block relic targeting and zone effects, except the nuke blast. Spawn-protected players cannot be frozen, swapped or knocked by a rival. Healing and gravity fields have visible boundaries and disappear when their duration ends. The host owns charges, fields, status effects and impulses, and all players receive their effects.

## Nuke rules

Nuke ground drops stay hidden and cannot be collected until any player reaches 10 eliminations. This unlock remains for the rest of the round and resets on a rematch. Nukes are excluded from random party gifts and always grant one charge.

Press X to throw one. A red ring and a 3-second countdown show the 26m danger area. The blast hits everyone in range, including its user, and passes through cover; spawn protection still works.

A victim adds to the nuke user's elimination score only when that user damaged them within the preceding 15 seconds and neither player has died since that damage. Teleports and swaps do not break that history. Untagged victims still die but give no score, mana reward or life-steal benefit, and cannot win the round for the user. Eligibility is checked before the simultaneous blast, so dying in that same blast does not erase an otherwise valid tag. Nuke damage itself never creates a qualifying tag.

## Combat feedback and your ranger

Guns have view-model kick and camera recoil that affects subsequent aim; focus and scope reduce recoil. The shotgun briefly marks all eight pellet directions after a shot. Damage values are whole numbers: yellow body hits and red headshots. The top of the screen celebrates headshots and double, triple or quad eliminations. Multikills chain within 5 seconds and reset when you die.

Open **Locker** to choose armor, accent and visor colors, a crest or antenna, and a jetpack or cape. Changes save automatically in localStorage on this browser and synchronize to other players. Use **Turn ranger** to inspect the back gear. Colors and cosmetic gear do not change the hitbox or combat stats.

## How multiplayer works

Cloudflare runs each online match. Room creation and joining wait for a server snapshot containing the player. All movement, actions, chat, and snapshots travel through same-origin WebSockets. Missing or full rooms fail promptly, and cancelled attempts settle cleanly.

Rooms support eight total players including bots. Humans replace bots when needed. The server validates combat, applies damage, manages item cooldowns, respawns players, and tracks scores. Clients predict movement and interpolate opponents; teleport acknowledgements keep stale packets from undoing server effects.

The room creator can change modifiers and restart rounds. These controls transfer to another player when the creator leaves. Public or invite-only rooms remain live while humans are connected. Practice is a separate offline browser simulation.

## Validation

```sh
npm test
npm run build
```

The rules/physics and networking suite covers the full 20-stage Gun Game run, stage ownership, per-weapon reloads, single-inventory restrictions, rematches, nuke scoring and life history, AOTE ownership, Bonzo area/self-damage, damage, headshots, shield absorption, wall occlusion, reload timing, respawns, victory freeze, teleport acknowledgement, loot, map spawn clearance and fast-movement collision.

With the dev server running on port 5173 and Google Chrome installed:

```sh
npm run test:browser
npm run test:relic-network
npm run test:expansion
npm run test:cosmetics
npm run test:gun-game
```

The browser integration run uses real mouse/keyboard input and two separate browser contexts through Cloudflare game WebSockets. It checks lobby controls, settings, movement, double jump, Shift sprint/slide, Ctrl sniper scope and trackpad click firing, Left Ctrl focus, weapon swap/magazine animations, firing/reload, abilities, AOTD drop-only pickup and consumption, all six X-key relics, four jumps, fast reload, ground loot, sword animation, low-health UI, victory/rematch, room creation/join, synchronized movement, host-owned guest ammo, guest teleport acknowledgement, a multiplayer AOTD elimination and consumption, host game-master settings, modifier synchronization and disconnect cleanup. Small test fixtures position players deterministically; gameplay actions use actual key/mouse input. The extra relic network run checks remote freezing, real two-way swaps, gravity impulses, shared healing, rocket movement, party gifts and guest permission guards. The expansion run checks all new arenas, actual recoil and pellet markers, integer damage, headshot/multikill banners, nuke pickup/use/scoring and automatic host-map loading. The Locker check tests colors, all gear, reset, persistence and live multiplayer appearance updates. The Gun Game check fires through all 20 stages, tests death and rematch behavior, confirms host/guest progression, and checks that FFA loadouts return when changing modes. Screenshots are saved under `/tmp/riftfall-*.png`.

## Project layout

- `src/engine.ts`: renderer, camera, movement, inputs, audiovisual feedback and session orchestration.
- `src/simulation.ts`: host-owned gameplay rules, combat, bots, pickups and rounds.
- `src/physics.ts`: collision, substep movement and ray queries.
- `src/network.ts`: Cloudflare WebSocket transport.
- `worker/game.ts`: authoritative room simulation, admission, ownership, and chat.
- `scripts/server-arenas.mjs`: builds server collision data from the same arena definitions used by the renderer.
- `src/assets/`: original map, animated characters, weapons, effects and loot geometry.
- `src/App.tsx`, `src/style.css`: lobby, HUD, menus and settings.
- `src/rules.ts`, `src/loot-rules.ts`: balance and item data.

Original map, weapon geometry, item graphics and generated audio are included. No external 3D models, game audio, or Epic/Hypixel artwork is copied. The game is fan-made and is not affiliated with Epic Games or Hypixel. Tanker is provided by Indian Type Foundry/Fontshare under the included `public/fonts/FFL.txt` license for use in this game; it is not offered as a standalone font download product. Runtime libraries retain their own licenses in their packages.

### Cloudflare regression checks

```sh
node tests/cloudflare-api-check.mjs
node tests/cloudflare-browser-check.mjs
```

These checks default to the local Worker on port 8787. Set `TEST_URL=https://riftfall.narroorg.workers.dev` to check production. The protocol check covers all arenas, game modes, server ticks, movement/actions, owner-only controls, chat, creator departure, ownership transfer, and rematches. The browser check exercises public rooms and chat with real clicks, verifies zero WebRTC connections, and keeps playing after the creator leaves.

Older browser fixtures that manipulate the former host's local simulation need adaptation for server-hosted matches. They remain useful for local Practice but are not the online deployment gate.

### Public rooms and chat

Select **Public room** when creating an arena to appear in the home-page directory. Unchecked rooms are invite-only. The server maintains the listing and cleans it up when everyone leaves. Counts reflect human players, with bots yielding slots to newcomers.

Press **T** to type, **Enter** or **Send** to submit, and **Escape** to cancel. Cloudflare assigns sender names and broadcasts chat and presence notices. Messages are capped at 240 characters and five messages per five seconds per sender; browsers retain the last 40 messages for the current session.

## PARKOUR

Choose PARKOUR, then Sky Steps (rising islands) or Switchback (narrow zigzags). Each round generates 64 landings: narrow ledges, beams, diagonal steps, long gaps, elevation changes and moving platforms. Everyone receives the same seed. Rematch generates a fresh layout. Land on all platforms in order. Every eighth landing saves a checkpoint; falling returns you there without a death. First to the finish wins. Bots attempt the route, hesitate and frequently miss. Weapons, damage, grenades, relics, teleports and grapples are disabled. WASD, sprint and double jump remain available. F healing is disabled in all modes; health pickups and Healing Totems remain in combat modes.

Run `node tests/parkour-browser-check.mjs` with `BASE_URL` set to your Vite address for the local browser check.
