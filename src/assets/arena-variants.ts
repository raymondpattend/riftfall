import * as THREE from 'three';
import {createParkourArena} from './parkour-arena';
import { createArena } from './arena';
import type { ArenaAsset, ArenaId, Collider, JumpPad, PickupPoint, SpawnPoint } from '../world-types';
import { GROUND_LOOT } from '../loot-rules';
import type { GroundLootPoint } from '../loot-rules';

export const ARENAS: Array<{ id: ArenaId; name: string; description: string; color: number }> = [
  { id: 'sky-steps', name: 'Sky Steps', description: '64 randomized jumps through rising islands, beams and moving ledges.', color: 0x8fbdac },
  { id: 'switchback', name: 'Switchback', description: '64 twisting jumps, narrow landings and long gaps. New route each round.', color: 0xcbb59b },
  { id: 'crown', name: 'The Crown', description: 'Floating courtyards, rooftop routes and the original rift.', color: 0x54bc3d },
  { id: 'foundry', name: 'Skyforge Foundry', description: 'A catwalk circuit surrounds a climbable central furnace.', color: 0xf38836 },
  { id: 'glacier', name: 'Glacier Run', description: 'Two bridges span an ice canyon between snowy ridges.', color: 0x6dd7f1 },
  { id: 'dunes', name: 'Sunstruck Dunes', description: 'Four ruined courtyards surround a stepped desert temple.', color: 0xe8b859 },
];

type Material = THREE.MeshStandardMaterial;
type Position = [number, number, number];
type Colors = { ground: number; wall: number; top: number; dark: number; accent: number; bright: number; trim: number };
const lootSpecs = [
  ['gadget-ice', 'ice_wand'], ['gadget-bonzo', 'bonzo_staff'], ['gadget-pearl', 'swap_pearl'],
  ['gadget-gravity', 'gravity_orb'], ['gadget-totem', 'healing_totem'], ['gadget-rocket', 'rocket_boots'],
  ['loot-aote', 'aote'], ['loot-dragon', 'aotd'], ['loot-sniper', 'sniper'], ['loot-shotgun', 'shotgun'],
  ['loot-rifle', 'rifle'], ['loot-orb', 'rift_orb'], ['loot-orb-west', 'rift_orb'],
  ['loot-heart', 'dragon_heart'], ['loot-heart-north', 'dragon_heart'], ['gadget-nuke', 'nuke'],
] as const;

