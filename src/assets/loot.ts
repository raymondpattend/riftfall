import * as THREE from 'three';
import type { WeaponId } from '../world-types';
import { createWeapon } from './weapons';
import { GADGETS, isGadget, type GadgetId } from '../gadgets';
import { createGadget } from './gadgets';

export type LootKind = WeaponId | GadgetId | 'rift_orb' | 'dragon_heart';

export const LOOT_NAMES: Record<LootKind, string> = {
  rifle: 'Rift Rifle',
  shotgun: 'Twinshot',
  sniper: 'Longglass',
  aote: 'Aspect of the End',
  aotd: 'Aspect of the Dragons',
  rift_orb: 'Rift Orb',
  dragon_heart: 'Dragon Heart',
  nuke: GADGETS.nuke.name,
  ice_wand: GADGETS.ice_wand.name,
  bonzo_staff: GADGETS.bonzo_staff.name,
  swap_pearl: GADGETS.swap_pearl.name,
  gravity_orb: GADGETS.gravity_orb.name,
  healing_totem: GADGETS.healing_totem.name,
  rocket_boots: GADGETS.rocket_boots.name,
};

const rarity: Record<LootKind, number> = {
  rifle: 0x50adff,
  shotgun: 0x50adff,
  sniper: 0x50adff,
  aote: 0xc07aff,
  aotd: 0xffb84d,
  rift_orb: 0x45f0f2,
  dragon_heart: 0xff844b,
  nuke: GADGETS.nuke.color,
  ice_wand: GADGETS.ice_wand.color,
  bonzo_staff: GADGETS.bonzo_staff.color,
  swap_pearl: GADGETS.swap_pearl.color,
  gravity_orb: GADGETS.gravity_orb.color,
  healing_totem: GADGETS.healing_totem.color,
  rocket_boots: GADGETS.rocket_boots.color,
};

function surface(color: number, emissive = 0, intensity = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.4, metalness: 0.25, flatShading: true });
}

function addMesh(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
  position: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function extrudedSilhouette(group: THREE.Group, points: [number, number][], depth: number, material: THREE.Material, name: string, z = 0) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
  geometry.translate(0, 0, -depth / 2);
  return addMesh(group, geometry, material, name, [0, 0, z]);
}

function buildRiftOrb(): THREE.Group {
  const group = new THREE.Group();
  const crystal = surface(0x82fffd, 0x27dfea, 0.8);
  const trim = surface(0x286ec3, 0x329bfc, 0.3);
  const edges = surface(0xe7ffff, 0x65fffb, 0.5);
  const core = addMesh(group, new THREE.IcosahedronGeometry(0.155, 0), crystal, 'Faceted rift core');
  core.scale.y = 1.15;

  for (const side of [-1, 1]) {
    const orbital = addMesh(group, new THREE.TorusGeometry(0.245, 0.014, 4, 32), trim, `Tilted rift orbit ${side}`);
    orbital.rotation.set(side * 0.65, side * 0.55, Math.PI / 6);
    const cap = addMesh(group, new THREE.OctahedronGeometry(0.063), edges, `Polar crystal ${side}`, [0, side * 0.255, 0]);
    cap.scale.set(0.68, 1.5, 0.68);
  }

  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    const shard = addMesh(group, new THREE.OctahedronGeometry(0.052), i % 2 ? edges : crystal, `Orbiting rift shard ${i}`, [Math.cos(angle) * 0.283, Math.sin(angle) * 0.11, Math.sin(angle) * 0.283]);
    shard.scale.set(0.62, 1.35, 0.62);
    shard.rotation.z = -angle;
  }

  return group;
}

