import * as THREE from 'three';
import type { PickupKind, WeaponId } from '../world-types';
import { DEFAULT_APPEARANCE, sanitizeAppearance } from '../cosmetics';
import type { Appearance } from '../cosmetics';
import { createGunGameWeapon } from './gun-game-weapons';

const palette = { ink: 0x28353a, shell: 0xdde7df, metal: 0x647a80, teal: 0x64ddc9, copper: 0xc78c63 };

function material(color: number, emissive = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.13, flatShading: true, emissive, emissiveIntensity: 0.65 });
}

function part(parent: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function block(parent: THREE.Object3D, mat: THREE.Material, size: [number, number, number], position: [number, number, number]): THREE.Mesh {
  return part(parent, new THREE.BoxGeometry(...size), mat, ...position);
}

/** Articulated field ranger. Feet are at zero, and the face points toward -Z. */
export function createAvatar(color: number, appearance?: Appearance): {
  group: THREE.Group;
  update: (time: number, speed: number, grounded: boolean, weapon: WeaponId, gunGameStage?: number | null) => void;
  setName: (name: string) => void;
  setAppearance: (appearance: Appearance) => void;
} {
  const group = new THREE.Group();
  group.name = 'Field ranger';
  const shell = material(palette.shell);
  const cloth = material(palette.ink);
  const steel = material(palette.metal);
  const trim = material(color);
  const visor = material(0x6ae6df, 0x2faca6);
  const weaponTrim = material(color);
  const weaponGem = material(0x6ae6df, 0x2faca6);
  const copper = material(palette.copper);
  const crystal = material(0x85f9e0, 0x358575);
  const body = new THREE.Group();
  group.add(body);

  block(body, cloth, [0.43, 0.49, 0.27], [0, 1.14, 0]);
  const chest = part(body, new THREE.CylinderGeometry(0.27, 0.22, 0.36, 5), shell, 0, 1.23, -0.025);
  chest.scale.z = 0.59;
  chest.rotation.y = Math.PI;
  const strap = block(body, trim, [0.075, 0.46, 0.028], [-0.02, 1.16, -0.183]);
  strap.rotation.z = -0.42;
  block(body, cloth, [0.34, 0.16, 0.26], [0, 0.84, 0.01]);
  block(body, copper, [0.09, 0.075, 0.035], [0, 0.92, -0.158]);

  const legs: THREE.Group[] = [];
  const knees: THREE.Group[] = [];
  for (const sign of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(sign * 0.115, 0.85, 0.01);
    body.add(leg);
    block(leg, cloth, [0.18, 0.34, 0.19], [0, -0.17, 0]);
    const knee = new THREE.Group();
    knee.position.y = -0.34;
    leg.add(knee);
    block(knee, shell, [0.18, 0.33, 0.21], [0, -0.165, -0.012]);
    block(knee, cloth, [0.21, 0.18, 0.34], [0, -0.42, -0.065]);
    legs.push(leg);
    knees.push(knee);
  }

  const arms: THREE.Group[] = [];
  const forearms: THREE.Group[] = [];
  for (const sign of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(sign * 0.28, 1.35, 0);
    body.add(arm);
    block(arm, sign === -1 ? trim : shell, [0.19, 0.29, 0.21], [0, -0.12, 0]);
    const forearm = new THREE.Group();
    forearm.position.y = -0.28;
    arm.add(forearm);
    block(forearm, cloth, [0.15, 0.24, 0.18], [0, -0.12, 0]);
    block(forearm, steel, [0.16, 0.13, 0.19], [0, -0.27, 0]);
    arms.push(arm);
    forearms.push(forearm);
  }

  const helmet = part(body, new THREE.CylinderGeometry(0.205, 0.22, 0.34, 6), shell, 0, 1.63, 0);
  helmet.rotation.y = Math.PI / 6;
  helmet.scale.z = 0.89;
  const face = block(body, cloth, [0.3, 0.13, 0.05], [0, 1.61, -0.175]);
  face.rotation.x = -0.08;
  block(body, visor, [0.257, 0.045, 0.02], [0, 1.64, -0.205]);
  block(body, steel, [0.105, 0.09, 0.06], [0, 1.515, -0.17]);
  part(body, new THREE.CylinderGeometry(0.155, 0.19, 0.09, 6), trim, 0, 1.435, 0);
  const scarf = block(body, trim, [0.115, 0.36, 0.025], [-0.105, 1.265, 0.34]);
  scarf.rotation.z = -0.12;

  // All variants belong to this avatar and remain attached for normal disposal.
  // Selection only changes visibility and colors, never allocates new resources.
  const crest = new THREE.Group();
  crest.name = 'Crest headgear';
  body.add(crest);
  const finShape = new THREE.Shape();
  finShape.moveTo(0.19, 0.05);
  finShape.lineTo(0.1, 0.2);
  finShape.lineTo(-0.055, 0.18);
  finShape.lineTo(-0.24, 0.025);
  finShape.lineTo(0.07, 0.045);
  finShape.closePath();
  const fin = part(crest, new THREE.ExtrudeGeometry(finShape, { depth: 0.075, bevelEnabled: false, curveSegments: 1 }), trim, -0.0375, 1.6, 0);
  fin.rotation.y = Math.PI / 2;
  for (const side of [-1, 1]) block(crest, shell, [0.035, 0.05, 0.14], [side * 0.06, 1.715, -0.012]);

  const antenna = new THREE.Group();
  antenna.name = 'Antenna headgear';
  body.add(antenna);
  block(antenna, steel, [0.067, 0.09, 0.1], [-0.218, 1.635, 0.025]);
  const antennaStart = new THREE.Vector3(-0.23, 1.65, 0.025);
  const antennaEnd = new THREE.Vector3(-0.305, 1.768, 0.025);
  const mast = part(antenna, new THREE.CylinderGeometry(0.012, 0.016, antennaStart.distanceTo(antennaEnd), 5), shell, 0, 0, 0);
  mast.position.copy(antennaStart).add(antennaEnd).multiplyScalar(0.5);
  mast.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), antennaEnd.clone().sub(antennaStart).normalize());
  part(antenna, new THREE.OctahedronGeometry(0.028), visor, antennaEnd.x, antennaEnd.y, antennaEnd.z);

  const jetpack = new THREE.Group();
  jetpack.name = 'Twin-engine jetpack';
  body.add(jetpack);
  block(jetpack, steel, [0.27, 0.29, 0.14], [0, 1.19, 0.23]);
  block(jetpack, trim, [0.08, 0.21, 0.025], [0, 1.2, 0.315]);
  for (const side of [-1, 1]) {
    part(jetpack, new THREE.CylinderGeometry(0.085, 0.07, 0.31, 6), shell, side * 0.17, 1.2, 0.265);
    part(jetpack, new THREE.CylinderGeometry(0.05, 0.075, 0.07, 6), copper, side * 0.17, 1.01, 0.265);
    block(jetpack, visor, [0.07, 0.035, 0.025], [side * 0.17, 1.3, 0.339]);
  }

  const cape = new THREE.Group();
  cape.name = 'Folded ranger cape';
  cape.position.set(0, 1.38, 0.19);
  body.add(cape);
  const capeMaterial = material(color);
  capeMaterial.side = THREE.DoubleSide;
  capeMaterial.roughness = 0.95;
  capeMaterial.metalness = 0;
  const capeGeometry = new THREE.BufferGeometry();
  capeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.21, 0, 0.08, 0, -0.01, 0.12, 0.21, 0, 0.08,
    -0.26, -0.37, 0.14, 0, -0.36, 0.26, 0.26, -0.37, 0.14,
    -0.3, -0.78, 0.18, 0, -0.87, 0.34, 0.3, -0.78, 0.18,
  ], 3));
  capeGeometry.setIndex([0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5, 3, 6, 4, 4, 6, 7, 4, 7, 5, 5, 7, 8]);
  capeGeometry.computeVertexNormals();
  part(cape, capeGeometry, capeMaterial, 0, 0, 0);
  for (const side of [-1, 1]) {
    const clasp = part(cape, new THREE.CylinderGeometry(0.027, 0.027, 0.024, 6), copper, side * 0.15, -0.045, 0.091);
    clasp.rotation.x = Math.PI / 2;
  }

  const setAppearance = (nextAppearance: Appearance) => {
    const next = sanitizeAppearance(nextAppearance);
    shell.color.setHex(next.armor);
    trim.color.setHex(next.accent);
    capeMaterial.color.setHex(next.accent);
    visor.color.setHex(next.visor);
    visor.emissive.setHex(next.visor).multiplyScalar(0.45);
    crest.visible = next.headgear === 'crest';
    antenna.visible = next.headgear === 'antenna';
    jetpack.visible = next.backpack === 'jetpack';
    cape.visible = next.backpack === 'cape';
    scarf.visible = next.backpack !== 'cape';
    // A crest gets headroom inside the same 1.8 m silhouette as the bare helmet.
    helmet.scale.y = crest.visible ? 0.82 : 1;
    helmet.position.y = crest.visible ? 1.6 : 1.63;
  };
  setAppearance(appearance ?? { ...DEFAULT_APPEARANCE, accent: color });

  const gun = new THREE.Group();
  gun.name = 'Ranger standard firearm';
  gun.position.set(0.23, 1.075, -0.43);
  body.add(gun);
  const receiver = block(gun, cloth, [0.12, 0.15, 0.39], [0, 0, -0.09]);
  const barrel = block(gun, steel, [0.055, 0.055, 0.26], [0, 0.012, -0.38]);
  block(gun, weaponTrim, [0.125, 0.043, 0.2], [0, 0.065, -0.09]);
  block(gun, copper, [0.07, 0.16, 0.09], [0, -0.12, -0.05]);
  const scope = block(gun, steel, [0.07, 0.07, 0.17], [0, 0.125, -0.12]);

  const sword = new THREE.Group();
  sword.name = 'Ranger standard sword';
  sword.position.set(0.29, 1.04, -0.45);
  sword.rotation.x = -0.3;
  body.add(sword);
  block(sword, cloth, [0.065, 0.075, 0.22], [0, 0, 0]);
  const guard = block(sword, copper, [0.32, 0.08, 0.065], [0, 0, -0.15]);
  const blade = part(sword, new THREE.CylinderGeometry(0, 0.105, 0.83, 4, 1), crystal, 0, 0, -0.575);
  blade.rotation.x = -Math.PI / 2;
  blade.rotation.y = Math.PI / 4;
  blade.scale.z = 0.38;
  part(sword, new THREE.OctahedronGeometry(0.08), weaponGem, 0, 0, 0.13);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 80;
  const context = canvas.getContext('2d');
  const nameTexture = new THREE.CanvasTexture(canvas);
  nameTexture.colorSpace = THREE.SRGBColorSpace;
  const nameMaterial = new THREE.SpriteMaterial({ map: nameTexture, depthWrite: false, depthTest: true, toneMapped: false });
  const label = new THREE.Sprite(nameMaterial);
  label.position.y = 2.03;
  label.scale.set(1.95, 0.305, 1);
  label.name = 'Player name';
  group.add(label);

  const setName = (name: string) => {
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = '600 41px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = 7;
    context.lineJoin = 'round';
    context.strokeStyle = '#182c32';
    context.fillStyle = '#f5fff7';
    const displayName = name.trim().slice(0, 20) || 'Ranger';
    context.strokeText(displayName, 256, 40, 485);
    context.fillText(displayName, 256, 40, 485);
    nameTexture.needsUpdate = true;
  };
  setName('Ranger');
  let previousWeapon: WeaponId | null = null;
  let previousStage: number | null = null;
  let stageWeapon: THREE.Group | null = null;

  const replaceStageWeapon = (stage: number | null) => {
    if (stageWeapon) {
      stageWeapon.removeFromParent();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      stageWeapon.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.add(object.geometry);
        for (const mat of Array.isArray(object.material) ? object.material : [object.material]) materials.add(mat);
      });
      for (const geometry of geometries) geometry.dispose();
      for (const mat of materials) mat.dispose();
      stageWeapon = null;
    }
    if (stage === null) return;
    stageWeapon = createGunGameWeapon(stage);
    stageWeapon.scale.setScalar(0.78);
    if (stage >= 16) {
      stageWeapon.position.copy(sword.position);
      // Stage blades are authored along +Y. Carry them forward and slightly down.
      stageWeapon.rotation.set(-Math.PI / 2 - 0.23, -0.12, 0);
    } else stageWeapon.position.copy(gun.position);
    stageWeapon.position.y=stage>=16?1.04:1.075;
    body.add(stageWeapon);
  };

  let swapAt=-10;
  const update = (time: number, speed: number, grounded: boolean, weapon: WeaponId, gunGameStage?: number | null) => {
    const stage = typeof gunGameStage === 'number' && Number.isFinite(gunGameStage)
      ? Math.max(0, Math.min(19, Math.floor(gunGameStage))) : null;
    if(previousWeapon!==null&&(stage!==previousStage||weapon!==previousWeapon))swapAt=time;
    if (stage !== previousStage) {
      previousStage = stage;
      replaceStageWeapon(stage);
    }
    const stride = Math.min(Math.abs(speed) / 7, 1);
    const phase = time * 10.5;
    body.position.y = grounded ? Math.abs(Math.sin(phase)) * stride * 0.025 : 0;
    for (let i = 0; i < 2; i++) {
      const swing = Math.sin(phase + i * Math.PI);
      legs[i].rotation.x = grounded ? swing * 0.57 * stride : (i === 0 ? -0.38 : 0.34);
      knees[i].rotation.x = grounded ? Math.max(0, -swing) * 0.48 * stride : 0.48;
    }
    const melee = stage === null ? weapon === 'aote' || weapon === 'aotd' : stage >= 16;
    arms[0].rotation.set(melee ? 0.08 + Math.sin(phase) * stride * 0.25 : 1.1, 0, melee ? 0.1 : -0.25);
    arms[1].rotation.set(melee ? 0.78 : 0.84, 0, -0.04);
    forearms[0].rotation.x = melee ? 0.18 : 0.22;
    forearms[1].rotation.x = 0.52;
    scarf.rotation.x = 0.08 + stride * 0.35 + Math.sin(time * 7) * 0.04;
    cape.rotation.x = 0.025 + stride * 0.14 + Math.sin(time * 4) * 0.02;
    gun.position.y = 1.075 + Math.sin(phase) * stride * 0.008;
    if (stageWeapon && !melee) stageWeapon.position.y = gun.position.y;
    gun.visible = stage === null && !melee;
    sword.visible = stage === null && melee;
    if (weapon !== previousWeapon) {
      previousWeapon = weapon;
      barrel.scale.z = weapon === 'sniper' ? 1.75 : weapon === 'shotgun' ? 0.72 : 1;
      barrel.scale.x = weapon === 'shotgun' ? 1.8 : 1;
      receiver.scale.x = weapon === 'shotgun' ? 1.4 : 1;
      scope.visible = weapon === 'sniper';
      crystal.color.setHex(weapon === 'aotd' ? 0xe4ab7f : 0x85f9e0);
      crystal.emissive.setHex(weapon === 'aotd' ? 0x843e1a : 0x358575);
      guard.scale.x = weapon === 'aotd' ? 1.3 : 1;
      blade.scale.y = weapon === 'aotd' ? 1.15 : 1;
    }
    const equipMotion=Math.sin(Math.PI*Math.max(0,Math.min(1,(time-swapAt)/.6)));
    group.userData.swapMotion=equipMotion;
    arms[0].rotation.x-=equipMotion*.95;arms[1].rotation.x+=equipMotion*.85;
    for(const held of [gun,sword,stageWeapon])if(held){
      held.userData.carryY??=held.position.y;held.userData.carryZ??=held.rotation.z;
      held.position.y=(held===gun?1.075:held.userData.carryY)-equipMotion*.48;
      held.rotation.z=held.userData.carryZ+equipMotion*.95;
    }

  };
  update(0, 0, true, 'rifle');
  return { group, update, setName, setAppearance };
}