/** Only closed structural solids and true inlays: no decal boxes or coplanar floor overlays. */
function builder(name: string, colors: Colors, background: number, fog: number) {
  const group = new THREE.Group(); group.name = name;
  const colliders: Collider[] = [], jumpPads: JumpPad[] = [];
  const motions: Array<{ mesh: THREE.Object3D; y: number; phase: number }> = [];
  const mat = (color: number, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness, flatShading: true });
  const m = { ground: mat(colors.ground), wall: mat(colors.wall), top: mat(colors.top), dark: mat(colors.dark),
    accent: mat(colors.accent), bright: mat(colors.bright), trim: mat(colors.trim, 0.12),
    wood: mat(0x986335), woodLight: mat(0xd09b50), leaf: mat(0x329845), leafLight: mat(0x78ca43), white: mat(0xf1f8ff) };
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const bounds = new THREE.Box3();
  const collision = (mesh: THREE.Object3D) => {
    mesh.updateMatrixWorld(true); bounds.setFromObject(mesh);
    colliders.push({ minX: bounds.min.x, maxX: bounds.max.x, minY: bounds.min.y, maxY: bounds.max.y,
      minZ: bounds.min.z, maxZ: bounds.max.z });
  };
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], x: number, y: number, z: number) => {
    const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z);
    object.castShadow = y > 0; object.receiveShadow = true; group.add(object); return object;
  };
  // top is the real walkable height. Different top colors are face materials, never overlays.
  const block = (x: number, top: number, z: number, width: number, height: number, depth: number,
    side: Material = m.wall, cap: Material = side, solid = true) => {
    const object = mesh(cube, [side, side, cap, side, side, side], x, top - height / 2, z);
    object.scale.set(width, height, depth); if (solid) collision(object); return object;
  };
  const deck = (x: number, z: number, width: number, depth: number, top: number, cap: Material = m.top) =>
    block(x, top, z, width, 0.45, depth, m.wall, cap);
  const support = (x: number, z: number, top: number, width = 0.8) => block(x, top, z, width, top, width, m.dark);
  const stairs = (x: number, z: number, count: number, dx: number, dz: number, ground = 0, run = 0.75, width = 4.2) => {
    for (let i = 0; i < count; i++) {
      const height = (i + 1) * 0.3;
      block(x + dx * run * (i + 0.5), ground + height, z + dz * run * (i + 0.5),
        dx ? run : width, height, dz ? run : width, m.wall, i % 3 === 0 ? m.bright : m.top);
    }
  };
  const crate = (x: number, z: number, bottom = 0, size = 1.7, color = m.wood) => {
    block(x, bottom + size, z, size, size, size, color);
    block(x, bottom + size * 0.25, z, size + 0.08, 0.14, size + 0.08, m.woodLight, m.woodLight, false);
    block(x, bottom + size * 0.85, z, size + 0.08, 0.14, size + 0.08, m.woodLight, m.woodLight, false);
  };
  const crystal = (x: number, z: number, height = 4, radius = 0.9, bottom = 0) => {
    const object = mesh(new THREE.CylinderGeometry(radius * 0.45, radius, height * 0.72, 5), m.accent,
      x, bottom + height * 0.36, z); collision(object);
    const tip = mesh(new THREE.ConeGeometry(radius * 0.45, height * 0.28, 5), m.bright,
      x, bottom + height * 0.86, z); collision(tip);
  };
  const tree = (x: number, z: number, bottom = 0, snow = false, scale = 1) => {
    block(x, bottom + 2.6 * scale, z, 0.55 * scale, 2.6 * scale, 0.55 * scale, m.wood);
    const crown = mesh(new THREE.IcosahedronGeometry(2.4 * scale, 0), snow ? m.white : m.leaf,
      x, bottom + 4.05 * scale, z); crown.scale.set(1.15, 0.9, 1);
    const upper = mesh(new THREE.IcosahedronGeometry(1.6 * scale, 0), snow ? m.top : m.leafLight,
      x + 0.7 * scale, bottom + 5.45 * scale, z); upper.scale.set(1.1, 0.9, 1);
  };
  const pillar = (x: number, z: number, bottom: number, height: number, width = 1) => {
    // Three touching sections, without overlapping visible top or side faces.
    block(x, bottom + 0.3, z, width + 0.35, 0.3, width + 0.35, m.accent);
    block(x, bottom + height - 0.3, z, width, height - 0.6, width, m.wall);
    block(x, bottom + height, z, width + 0.35, 0.3, width + 0.35, m.top);
  };
  const pad = (x: number, z: number, bottom = 0, power = 16.5) => {
    const y = bottom + 0.16;
    const rim = mesh(new THREE.CylinderGeometry(1.65, 1.8, 0.12, 8), m.dark, x, bottom + 0.06, z); collision(rim);
    const edge = mesh(new THREE.CylinderGeometry(1.42, 1.42, 0.04, 8, 1, true), m.accent, x, bottom + 0.14, z); collision(edge);
    const outline = new THREE.Shape(Array.from({ length: 8 }, (_, i) => new THREE.Vector2(Math.sin(i * Math.PI / 4) * 1.42, Math.cos(i * Math.PI / 4) * 1.42)));
    const arrow = new THREE.Shape([new THREE.Vector2(-0.7, -0.45), new THREE.Vector2(0.7, -0.45), new THREE.Vector2(0, 0.8)]);
    outline.holes.push(new THREE.Path(arrow.getPoints()));
    for (const [shape, color] of [[outline, m.accent], [arrow, m.white]] as const) {
      const inlay = mesh(new THREE.ShapeGeometry(shape), color, x, y, z); inlay.rotation.x = -Math.PI / 2;
    }
    jumpPads.push({ x, y, z, radius: 1.6, power });
  };
  const spawns = (upper: Position[]): SpawnPoint[] => [
    [-36, 0, -36], [36, 0, -36], [36, 0, 36], [-36, 0, 36],
    [0, 0, -36], [36, 0, 0], [0, 0, 36], [-36, 0, 0], ...upper,
  ].map(([x, y, z]) => ({ x, y: y + 0.05, z, yaw: Math.atan2(x, z) }));
  const loot = (positions: Position[]): GroundLootPoint[] => lootSpecs.map(([id, kind], i) => {
    const [x, y, z] = positions[i]; return { id, kind, x, y, z };
  });
  const pickups = (positions: Position[]): PickupPoint[] => positions.map(([x, y, z], i) => ({
    id: `supply-${i}`, kind: (['health', 'shield', 'mana', 'haste'] as const)[i % 4], x, y: y + 0.9, z,
  }));
  const finish = (upper: Position[], supplies: Position[], lootPositions: Position[]): ArenaAsset => ({
    name, group, colliders, spawns: spawns(upper), pickups: pickups(supplies), jumpPads,
    loot: loot(lootPositions), background, fog,
    update(time) { for (const item of motions) { item.mesh.rotation.y = time * 0.3 + item.phase; item.mesh.position.y = item.y + Math.sin(time + item.phase) * 0.14; } },
  });
  // Exactly one terrain top at y=0. The same solid supplies its ground collider.
  block(0, 0, 0, 84, 4, 84, m.dark, m.ground);
  const root = mesh(new THREE.CylinderGeometry(59.397, 24, 17, 4), m.wall, 0, -12.5, 0); root.rotation.y = Math.PI / 4;
  const rootTip = mesh(new THREE.ConeGeometry(24, 13, 4), m.dark, 0, -27.5, 0); rootTip.rotation.z = Math.PI; rootTip.rotation.y = Math.PI / 4;
  // Sparse edge barriers keep a readable void boundary, with deliberate knockback gaps.
  for (const s of [-1, 1]) for (const v of [-28, -12, 12, 28]) {
    block(v, 1, s * 41, 7, 1, 1.2, m.wall, m.top);
    block(s * 41, 1, v, 1.2, 1, 7, m.wall, m.top);
  }
  for (const [x, z, size] of [[-100, -65, 12], [98, 92, 15], [15, -115, 9]]) {
    const island = mesh(new THREE.CylinderGeometry(size, size * 0.8, 2, 5), m.ground, x, -6, z);
    island.rotation.y = 0.2;
    const rock = mesh(new THREE.ConeGeometry(size * 0.8, size * 1.7, 5), m.wall, x, -7 - size * 0.85, z);
    rock.rotation.z = Math.PI; rock.rotation.y = 0.2;
  }
  return { group, m, mesh, block, deck, support, stairs, crate, crystal, tree, pillar, pad, collision, motions, finish };
}

