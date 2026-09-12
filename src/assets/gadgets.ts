import * as THREE from 'three';
import type { GadgetId } from '../gadgets';

const material = (color: number, light = 0, strength = 0) => new THREE.MeshStandardMaterial({
  color, emissive: light, emissiveIntensity: strength, metalness: .24, roughness: .47, flatShading: true,
});

function part(group: THREE.Group, geometry: THREE.BufferGeometry, mat: THREE.Material, name: string, xyz: [number, number, number] = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.name = name;
  mesh.position.set(...xyz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
function box(group: THREE.Group, size: [number, number, number], xyz: [number, number, number], mat: THREE.Material, name: string) {
  return part(group, new THREE.BoxGeometry(...size), mat, name, xyz);
}
function cylinder(group: THREE.Group, r: number, h: number, xyz: [number, number, number], mat: THREE.Material, name: string, top = r, sides = 8) {
  return part(group, new THREE.CylinderGeometry(top, r, h, sides), mat, name, xyz);
}
function cutout(group: THREE.Group, points: [number, number][], thickness: number, mat: THREE.Material, name: string, xyz: [number, number, number] = [0, 0, 0]) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, steps: 1 });
  geo.translate(0, 0, -thickness / 2);
  return part(group, geo, mat, name, xyz);
}

function iceWand() {
  const g = new THREE.Group();
  const blue = material(0x2874c6), ice = material(0xacffff, 0x56defa, .28), white = material(0xf1ffff), navy = material(0x224768);
  cylinder(g, .035, .66, [0, .22, 0], blue, 'Icy blue wand stem', .029, 6);
  cylinder(g, .038, .23, [0, -.04, 0], navy, 'Wrapped wand grip', .038, 6);
  for (let i = 0; i < 4; i++) cylinder(g, .041, .013, [0, -.14 + i * .056, 0], white, `Grip frost band ${i}`, .041, 6);
  cylinder(g, .06, .07, [0, .53, 0], white, 'Crystal ferrule', .046, 6);
  const gem = part(g, new THREE.OctahedronGeometry(.137), ice, 'Heart of the snowflake', [0, .718, 0]);
  gem.scale.set(.76, 1.06, .54);
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    const branch = cutout(g, [[-.019, .075], [-.027, .15], [-.011, .187], [-.011, .242], [0, .27], [.011, .242], [.011, .187], [.027, .15], [.019, .075]], .035, ice, `Snowflake branch ${i}`, [0, .718, 0]);
    branch.rotation.z = angle;
    const twig = cutout(g, [[-.013, .153], [-.067, .191], [-.073, .171], [-.024, .126], [0, .14], [.024, .126], [.073, .171], [.067, .191], [.013, .153]], .043, white, `Snowflake fork ${i}`, [0, .718, 0]);
    twig.rotation.z = angle;
  }
  const pommel = part(g, new THREE.OctahedronGeometry(.046), ice, 'Ice drop pommel', [0, -.215, 0]);
  pommel.scale.set(.7, 1.25, .7);
  g.userData.tip = new THREE.Vector3(0, .99, 0);
  return g;
}

function bonzoStaff() {
  const g = new THREE.Group();
  const orange = material(0xffa953), coral = material(0xff747f), teal = material(0x53e4d6), violet = material(0x9864de), pale = material(0xffedb6), ink = material(0x35455a);
  cylinder(g, .032, .82, [0, .25, 0], violet, 'Party staff stem', .024, 7);
  for (let i = 0; i < 6; i++) {
    const ribbon = cylinder(g, .035, .031, [0, -.092 + i * .118, 0], i % 2 ? pale : coral, `Candy stem stripe ${i}`, .035, 7);
    ribbon.rotation.z = .15;
  }
  cylinder(g, .078, .092, [0, .61, 0], orange, 'Balloon bouquet collar', .057, 8);
  const balloons: [number, number, number, THREE.Material][] = [[-.126, .793, 0, coral], [.128, .788, -.012, teal], [0, .953, .012, pale]];
  balloons.forEach(([x, y, z, mat], i) => {
    const balloon = part(g, new THREE.IcosahedronGeometry(.139, 1), mat, `Faceted party balloon ${i}`, [x, y, z]);
    balloon.scale.set(.8, 1.1, .82);
    const knot = part(g, new THREE.ConeGeometry(.024, .044, 4), mat, `Balloon knot ${i}`, [x, y - .159, z]);
    knot.rotation.z = Math.PI;
    const cord = box(g, [.009, .19, .009], [x * .59, .685, z], pale, `Balloon cord ${i}`);
    cord.rotation.z = -x * 2.6;
    const shine = part(g, new THREE.OctahedronGeometry(.035), pale, `Balloon highlight ${i}`, [x - .035, y + .051, z + .086]);
    shine.scale.set(.5, 1, .24);
  });
  cutout(g, [[0, .65], [-.12, .685], [-.102, .6], [0, .628], [.102, .6], [.12, .685]], .045, coral, 'Big party bow');
  for (let i = 0; i < 4; i++) {
    const confetti = box(g, [.031, .059, .012], [i % 2 ? .227 : -.227, .713 + i * .063, .005], [orange, coral, teal, pale][i], `Floating confetti ${i}`);
    confetti.rotation.set(.1, .4, (i - 1) * .7);
  }
  cylinder(g, .045, .052, [0, -.185, 0], ink, 'Staff heel', .035, 7);
  g.userData.tip = new THREE.Vector3(0, 1.09, 0);
  return g;
}