/** Compact, recognizable world loot. The caller owns bob/spin and visibility. */
export function createPickup(kind: PickupKind): THREE.Group {
  const group = new THREE.Group();
  group.name = `${kind} pickup`;
  const shell = material(palette.shell);
  const metal = material(palette.ink);
  const copper = material(palette.copper);
  const colors: Record<PickupKind, number> = { health: 0xf4a594, shield: 0x8eceee, mana: 0x90efd4, haste: 0xf4d28f };
  const tint = material(colors[kind], colors[kind]);
  if (kind === 'health') {
    part(group, new THREE.CylinderGeometry(0.16, 0.16, 0.38, 6), shell, 0, 0.25, 0);
    part(group, new THREE.CylinderGeometry(0.17, 0.17, 0.07, 6), metal, 0, 0.47, 0);
    part(group, new THREE.CylinderGeometry(0.17, 0.17, 0.05, 6), copper, 0, 0.045, 0);
    block(group, tint, [0.17, 0.06, 0.023], [0, 0.25, -0.15]);
    block(group, tint, [0.06, 0.18, 0.025], [0, 0.25, -0.15]);
    block(group, tint, [0.17, 0.06, 0.023], [0, 0.25, 0.15]);
    block(group, tint, [0.06, 0.18, 0.025], [0, 0.25, 0.15]);
  } else if (kind === 'shield') {
    part(group, new THREE.CylinderGeometry(0.105, 0.15, 0.33, 6), tint, 0, 0.235, 0);
    part(group, new THREE.CylinderGeometry(0.09, 0.105, 0.08, 6), shell, 0, 0.44, 0);
    part(group, new THREE.CylinderGeometry(0.115, 0.115, 0.06, 6), metal, 0, 0.505, 0);
    part(group, new THREE.CylinderGeometry(0.155, 0.155, 0.08, 6), metal, 0, 0.05, 0);
    for (const x of [-0.1, 0.1]) block(group, shell, [0.035, 0.27, 0.035], [x, 0.235, -0.08]);
    const rune = part(group, new THREE.OctahedronGeometry(0.08), shell, 0, 0.23, -0.135);
    rune.scale.set(0.7, 1, 0.25);
  } else if (kind === 'mana') {
    const stone = part(group, new THREE.OctahedronGeometry(0.28), tint, 0, 0.35, 0);
    stone.scale.set(0.7, 1.2, 0.7);
    const setting = part(group, new THREE.TorusGeometry(0.17, 0.027, 4, 6), copper, 0, 0.26, 0);
    setting.rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3;
      const shard = part(group, new THREE.OctahedronGeometry(0.055), shell, Math.cos(angle) * 0.29, 0.35 + i * 0.065, Math.sin(angle) * 0.29);
      shard.scale.y = 1.6;
    }
  } else {
    const feather = new THREE.Group();
    feather.rotation.z = -0.37;
    feather.position.set(-0.075, 0.1, 0);
    group.add(feather);
    block(feather, copper, [0.035, 0.51, 0.03], [0, 0.19, 0]);
    for (let i = 0; i < 5; i++) {
      const y = 0.095 + i * 0.068;
      const length = 0.19 - i * 0.019;
      for (const sign of [-1, 1]) {
        const barb = part(feather, new THREE.ConeGeometry(0.048, length, 3), i % 2 === 0 ? tint : shell, sign * length * 0.32, y, 0);
        barb.rotation.z = sign * -0.87;
        barb.scale.z = 0.26;
      }
    }
  }
  return group;
}