function foundry(): ArenaAsset {
  const b = builder('Skyforge Foundry', { ground: 0x538fa8, wall: 0x416b93, top: 0xb0d5e6, dark: 0x274768,
    accent: 0xf17b31, bright: 0xffc266, trim: 0xffdc76 }, 0x63b9f5, 0x9ed7ee);
  const { m, block, deck, support, stairs, crate, pad } = b;
  // Two long galleries, joined at each end. Every gallery has an exterior staircase.
  for (const x of [-24, 24]) {
    deck(x, 0, 10, 40, 4.2);
    for (const z of [-17, 0, 17]) for (const offset of [-4, 4]) support(x + offset, z, 3.75);
    for (const z of [-10, 10]) block(x + Math.sign(x) * 4.55, 5.05, z, 0.6, 0.85, 12, m.accent, m.bright);
  }
  for (const z of [-16, 16]) {
    deck(0, z, 38, 5, 4.2);
    for (const x of [-12, 12]) support(x, z, 3.75);
    // Rails stop short of the central furnace stair and the gallery junctions.
    for (const x of [-10.4, 10.4]) block(x, 5.05, z + Math.sign(z) * 2.18, 13, 0.85, 0.6, m.accent, m.bright);
  }
  stairs(-24, -29.1, 14, 0, 1, 0, 0.65);
  stairs(24, 29.1, 14, 0, -1, 0, 0.65);
  // Furnace itself is a climbable structure, not a blocking decoration on a roof.
  block(0, 7.2, 0, 12, 7.2, 14, m.dark, m.top);
  stairs(0, -13.5, 10, 0, 1, 4.2, 0.65, 3.8);
  for (const x of [-4.3, 4.3]) for (const z of [-4.9, 4.9]) {
    block(x, 12.2, z, 1.45, 5, 1.45, m.wall, m.top);
    block(x, 11.65, z, 1.6, 1.3, 1.6, m.accent, m.bright);
    block(x, 12.65, z, 2.15, 0.45, 2.15, m.dark, m.bright);
  }
  // Front furnace doors are thick, offset metal details with no coplanar faces.
  for (const x of [-2.6, 2.6]) {
    block(x, 4.8, 7.12, 3.5, 3.8, 0.24, m.accent, m.bright, false);
    for (const line of [-0.8, 0, 0.8]) block(x + line, 4.35, 7.3, 0.15, 2.8, 0.12, m.dark, m.dark, false);
  }
  // Paired loading sheds make very different ground routes from the upper loop.
  for (const [x, z, turn] of [[-12, 28, 1], [12, -28, -1]]) {
    block(x, 2.8, z, 9, 2.8, 4.5, m.wall, m.accent);
    crate(x - turn * 2, z + turn * 4, 0, 1.5);
    crate(x + turn * 3, z + turn * 3.8, 0, 1.8);
  }
  for (const [x, z, y] of [[-25, 4, 4.2], [25, -4, 4.2], [-35, -17, 0], [35, 17, 0], [-13, -17, 0], [13, 17, 0], [-12, 10, 0], [12, -10, 0]]) {
    crate(x, z, y, 1.7);
  }
  for (const [x, z] of [[-34, 25], [34, -25]]) {
    block(x, 3.2, z, 3.6, 3.2, 3.6, m.dark, m.accent);
    const fan = b.mesh(new THREE.TorusGeometry(1.1, 0.22, 4, 8), m.bright, x, 4.2, z);
    fan.rotation.x = Math.PI / 2; b.motions.push({ mesh: fan, y: 4.2, phase: x });
  }
  pad(-12, -4); pad(12, 4); pad(-34, -27, 0, 17); pad(34, 27, 0, 17);
  return b.finish(
    [[-24, 4.2, -12], [24, 4.2, -12], [-24, 4.2, 12], [24, 4.2, 12]],
    [[-24, 4.2, 7], [24, 4.2, -7], [-10, 0, -24], [10, 0, 24], [-34, 0, -8], [34, 0, 8], [-3, 7.2, 0], [3, 7.2, 0]],
    [[-24, 4.2, -7], [24, 4.2, 7], [0, 4.2, -16], [0, 4.2, 16], [-35, 0, 8], [35, 0, -8],
      [-15, 0, -8], [0, 7.2, -3], [24, 4.2, -16], [-24, 4.2, 16], [-7, 0, -28], [14, 0, 0], [-14, 0, 0],
      [7, 0, 28], [-24, 4.2, 0], [0, 7.2, 3]],
  );
}