function buildDragonHeart(): THREE.Group {
  const group = new THREE.Group();
  const ember = surface(0xff633e, 0xff3f0f, 0.65);
  const gold = surface(0xffc969, 0xff9c27, 0.25);
  const wing = surface(0xbd431f, 0xc53715, 0.15);
  const bright = surface(0xffefb8, 0xffb638, 0.8);

  extrudedSilhouette(group, [
    [0, -0.205], [-0.16, -0.055], [-0.175, 0.095], [-0.105, 0.155],
    [-0.045, 0.145], [0, 0.08], [0.045, 0.145], [0.105, 0.155],
    [0.175, 0.095], [0.16, -0.055],
  ], 0.145, ember, 'Sculpted dragon heart');

  const inner = addMesh(group, new THREE.OctahedronGeometry(0.115), bright, 'Heartfire crystal', [0, -0.012, 0]);
  inner.scale.set(0.73, 1.18, 1.1);

  for (const side of [-1, 1]) {
    extrudedSilhouette(group, [
      [side * 0.11, -0.055], [side * 0.215, 0.005], [side * 0.32, 0.19],
      [side * 0.395, 0.3], [side * 0.363, 0.057], [side * 0.297, 0.105],
      [side * 0.265, -0.055], [side * 0.203, -0.013], [side * 0.16, -0.11],
    ], 0.057, wing, `Flared dragon wing ${side}`);

    extrudedSilhouette(group, [
      [side * 0.133, -0.008], [side * 0.227, 0.048], [side * 0.35, 0.233],
      [side * 0.405, 0.325], [side * 0.38, 0.208], [side * 0.243, 0.014],
      [side * 0.17, -0.047],
    ], 0.071, gold, `Golden wing bone ${side}`);

    const horn = addMesh(group, new THREE.ConeGeometry(0.038, 0.132, 5), gold, `Heart crown horn ${side}`, [side * 0.079, 0.183, 0]);
    horn.rotation.z = side * -0.4;

    for (const face of [-1, 1]) {
      extrudedSilhouette(group, [
        [side * 0.079, 0.103], [side * 0.039, 0.033], [side * 0.055, 0.009],
        [0, -0.153], [side * 0.023, -0.019], [side * 0.009, 0.015],
      ], 0.006, bright, `Heartfire fissure ${side}-${face}`, face * 0.075);
    }
  }

  const tail = addMesh(group, new THREE.OctahedronGeometry(0.061), gold, 'Golden heart tip', [0, -0.231, 0]);
  tail.scale.set(0.7, 1.1, 0.7);
  return group;
}

/**
 * Floor-anchored pickup: ring at y=.035, named `display` centered at y=.78.
 * Rotate the root around Y for a complete pickup spin, or animate `display`
 * around its stored userData.restY to bob the item while its beacon stays put.
 */
export function createGroundLoot(kind: LootKind): THREE.Group {
  const group = new THREE.Group();
  group.name = `Ground loot: ${kind}`;
  group.userData.kind = kind;
  group.userData.label = LOOT_NAMES[kind];
  group.userData.rarityColor = rarity[kind];

  const color = rarity[kind];
  const beaconMaterial = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.115, depthWrite: false,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  const beacon = addMesh(group, new THREE.CylinderGeometry(0.06, 0.28, 1.45, 8, 1, true), beaconMaterial, 'Rarity light shaft', [0, 0.75, 0]);
  beacon.castShadow = false;
  beacon.receiveShadow = false;

  const markerMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false });
  const ring = addMesh(group, new THREE.TorusGeometry(0.43, 0.014, 4, 48), markerMaterial, 'Pickup floor ring', [0, 0.035, 0]);
  ring.rotation.x = Math.PI / 2;
  ring.castShadow = false;
  ring.receiveShadow = false;

  for (let i = 0; i < 3; i++) {
    const angle = i * Math.PI * 2 / 3;
    const marker = addMesh(group, new THREE.OctahedronGeometry(0.035), markerMaterial, `Rarity marker ${i}`, [Math.cos(angle) * 0.43, 0.052, Math.sin(angle) * 0.43]);
    marker.scale.y = 0.45;
    marker.castShadow = false;
    marker.receiveShadow = false;
  }

  let display: THREE.Group;
  if (kind === 'rift_orb') {
    display = buildRiftOrb();
  } else if (kind === 'dragon_heart') {
    display = buildDragonHeart();
  } else if (isGadget(kind)) {
    display = new THREE.Group();
    const gadget = createGadget(kind);
    display.add(gadget);
    if (kind === 'ice_wand' || kind === 'bonzo_staff') gadget.rotation.z = -Math.PI * .33;
    else if (kind === 'rocket_boots') gadget.rotation.y = -.38;
    const bounds = new THREE.Box3().setFromObject(gadget);
    const size = bounds.getSize(new THREE.Vector3());
    gadget.scale.setScalar(Math.min(.96 / Math.max(size.x, size.y, size.z), .66 / size.y));
    gadget.position.sub(new THREE.Box3().setFromObject(gadget).getCenter(new THREE.Vector3()));
  } else {
    const weapon = createWeapon(kind);
    display = new THREE.Group();
    display.add(weapon);
    weapon.scale.setScalar(0.78);
    if (kind === 'aote' || kind === 'aotd') {
      weapon.rotation.set(0.22, 0.32, -Math.PI * 0.43);
    } else {
      weapon.rotation.set(0.08, -Math.PI * 0.21, -0.09);
    }
    // Center the complete model, including its stock or pommel, above the ring.
    const center = new THREE.Box3().setFromObject(weapon).getCenter(new THREE.Vector3());
    weapon.position.sub(center);
  }

  display.name = 'display';
  display.position.y = 0.78;
  display.userData.restY = 0.78;
  group.add(display);
  return group;
}
