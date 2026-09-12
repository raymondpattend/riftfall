# Riftfall

A complete desktop 3D browser arena: four custom maps, first-person combat, five FFA weapons, a 20-weapon Gun Game ladder, seven pocket relics, legendary abilities, party modifiers, ground loot, practice bots, and live friend rooms. First to 20 eliminations wins.

## Play locally

Requires Node.js 22.12+ (tested with Node 24).

```sh
npm ci
npm run dev
```

Open the address printed by Vite. Choose Practice for an instant match, Host a room to create a multiplayer arena, or Join friends with a six-character code. Click Resume game to capture the mouse when prompted. Escape releases it. The game requires a desktop browser with WebGL and a mouse/keyboard; the lobby fits phones, but touch gameplay is not implemented.

## Deploy to Vercel

1. Import this `riftfall` folder as a Vercel project, or put its contents in your Git repository and import that repository.
2. Select the Vite framework preset. If your repository contains a parent folder, set Root Directory to `riftfall`.
3. Build command: `npm run build`. Output directory: `dist`.
4. Deploy. `vercel.json` already contains these settings. No environment variables are needed for the default setup.
5. Open the deployed URL, choose Host a room, then Copy invite link. Friends open that link or enter the room code on the same deployment.

Alternatively, from this folder run `npx vercel` using your Vercel account.

The local preview is not a public deployment. Share the Vercel URL after deploying, not a localhost link.

## Controls

| Input | Action |
| --- | --- |
| WASD + mouse | Move and look |
| Left mouse | Automatic fire or sword swing |
| Right mouse | Aim/scope with guns; activate sword ability |
| V | Alternate sword ability key |
| Space, then Space again | Jump, then double jump |
| Ctrl | Sprint; with a sniper, hold to scope and click the trackpad to fire |
| Shift | Sneak/focus: slower movement and tighter shot spread |
| C while sprinting | Slide |
| R | Reload; reserve ammo is unlimited |
| 1–5 or mouse wheel | Change weapon |
| Q | Throw a grenade; 3.5-second cooldown |
| E | Grapple a wall or tower within 28m; costs 10 mana |
| F | Florid mend: +45 health, costs 20 mana |
| G near ground loot | Pick up a weapon or relic |
| X | Use the pocket relic in your sixth hotbar slot |
| Tab | Hold for scoreboard |
| Escape | Release mouse; pause practice or open room menu |

The HUD shows available jumps, mana, ammo, cooldowns, scores, and a minimap. At 35 health or less a persistent red border warns you. Practice pauses while the menu is open; online rooms keep running.

## Arsenal and damage

In FFA, all players spawn with three guns, two empty sword slots, 100 health, 50 shield and 100 mana. AOTE and AOTD are drop-only and never granted on spawn. AOTE remains usable until you die; AOTD is consumed by one use. Small supplies auto-collect. Ground weapons equip with a quick swap animation and refill their magazine; sword drops also refill mana.

| Slot | Weapon | Behavior |
| --- | --- | --- |
| 1 | Wayfinder AR | 8 body damage; 100 headshot damage, so a fully healthy/shielded player takes two headshots |
| 2 | Breachcaster | Eight 4-damage pellets; any headshot is an instant elimination |
| 3 | Longshot | Any hit eliminates instantly, even at maximum shield |
| 4 | Aspect of the End | Find on the ground; lost on death. 15 body damage; aimed head hit eliminates. Right click/V teleports up to 9m through open space, costs 15 mana; 0.22s cooldown |
| 5 | Aspect of the Dragons | Drop-only. One swing or 14m Dragon Rage blast instantly eliminates on hit, then consumes the sword even if you miss. No mana required. Reverts to AOTE if owned, otherwise the rifle |

Bots deal half normal damage, capped at 12 damage per hit, so practice fights last longer. Human sniper and headshot rules remain as requested. Walls block gunfire, blasts and grenades. Spawn protection lasts 2.5 seconds and ends when you attack. Death respawns you after 3 seconds. The first player to 20 wins, scoring stops, and the host can restart the round.

## Gun Game

Select **Gun Game · 20 weapons** under Game mode before starting practice or hosting. Friends joining your room automatically use its mode and arena. Each credited elimination moves you one stage, replaces your only weapon, refills its magazine and plays the swap animation. Dying keeps your stage. The twentieth elimination, with the final Crown Blade, wins. Rematch resets everyone to stage one.

The ladder is Sidekick, Wayfinder AR, Short Fuse, Needle SMG, Copperhead, Scout, Breachcaster, Ranger Carbine, Pocket Auto, Street Sweeper, Longshot, Heavy Hand, Drumrunner, Quad Barrel, Frostbite, Pulse Carbine, Scrap Saber, Dragon Cleaver, Aspect of the End, and Crown Blade. Each has a distinct model and icon plus its own magazine, fire timing, damage or reach. The lobby's **View all 20 weapons** opens the illustrated ladder.