function swapPearl() {
  const g = new THREE.Group();
  const aqua = material(0x4edcc9, 0x38bda8, .15), purple = material(0xa586f7, 0x7659c0, .18), white = material(0xeaffff), dark = material(0x294564);
  const halves = new THREE.Group();
  halves.rotation.set(.2, -.22, -.42);
  g.add(halves);
  part(halves, new THREE.SphereGeometry(.225, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), aqua, 'Upper pearl shell', [0, .013, 0]);
  part(halves, new THREE.SphereGeometry(.225, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), purple, 'Lower pearl shell', [0, -.013, 0]);
  cylinder(halves, .208, .018, [0, 0, 0], dark, 'Pearl interlocking seam', .208, 12);
  for (const sign of [-1, 1]) {
    const arc = part(g, new THREE.TorusGeometry(.31, .018, 4, 24, Math.PI * .73), sign < 0 ? aqua : white, `Swap direction arc ${sign}`, [0, 0, .075]);
    const start = sign < 0 ? .25 : .25 + Math.PI;
    arc.rotation.z = start;
    const end = start + Math.PI * .73;
    const arrow = part(g, new THREE.ConeGeometry(.055, .106, 3), sign < 0 ? aqua : white, `Swap arrowhead ${sign}`, [Math.cos(end) * .31, Math.sin(end) * .31, .075]);
    arrow.rotation.z = end;
    arrow.rotation.y = Math.PI / 6;
  }
  for (const sign of [-1, 1]) {
    const gleam = part(g, new THREE.OctahedronGeometry(.045), white, `Pearl facet gleam ${sign}`, [sign * .084, sign * .095, .194]);
    gleam.scale.set(.64, 1.1, .22);
  }
  return g;
}

function gravityOrb() {
  const g = new THREE.Group();
  const core = material(0x203151, 0x43375e, .1), blue = material(0x63ccff, 0x489fff, .2), purple = material(0xbb83ff, 0x9c55ff, .3), pale = material(0xcbd9ff), gold = material(0xffc16c);
  part(g, new THREE.IcosahedronGeometry(.19, 1), core, 'Dense gravity core');
  const outer = part(g, new THREE.TorusGeometry(.306, .026, 6, 40, Math.PI * 1.69), purple, 'Open eccentric magnetic ring', [.035, -.012, 0]);
  outer.rotation.set(.6, .29, -.58);
  const inner = part(g, new THREE.TorusGeometry(.258, .016, 5, 32), blue, 'Tilted gravity orbit', [-.062, .04, 0]);
  inner.rotation.set(-.82, .38, .14);
  const nucleus = part(g, new THREE.OctahedronGeometry(.065), purple, 'Bright exposed gravity nucleus', [0, 0, .179]);
  nucleus.scale.set(.79, 1.23, .43);
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + i * Math.PI / 2;
    const facet = box(g, [.026, .062, .018], [Math.cos(angle) * .114, Math.sin(angle) * .114, .137], pale, `Core magnetic brace ${i}`);
    facet.rotation.z = angle - Math.PI / 2;
  }
  const magnet = part(g, new THREE.TorusGeometry(.085, .032, 5, 14, Math.PI), gold, 'Off-axis horseshoe magnet', [.29, -.045, 0]);
  magnet.rotation.set(.18, -.25, -Math.PI / 2);
  for (const sign of [-1, 1]) box(g, [.059, .031, .063], [.29, -.045 + sign * .085, 0], blue, `Magnet pole ${sign}`);
  return g;
}