function glacier(): ArenaAsset {
  const b = builder('Glacier Run', { ground: 0x5ab4d8, wall: 0x429dd1, top: 0xe9f8ff, dark: 0x245f93,
    accent: 0x57d9f1, bright: 0xbaf5ff, trim: 0x37659a }, 0x84c9f4, 0xb7e7fb);
  const { m, block, deck, stairs, pillar, crystal, tree, crate, pad } = b;
  // The canyon is real empty space between two 3.6m high ridges. Its floor is y=0.
  for (const x of [-23, 23]) {
    block(x, 3.6, 0, 20, 3.6, 62, m.wall, m.top);
    for (const z of [-11, 11]) block(x + Math.sign(x) * 7.7, 6.3, z, 3.6, 2.7, 10, m.wall, m.bright);
  }
  // Two separated crossings leave a wide clear canyon underneath.
  for (const z of [-15, 15]) {
    deck(0, z, 26, 5, 3.6, m.bright);
    for (const side of [-1, 1]) {
      block(0, 4.3, z + side * 2.22, 24, 0.7, 0.5, m.dark, m.top);
    }
    for (const x of [-11.6, 11.6]) pillar(x, z, 0, 3.15, 0.9);
  }
  stairs(-3.88, -26, 12, -1, 0, 0, 0.76);
  stairs(3.88, 26, 12, 1, 0, 0, 0.76);
  stairs(-24, 40.12, 12, 0, -1, 0, 0.76);
  stairs(24, -40.12, 12, 0, 1, 0, 0.76);
  // Frozen arch and independent crystal cover split long shots down the canyon.
  for (const x of [-4.5, 4.5]) block(x, 6.7, 0, 1.7, 6.7, 2.2, m.accent, m.bright);
  block(0, 7.6, 0, 11.2, 0.9, 2.2, m.wall, m.top);
  for (const [x, z, h] of [[-7.7, -6, 3.9], [7.7, 6, 3.9], [6.7, -9, 2.5], [-6.7, 9, 2.5]]) crystal(x, z, h, 1.05);
  // An old expedition hut and a glacier lookout have different upper silhouettes.
  block(-23, 5.6, 0, 7.5, 2, 4, m.dark, m.top);
  crate(-23, -4, 3.6, 1.5);
  for (const z of [-3.5, 3.5]) for (const x of [20, 26]) pillar(x, z, 3.6, 3.15, 0.8);
  block(23, 7.2, 0, 8.4, 0.45, 9, m.wall, m.top);
  stairs(23, 11.1, 12, 0, -1, 3.6, 0.55, 3.3);
  for (const [x, z, scale] of [[-27, -24, 0.8], [28, 24, 0.8], [-19, 23, 0.64], [19, -23, 0.64]]) tree(x, z, 3.6, true, scale);
  for (const [x, z] of [[-37, 16], [37, -16], [-9, 32], [9, -32]]) {
    block(x, 1.5, z, 3.6, 1.5, 2.2, m.wall, m.top);
  }
  for (const [x, z] of [[-25, 15], [25, -15], [-18, -7], [18, 7]]) crate(x, z, 3.6, 1.5, m.dark);
  pad(0, -7, 0, 15.5); pad(0, 7, 0, 15.5); pad(-23, -29, 3.6, 15); pad(23, 29, 3.6, 15);
  return b.finish(
    [[-22, 3.6, -22], [22, 3.6, -22], [-22, 3.6, 22], [22, 3.6, 22]],
    [[-22, 3.6, -18], [22, 3.6, 18], [-8, 0, 20], [8, 0, -20], [-36, 0, -6], [36, 0, 6], [-23, 3.6, 25], [23, 3.6, -25]],
    [[-22, 3.6, -15], [22, 3.6, 15], [-23, 3.6, 7], [0, 0, 0], [-36, 0, 0], [36, 0, 0],
      [0, 0, 27], [0, 3.6, -15], [25, 3.6, -11], [-25, 3.6, 11], [0, 0, -28], [9, 0, 0], [-9, 0, 0],
      [24, 3.6, 25], [-24, 3.6, -25], [0, 3.6, 15]],
  );
}