Only the current stage weapon is available. Weapon switching, all ground loot, pocket relics and Q grenades are disabled, including random Relic party gifts and nukes. Small automatic health/shield/mana/speed supplies, healing, grappling, jumps and other game master modifiers still work. Stage 19's End Sword can teleport; the other swords use melee swings. Hold Ctrl to scope any sniper. Pistols and shotguns retain instant headshots; rifles and the SMG deal 100 headshot damage. All human sniper hits and the final Crown Blade are one-tap. Bots retain their gentler damage cap.

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

AOTE can chain while holding right mouse or V. Default ability cooldowns are 0.22s for AOTE, 1.5s for grapple, 3s for healing and 3.5s for grenades. Mana regenerates at 16/second. Weapon changes play a 0.32s lower-and-raise animation; reloading tilts the weapon, moves the magazine and shows progress.

## Unique ground loot

Drops have real 3D models, rarity beacons and an on-screen pickup prompt. Press G within range; you cannot grab them through a wall. They respawn after 22 seconds and are shared across the room.

- **Rift Orb:** full mana; immediately resets teleport, grapple and heal cooldowns. Does not restore a consumed AOTD.
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

The build is static and runs entirely in browsers. PeerJS uses its public signaling service to connect browsers; gameplay travels over WebRTC data channels. The host browser simulates bots, validates combat, applies damage, owns item cooldowns, respawns players and tracks the score. Clients predict their own movement and interpolate other players. Teleports carry an acknowledgement number so stale movement packets cannot undo them.

Rooms support up to eight total players, including bots. Bots can be disabled when hosting. A joining human replaces a bot if the room is full. Invite links carry the room code. These are join-by-code friend rooms, not a persistent public server list or global matchmaking service.

Keep the host's tab open and active. Rooms end when the host closes the tab; there is no host migration. Browser-hosted matches are designed for casual friends, not competitive anti-cheat: player movement is client-driven, and a modified host can change its game. Scores are per-round, not stored in a database.

The default signaling service needs internet access. Some firewalls or symmetric NAT networks require a TURN relay. `.env.example` documents optional ICE/TURN and custom signaling settings. Client-side `VITE_` values are public, so use short-lived TURN credentials if supplying a relay. For production reliability you can run your own [PeerServer](https://peerjs.com/server/getting-started). See [PeerJS connection documentation](https://peerjs.com/client/getting-started).

## Validation

```sh
npm test
npm run build
```

The 236-test rules/physics suite covers the full 20-stage Gun Game run, stage ownership, per-weapon reloads, single-inventory restrictions, rematches, nuke scoring and life history, AOTE ownership, Bonzo area/self-damage, damage, headshots, shield absorption, wall occlusion, reload timing, respawns, victory freeze, teleport acknowledgement, loot, map spawn clearance and fast-movement collision.

With the dev server running on port 5173 and Google Chrome installed:

```sh
npm run test:browser
npm run test:relic-network
npm run test:expansion
npm run test:cosmetics
npm run test:gun-game
```

The browser integration run uses real mouse/keyboard input and two separate browser contexts through the public PeerJS service. It checks lobby controls, settings, movement, double jump, Ctrl sprint/slide, Ctrl sniper scope and trackpad click firing, Shift focus, weapon swap/magazine animations, firing/reload, abilities, AOTD drop-only pickup and consumption, all six X-key relics, four jumps, fast reload, ground loot, sword animation, low-health UI, victory/rematch, room creation/join, synchronized movement, host-owned guest ammo, guest teleport acknowledgement, a multiplayer AOTD elimination and consumption, host game-master settings, modifier synchronization and disconnect cleanup. Small test fixtures position players deterministically; gameplay actions use actual key/mouse input. The extra relic network run checks remote freezing, real two-way swaps, gravity impulses, shared healing, rocket movement, party gifts and guest permission guards. The expansion run checks all new arenas, actual recoil and pellet markers, integer damage, headshot/multikill banners, nuke pickup/use/scoring and automatic host-map loading. The Locker check tests colors, all gear, reset, persistence and live multiplayer appearance updates. The Gun Game check fires through all 20 stages, tests death and rematch behavior, confirms host/guest progression, and checks that FFA loadouts return when changing modes. Screenshots are saved under `/tmp/riftfall-*.png`.

## Project layout

- `src/engine.ts`: renderer, camera, movement, inputs, audiovisual feedback and session orchestration.
- `src/simulation.ts`: host-owned gameplay rules, combat, bots, pickups and rounds.
- `src/physics.ts`: collision, substep movement and ray queries.
- `src/network.ts`: WebRTC rooms and packet transport.
- `src/assets/`: original map, animated characters, weapons, effects and loot geometry.
- `src/App.tsx`, `src/style.css`: lobby, HUD, menus and settings.
- `src/rules.ts`, `src/loot-rules.ts`: balance and item data.

Original map, weapon geometry, item graphics and generated audio are included. No external 3D models, game audio, or Epic/Hypixel artwork is copied. The game is fan-made and is not affiliated with Epic Games or Hypixel. Tanker is provided by Indian Type Foundry/Fontshare under the included `public/fonts/FFL.txt` license for use in this game; it is not offered as a standalone font download product. Runtime libraries retain their own licenses in their packages.