function healingTotem() {
  const g = new THREE.Group();
  const wood = material(0xa97650), cut = material(0xe3b583), dark = material(0x42644c), green = material(0x71d681), mint = material(0xc9ffc3, 0x75ff9b, .18), leaf = material(0x36996d);
  cylinder(g, .117, .53, [0, .12, 0], wood, 'Carved hexagonal totem trunk', .094, 6);
  cylinder(g, .142, .07, [0, -.172, 0], cut, 'Totem root foot', .129, 6);
  cylinder(g, .132, .051, [0, .374, 0], cut, 'Crown collar', .107, 6);
  cylinder(g, .128, .045, [0, -.032, 0], cut, 'Lower carved collar', .128, 6);
  for (const face of [-1, 1]) {
    box(g, [.142, .15, .018], [0, .173, face * .101], dark, `Inset healing symbol ${face}`);
    box(g, [.029, .118, .018], [0, .176, face * .115], mint, `Healing cross vertical ${face}`);
    box(g, [.101, .03, .019], [0, .177, face * .117], mint, `Healing cross horizontal ${face}`);
    for (const eye of [-1, 1]) {
      const mark = box(g, [.031, .017, .019], [eye * .048, .305, face * .092], dark, `Carved eye ${face}-${eye}`);
      mark.rotation.z = eye * .16;
    }
  }
  for (let i = 0; i < 5; i++) {
    const sprout = cutout(g, [[0, .381], [-.025, .485], [-.165, .6], [-.144, .673], [-.045, .641], [.019, .525], [.02, .39]], .038, i % 2 ? green : leaf, `Leaf crown ${i}`);
    sprout.rotation.y = i * Math.PI * 2 / 5;
  }
  const bud = part(g, new THREE.OctahedronGeometry(.085), mint, 'Living crystal bud', [0, .604, 0]);
  bud.scale.set(.74, 1.35, .74);
  for (let i = 0; i < 3; i++) {
    const root = box(g, [.063, .068, .2], [0, -.197, .043], leaf, `Root runner ${i}`);
    root.rotation.y = i * Math.PI * 2 / 3;
  }
  return g;
}

function rocketBoots() {
  const g = new THREE.Group();
  const white = material(0xe8f5e7), blue = material(0x377acb), dark = material(0x334b62), orange = material(0xffa657), yellow = material(0xffe2a0, 0xffb666, .24), flame = material(0x73eafa, 0x32d9ff, .28);
  for (const side of [-1, 1]) {
    const boot = new THREE.Group();
    boot.position.x = side * .158;
    boot.rotation.y = side * -.13;
    g.add(boot);
    box(boot, [.183, .087, .36], [0, -.076, -.055], dark, 'Rocket boot tread');
    box(boot, [.174, .134, .231], [0, .028, -.1], white, 'Armored toe box');
    box(boot, [.15, .287, .18], [0, .153, .014], blue, 'Tall boot cuff');
    box(boot, [.166, .049, .199], [0, .31, .014], white, 'Cuff lip');
    box(boot, [.122, .018, .145], [0, .337, .014], dark, 'Open boot top');
    for (let i = 0; i < 2; i++) {
      box(boot, [.179, .044, .023], [0, .127 + i * .11, -.089], orange, `Boot strap ${i}`);
      box(boot, [.036, .052, .03], [side * .033, .127 + i * .11, -.106], yellow, `Strap buckle ${i}`);
    }
    cylinder(boot, .059, .246, [side * .107, .13, .08], orange, 'Side rocket pod', .038, 8);
    cylinder(boot, .043, .058, [side * .107, .264, .08], dark, 'Rocket pod cap', .021, 8);
    cylinder(boot, .07, .07, [side * .107, -.018, .08], dark, 'Rocket exhaust bell', .04, 8);
    const exhaust = part(boot, new THREE.OctahedronGeometry(.061), flame, 'Rocket exhaust flame', [side * .107, -.119, .08]);
    exhaust.scale.set(.61, 1.5, .61);
    const hot = part(boot, new THREE.OctahedronGeometry(.035), yellow, 'Warm exhaust center', [side * .107, -.077, .086]);
    hot.scale.set(.55, 1.15, .55);
  }
  return g;
}