function dunes(): ArenaAsset {
  const b = builder('Sunstruck Dunes', { ground: 0xe5b66c, wall: 0xd19148, top: 0xffdc8d, dark: 0x9d663e,
    accent: 0x23a8ad, bright: 0xffefbb, trim: 0xffb75d }, 0x65bafa, 0xf2d6a0);
  const { m, block, stairs, pillar, crate, tree, pad } = b;
  // Five genuine terraces and four uninterrupted stair routes climb from y=0 to y=6.
  // Every level starts at the previous level's top; no overlapping exposed tops.
  for (let level = 0; level < 5; level++) {
    const width = 30 - level * 6;
    block(0, (level + 1) * 1.2, 0, width, 1.2, width, m.wall, level === 4 ? m.accent : m.top);
    const edge = width / 2;
    stairs(0, -edge - 3, 4, 0, 1, level * 1.2);
    stairs(0, edge + 3, 4, 0, -1, level * 1.2);
    stairs(-edge - 3, 0, 4, 1, 0, level * 1.2);
    stairs(edge + 3, 0, 4, -1, 0, level * 1.2);
  }
  for (const x of [-1.9, 1.9]) pillar(x, -1.8, 6, 4.2, 0.7);
  block(0, 10.65, -1.8, 5.5, 0.45, 1.5, m.dark, m.bright);
  const sun = b.mesh(new THREE.OctahedronGeometry(1, 0), m.bright, 0, 12.1, -1.8);
  b.motions.push({ mesh: sun, y: 12.1, phase: 0 });
  // Northwest: broken column court, open on the approaches facing the pyramid.
  for (const x of [-31, -25, -19]) pillar(x, -29, 0, x === -25 ? 3.1 : 4.5, 1.1);
  for (const z of [-23, -17]) pillar(-31, z, 0, 4.5, 1.1);
  block(-28, 4.95, -17, 7.4, 0.45, 1.6, m.wall, m.top);
  block(-30, 1.6, -23, 2.4, 1.6, 6, m.wall, m.top);
  // Northeast: an open blue-canopied pavilion with its own accessible balcony.
  block(26, 2.4, -25, 13, 0.45, 11, m.wall, m.accent);
  for (const x of [20.4, 31.6]) for (const z of [-29.5, -20.5]) block(x, 1.95, z, 0.8, 1.95, 0.8, m.dark);
  stairs(26, -13.5, 8, 0, -1, 0, 0.75);
  for (const x of [20.2, 31.8]) block(x, 3.2, -25, 0.6, 0.8, 9, m.wall, m.top);
  // Southwest: staggered ruined rooms, with gaps instead of a maze of closed boxes.
  block(-27, 3.1, 23, 12, 3.1, 1.8, m.wall, m.top);
  block(-32.1, 3.1, 28, 1.8, 3.1, 8.2, m.wall, m.top);
  block(-23, 1.5, 29, 6.5, 1.5, 2, m.wall, m.top);
  crate(-27, 26.5, 0, 1.7);
  // Southeast: three freestanding gateways and a collapsed obelisk supply flank cover.
  for (const z of [19, 26, 33]) {
    pillar(20, z, 0, 3.6, 1); pillar(27, z, 0, 3.6, 1);
    block(23.5, 4.05, z, 8.4, 0.45, 1.4, m.wall, m.top);
  }
  block(33, 1.3, 23, 2.1, 1.3, 7, m.wall, m.accent);
  for (const [x, z] of [[-34, -31], [34, 32], [-34, 10], [34, -8]]) tree(x, z, 0, false, 0.82);
  for (const [x, z] of [[-24, -12], [24, 12], [-12, 26], [12, -26]]) crate(x, z, 0, 1.6);
  for (const [x, z] of [[-34, -13], [34, 13], [-8, -31], [8, 31]]) block(x, 1.4, z, 4, 1.4, 2, m.wall, m.top);
  pad(-23, 7); pad(23, -7); pad(-8, -23, 0, 16); pad(8, 23, 0, 16);
  return b.finish(
    [[-25, 0, -21], [25, 2.4, -24], [-26, 0, 18], [24, 0, 23]],
    [[-13.5, 1.2, -8], [13.5, 1.2, 8], [-10.5, 2.4, 8], [10.5, 2.4, -8], [-25, 0, -26], [26, 2.4, -28], [-28, 0, 31], [24, 0, 30]],
    [[-13.5, 1.2, 8], [13.5, 1.2, -8], [10.5, 2.4, 9], [-7.5, 3.6, 7], [-35, 0, 0], [35, 0, 0],
      [0, 0, 28], [4.5, 4.8, 4.5], [-4.5, 4.8, -4.5], [24, 2.4, -25], [-25, 0, 0], [26, 0, 0], [-35, 0, 28],
      [24, 0, 24], [-24, 0, -24], [0, 6, 0]],
  );
}

export function createArenaFor(id: ArenaId,seed=1): ArenaAsset {
  if(id==='sky-steps'||id==='switchback')return createParkourArena(id,seed);
  if (id === 'foundry') return foundry();
  if (id === 'glacier') return glacier();
  if (id === 'dunes') return dunes();
  return { ...createArena(), name: 'The Crown', loot: GROUND_LOOT, background: 0x65bdff, fog: 0x9cd8ff };
}