function partyNuke() {
  const g = new THREE.Group();
  const yellow = material(0xffd166), orange = material(0xf29b52), teal = material(0x59cbbf);
  const ink = material(0x344553), cream = material(0xfff2c7), lamp = material(0xff857e, 0xff5b5e, .35);
  cylinder(g, .209, .41, [0, .012, 0], yellow, 'Chubby yellow bomb hull', .244, 12);
  part(g, new THREE.SphereGeometry(.244, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), yellow, 'Rounded toy nose', [0, .217, 0]);
  cylinder(g, .146, .136, [0, -.252, 0], orange, 'Tapered toy tail', .208, 12);
  cylinder(g, .156, .045, [0, -.325, 0], ink, 'Tail bumper', .156, 12);
  cylinder(g, .214, .036, [0, -.166, 0], ink, 'Hull safety stripe', .218, 12);
  cylinder(g, .247, .024, [0, .205, 0], orange, 'Nose seam', .247, 12);
  for (let i = 0; i < 4; i++) {
    const fin = cutout(g, [[.136, -.138], [.258, -.169], [.36, -.338], [.328, -.411], [.14, -.306]], .043, i % 2 ? teal : orange, `Chunky tail fin ${i}`);
    fin.rotation.y = i * Math.PI / 2;
    const edge = cutout(g, [[.267, -.217], [.343, -.342], [.321, -.371], [.25, -.253]], .047, cream, `Fin tip marking ${i}`);
    edge.rotation.y = i * Math.PI / 2;
  }
  const badge = new THREE.Group();
  badge.position.set(0, .013, .241);
  badge.rotation.x = -.085;
  g.add(badge);
  part(badge, new THREE.CircleGeometry(.036, 16), ink, 'Hazard mark center');
  for (let i = 0; i < 3; i++) {
    const start = Math.PI / 6 + i * Math.PI * 2 / 3;
    const shape = new THREE.Shape();
    shape.moveTo(Math.cos(start) * .058, Math.sin(start) * .058);
    shape.lineTo(Math.cos(start) * .13, Math.sin(start) * .13);
    shape.absarc(0, 0, .13, start, start + Math.PI * .42, false);
    shape.lineTo(Math.cos(start + Math.PI * .42) * .058, Math.sin(start + Math.PI * .42) * .058);
    shape.absarc(0, 0, .058, start + Math.PI * .42, start, true);
    shape.closePath();
    part(badge, new THREE.ShapeGeometry(shape, 12), ink, `Playful hazard petal ${i}`);
  }
  const noseLight = part(g, new THREE.OctahedronGeometry(.05), lamp, 'Toy arming light', [0, .462, 0]);
  noseLight.scale.set(.76, .66, .76);
  for (const side of [-1, 1]) {
    const rivet = part(g, new THREE.OctahedronGeometry(.018), cream, `Hull rivet ${side}`, [side * .13, -.115, .183]);
    rivet.scale.z = .3;
  }
  g.userData.tip = new THREE.Vector3(0, .495, 0);
  return g;
}

/** Original gadget models. Staff grips are near the origin; other objects are centered. */
export function createGadget(kind: GadgetId): THREE.Group {
  const constructors: Record<GadgetId, () => THREE.Group> = {
    ice_wand: iceWand, bonzo_staff: bonzoStaff, swap_pearl: swapPearl,
    gravity_orb: gravityOrb, healing_totem: healingTotem, rocket_boots: rocketBoots, nuke: partyNuke,
  };
  const group = constructors[kind]();
  group.name = `Gadget: ${kind}`;
  group.userData.gadgetId = kind;
  return group;
}

export const gadgetIcons: Record<GadgetId, string> = {
  ice_wand: '/gadgets/ice-wand.svg', bonzo_staff: '/gadgets/bonzo-staff.svg',
  swap_pearl: '/gadgets/swap-pearl.svg', gravity_orb: '/gadgets/gravity-orb.svg',
  healing_totem: '/gadgets/healing-totem.svg', rocket_boots: '/gadgets/rocket-boots.svg',
  nuke: '/gadgets/nuke.svg',
};
