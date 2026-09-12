import * as THREE from 'three';
import { createWeapon } from './weapons';

type Materials = ReturnType<typeof materials>;
function materials(accent = 0x71a89b) {
  const make = (color: number, emission = 0, strength = 0) => new THREE.MeshStandardMaterial({ color, roughness: .48, metalness: .32, flatShading: true, emissive: emission, emissiveIntensity: strength });
  return { shell: make(0xe0e9dc), ink: make(0x233c43), rubber: make(0x334b50), metal: make(0x809ba0), accent: make(accent), copper: make(0xc28c60), gold: make(0xe5bd63), light: make(0xb8fff1, 0x56dfd4, .32) };
}
function mesh(g: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, name: string, xyz: [number, number, number] = [0, 0, 0]) {
  const m = new THREE.Mesh(geometry, material); m.name = name; m.position.set(...xyz); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
}
function box(g: THREE.Group, size: [number, number, number], xyz: [number, number, number], mat: THREE.Material, name: string, angle = 0) {
  const m = mesh(g, new THREE.BoxGeometry(...size), mat, name, xyz); m.rotation.x = angle; return m;
}
function tube(g: THREE.Group, r: number, length: number, xyz: [number, number, number], mat: THREE.Material, name: string, axis: 'x' | 'y' | 'z' = 'z', end = r, sides = 8) {
  const m = mesh(g, new THREE.CylinderGeometry(end, r, length, sides), mat, name, xyz);
  if (axis === 'z') m.rotation.x = Math.PI / 2; if (axis === 'x') m.rotation.z = Math.PI / 2; return m;
}
function side(g: THREE.Group, points: [number, number][], width: number, mat: THREE.Material, name: string, x = 0) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 1 });
  geo.rotateY(-Math.PI / 2); geo.translate(width / 2, 0, 0); return mesh(g, geo, mat, name, [x, 0, 0]);
}
function face(g: THREE.Group, points: [number, number][], width: number, mat: THREE.Material, name: string, z = 0) {
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y))), { depth: width, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -width / 2); return mesh(g, geo, mat, name, [0, 0, z]);
}
function grip(g: THREE.Group, m: Materials, magazine = false) {
  box(g, [.082, .071, .075], [0, .075, .016], m.ink, 'Grip tang');
  box(g, [.09, .215, .097], [0, -.054, .022], m.rubber, 'Trigger grip', -.22);
  box(g, [.104, .029, .105], [0, -.164, .045], m.accent, magazine ? 'Curved magazine' : 'Grip heel', -.22);
  box(g, [.073, .028, .173], [0, -.107, -.09], m.ink, 'Trigger guard');
  box(g, [.073, .093, .026], [0, -.064, -.16], m.ink, 'Guard front', -.24);
  box(g, [.025, .071, .023], [0, -.043, -.059], m.metal, 'Trigger', -.35);
}
function muzzle(g: THREE.Group, m: Materials, z: number, y = .16, r = .038) {
  tube(g, r, .058, [0, y, z], m.ink, 'Muzzle collar');
  tube(g, r * .67, .008, [0, y, z - .033], m.rubber, 'Barrel opening');
  g.userData.muzzle = new THREE.Vector3(0, y, z - .043);
}
function sights(g: THREE.Group, m: Materials, front: number, back = .01) {
  box(g, [.027, .047, .024], [0, .288, front], m.ink, 'Front sight');
  for (const sign of [-1, 1]) box(g, [.018, .047, .034], [sign * .043, .288, back], m.ink, 'Rear sight ear');
}
function scope(g: THREE.Group, m: Materials, length: number, y: number, z: number, radius = .047) {
  for (const dz of [-length * .3, length * .3]) {
    box(g, [.082, .054, .031], [0, y - .069, z + dz], m.ink, 'Scope riser');
    tube(g, radius * 1.2, .035, [0, y, z + dz], m.accent, 'Scope mount');
  }
  tube(g, radius, length, [0, y, z], m.ink, 'Optic tube');
  tube(g, radius * 1.38, .072, [0, y, z - length / 2 - .013], m.accent, 'Scope bell', 'z', radius, 10);
  tube(g, radius * .98, .008, [0, y, z + length / 2 + .006], m.light, 'Scope ocular');
  tube(g, radius * 1.1, .006, [0, y, z - length / 2 - .05], m.light, 'Scope objective');
  tube(g, .027, .035, [0, y + radius + .012, z], m.metal, 'Scope dial', 'y');
}
function stock(g: THREE.Group, m: Materials, skeleton = false) {
  if (skeleton) {
    side(g, [[.12, .16], [.35, .16], [.38, .12], [.16, .111]], .078, m.metal, 'Stock upper spar');
    side(g, [[.12, .054], [.36, -.042], [.38, .003], [.15, .091]], .078, m.accent, 'Stock lower spar');
  } else side(g, [[.12, .1], [.28, .183], [.35, .133], [.36, -.04], [.29, -.068], [.13, .038]], .115, m.accent, 'Shoulder stock');
  box(g, [.137, .208, .037], [0, .057, .379], m.rubber, 'Shoulder pad');
}

function pistol(kind: 'sidekick' | 'pocket-auto' | 'heavy-hand') {
  const g = new THREE.Group(), heavy = kind === 'heavy-hand', auto = kind === 'pocket-auto';
  const m = materials(heavy ? 0xce9962 : auto ? 0xe99b88 : 0x74aaac);
  grip(g, m, !auto);
  const front = heavy ? -.535 : auto ? -.37 : -.405;
  side(g, [[.111, .096], [.115, .22], [front + .035, .24], [front, .186], [front, .094], [-.126, .074]], heavy ? .158 : .132, heavy ? m.metal : m.shell, 'Faceted slide');
  box(g, [heavy ? .163 : .139, .033, Math.abs(front) + .065], [0, .218, (front + .065) / 2], m.accent, 'Slide crown');
  tube(g, heavy ? .044 : .027, .116, [0, .144, front - .025], m.metal, 'Exposed pistol barrel');
  muzzle(g, m, front - .094, .144, heavy ? .053 : .034);
  sights(g, m, front + .07, .067);
  for (const sign of [-1, 1]) {
    for (let i = 0; i < 3; i++) box(g, [.01, .075, .015], [sign * (heavy ? .084 : .071), .157, .008 + i * .033], m.ink, 'Rear slide serration', .13);
    box(g, [.022, .026, .079], [sign * .081, .08, .004], m.accent, 'Thumb control');
  }
  if (auto) {
    side(g, [[.003, -.041], [-.025, -.31], [-.111, -.326], [-.09, -.031]], .071, m.ink, 'Curved magazine');
    box(g, [.096, .035, .092], [0, -.32, -.067], m.accent, 'Extended magazine heel');
    tube(g, .012, .29, [-.055, .138, .218], m.metal, 'Folding stock strut');
    box(g, [.094, .117, .025], [-.04, .089, .369], m.ink, 'Foldout shoulder heel');
    box(g, [.047, .088, .079], [0, .291, -.078], m.ink, 'Compact reflex housing');
    box(g, [.049, .045, .004], [0, .304, -.035], m.light, 'Reflex glass');
  } else if (heavy) {
    side(g, [[-.177, .091], [-.412, .091], [-.456, .01], [-.339, -.027], [-.207, .021]], .134, m.accent, 'Heavy barrel underlug');
    for (let i = 0; i < 3; i++) box(g, [.174, .014, .026], [0, .235, -.292 - i * .06], m.ink, 'Compensator vent');
  } else box(g, [.083, .055, .083], [0, .071, -.269], m.accent, 'Accessory rail');
  return g;
}

function revolver() {
  const g = new THREE.Group(), m = materials(0xcb986a);
  grip(g, m, false);
  side(g, [[.116, .119], [.075, .276], [-.313, .259], [-.358, .119], [-.245, .063], [-.112, .065]], .112, m.copper, 'Revolver frame');
  tube(g, .098, .175, [0, .173, -.149], m.metal, 'Curved magazine', 'z', .098, 12);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    tube(g, .023, .01, [Math.cos(a) * .061, .173 + Math.sin(a) * .061, -.242], m.ink, 'Revolver chamber');
    tube(g, .016, .01, [Math.cos(a) * .061, .173 + Math.sin(a) * .061, -.054], m.gold, 'Cartridge base');
  }
  tube(g, .039, .286, [0, .221, -.443], m.shell, 'Octagonal revolver barrel');
  box(g, [.075, .042, .241], [0, .142, -.436], m.accent, 'Solid revolver underlug');
  muzzle(g, m, -.611, .221, .043);
  box(g, [.029, .048, .025], [0, .287, -.513], m.ink, 'Revolver front sight');
  box(g, [.045, .075, .052], [0, .259, .095], m.ink, 'Thumb hammer', -.44);
  for (const sign of [-1, 1]) tube(g, .014, .014, [sign * .063, -.035, .027], m.gold, 'Grip medallion', 'x');
  return g;
}

function compactGun(kind: 'needle' | 'ranger' | 'drumrunner' | 'pulse-carbine') {
  const g = new THREE.Group(), smg = kind === 'needle', lmg = kind === 'drumrunner', pulse = kind === 'pulse-carbine';
  const m = materials(pulse ? 0x73d8d3 : lmg ? 0xc09b61 : smg ? 0x7aafb6 : 0x8cb184);
  grip(g, m);
  const front = lmg ? -.64 : pulse ? -.56 : -.46;
  side(g, [[.137, .103], [.137, .236], [-.129, .27], [front + .035, .225], [front, .12], [-.264, .057], [-.105, .094]], pulse ? .18 : .139, pulse || lmg ? m.shell : m.accent, 'Angled receiver');
  stock(g, m, smg || kind === 'ranger');
  if (lmg) {
    tube(g, .157, .183, [0, -.086, -.23], m.ink, 'Curved magazine', 'x', .157, 12);
    for (const sign of [-1, 1]) {
      tube(g, .11, .018, [sign * .1, -.086, -.23], m.accent, 'Drum side plate', 'x');
      tube(g, .041, .023, [sign * .113, -.086, -.23], m.metal, 'Drum hub', 'x');
      const leg = box(g, [.029, .312, .039], [sign * .115, -.048, -.66], m.ink, 'Deployed bipod'); leg.rotation.z = sign * -.36;
    }
    for (let i = 0; i < 5; i++) box(g, [.149, .021, .045], [0, .286, -.11 - i * .065], m.copper, 'Ammo feed cover rib');
  } else if (pulse) {
    side(g, [[-.102, .075], [-.109, -.143], [-.218, -.184], [-.26, .075]], .107, m.ink, 'Curved magazine');
    tube(g, .075, .2, [0, .169, -.26], m.light, 'Contained pulse reactor');
    for (const sign of [-1, 1]) {
      side(g, [[-.261, .097], [-.682, .083], [-.72, .17], [-.602, .237], [-.326, .24]], .048, m.accent, 'Split pulse accelerator', sign * .125);
      box(g, [.014, .026, .303], [sign * .153, .172, -.482], m.light, 'Accelerator luminous slot');
    }
    box(g, [.208, .038, .075], [0, .237, -.387], m.shell, 'Accelerator bridge');
    g.userData.muzzle = new THREE.Vector3(0, .162, -.725);
  } else {
    side(g, [[-.13, .093], [-.173, -.259], [-.244, -.289], [-.258, .09]], smg ? .062 : .083, m.ink, 'Curved magazine');
    box(g, [smg ? .081 : .101, .036, .095], [0, -.264, -.209], m.accent, 'Magazine floor');
  }
  if (!pulse) {
    tube(g, smg ? .024 : .032, lmg ? .36 : .18, [0, .16, front - (lmg ? .14 : .055)], m.metal, 'Exposed barrel');
    if (smg) { tube(g, .05, .22, [0, .16, -.663], m.ink, 'Needle suppressor'); muzzle(g, m, -.788, .16, .05); }
    else muzzle(g, m, front - (lmg ? .343 : .184));
  }
  if (kind === 'ranger') {
    side(g, [[.053, .27], [-.059, .392], [-.315, .386], [-.382, .269], [-.334, .269], [-.288, .341], [-.079, .346], [.008, .27]], .056, m.ink, 'Open carrying sight');
    box(g, [.151, .075, .213], [0, .118, -.365], m.rubber, 'Short ribbed handguard');
  } else sights(g, m, pulse ? -.563 : -.388);
  for (const sign of [-1, 1]) for (let i = 0; i < 3; i++) box(g, [.013, .032, .032], [sign * (pulse ? .096 : .076), .168, -.297 - i * .046], m.ink, 'Receiver cooling port');
  return g;
}

function shotgun(kind: 'short-fuse' | 'street-sweeper' | 'quad-barrel') {
  const g = new THREE.Group(), short = kind === 'short-fuse', quad = kind === 'quad-barrel', m = materials(short ? 0xcd9274 : quad ? 0xd1a25d : 0x98ad82);
  grip(g, m);
  side(g, [[.115, .083], [.123, .25], [-.271, .266], [-.334, .178], [-.287, .071]], quad ? .185 : .163, m.ink, 'Heavy shotgun receiver');
  if (!short) stock(g, m, !quad);
  else box(g, [.102, .106, .094], [0, .165, .14], m.copper, 'Break-action latch');
  const barrelLength = short ? .35 : quad ? .49 : .525;
  const offsets: [number, number][] = quad ? [[-.06, .13], [.06, .13], [-.06, .247], [.06, .247]] : short ? [[-.05, .173], [.05, .173]] : [[0, .2]];
  offsets.forEach(([x, y], i) => {
    tube(g, quad ? .044 : short ? .047 : .056, barrelLength, [x, y, -.26 - barrelLength / 2], m.metal, `Shotgun barrel ${i}`);
    tube(g, quad ? .054 : short ? .058 : .066, .045, [x, y, -.275 - barrelLength], m.accent, `Barrel cuff ${i}`);
    tube(g, quad ? .035 : short ? .038 : .043, .008, [x, y, -.302 - barrelLength], m.ink, `Barrel mouth ${i}`);
  });
  if (kind === 'street-sweeper') {
    tube(g, .16, .185, [0, -.069, -.179], m.rubber, 'Box magazine', 'x', .16, 12);
    for (const sign of [-1, 1]) tube(g, .11, .016, [sign * .102, -.069, -.179], m.accent, 'Shotgun drum face', 'x');
    box(g, [.172, .13, .21], [0, .17, -.518], m.accent, 'Square automatic fore-end');
    for (let i = 0; i < 4; i++) box(g, [.183, .018, .026], [0, .227, -.445 - i * .046], m.ink, 'Fore-end cooling rib');
  } else {
    const mag = new THREE.Group(); mag.name = 'Box magazine'; g.add(mag);
    for (let i = 0; i < (quad ? 4 : 2); i++) tube(mag, .027, .125, [(i - (quad ? 1.5 : .5)) * .047, -.039, -.223], m.copper, 'Exposed shell bundle', 'y');
    box(mag, [quad ? .209 : .117, .028, .073], [0, -.104, -.223], m.ink, 'Shell carrier base');
  }
  if (quad) {
    side(g, [[.015, .266], [-.031, .413], [-.241, .413], [-.322, .272], [-.267, .271], [-.205, .36], [-.071, .36], [-.027, .266]], .067, m.accent, 'Quad carrying handle');
    box(g, [.213, .076, .155], [0, .159, -.457], m.rubber, 'Barrel cluster brace');
  } else sights(g, m, short ? -.505 : -.672);
  g.userData.muzzle = new THREE.Vector3(0, .184, -.321 - barrelLength);
  return g;
}

function sniper(kind: 'scout' | 'frostbite') {
  const g = new THREE.Group(), frost = kind === 'frostbite', m = materials(frost ? 0x85c9e7 : 0xaf9b72);
  grip(g, m);
  side(g, [[.134, .092], [.12, .229], [-.331, .245], [-.488, .197], [-.462, .088]], frost ? .161 : .125, frost ? m.shell : m.metal, 'Precision receiver');
  stock(g, m, frost);
  box(g, [.09, .133, .151], [0, -.009, -.189], m.ink, 'Box magazine', .12);
  box(g, [.1, .026, .16], [0, -.083, -.198], m.accent, 'Magazine heel');
  tube(g, .028, frost ? .61 : .382, [0, .165, frost ? -.725 : -.615], m.metal, 'Long precision barrel');
  muzzle(g, m, frost ? -1.065 : -.84, .165, frost ? .047 : .035);
  scope(g, m, frost ? .385 : .202, frost ? .338 : .308, -.155, frost ? .052 : .035);
  box(g, [.043, .03, .058], [.087, .198, .015], m.metal, 'Bolt lever');
  tube(g, .026, .047, [.116, .183, .019], m.ink, 'Bolt knob', 'y');
  if (frost) {
    for (const sign of [-1, 1]) {
      side(g, [[-.37, .238], [-.654, .308], [-.886, .213], [-.653, .196], [-.414, .148]], .037, m.accent, 'Swept ice cooling fin', sign * .083);
      for (let i = 0; i < 3; i++) box(g, [.013, .042, .037], [sign * .105, .214, -.491 - i * .087], m.light, 'Ice chamber window');
    }
    face(g, [[-.09, .14], [0, .062], [.09, .14], [.045, .209], [-.045, .209]], .11, m.shell, 'Crystal barrel cradle', -.58);
  } else {
    side(g, [[-.215, .073], [-.518, .093], [-.551, .16], [-.29, .164]], .112, m.copper, 'Slim wooden fore-end');
    box(g, [.12, .035, .14], [0, .203, .25], m.rubber, 'Scout cheek pad');
  }
  return g;
}

function sword(kind: 'scrap-saber' | 'dragon-cleaver' | 'crown-blade') {
  const g = new THREE.Group(), scrap = kind === 'scrap-saber', crown = kind === 'crown-blade';
  const m = materials(crown ? 0xf0cf72 : scrap ? 0x8ca6a6 : 0xc79069);
  tube(g, .034, .255, [0, -.018, 0], m.ink, 'Wrapped sword hilt', 'y', .03, 7);
  for (let i = 0; i < 5; i++) tube(g, .038, .015, [0, -.123 + i * .047, 0], crown ? m.gold : m.copper, 'Hilt wrap', 'y', .038, 7);
  const pommel = mesh(g, new THREE.OctahedronGeometry(.059), crown ? m.gold : m.accent, 'Faceted pommel', [0, -.212, 0]); pommel.scale.y = 1.25;
  if (scrap) {
    face(g, [[-.045, .163], [-.057, .665], [-.02, 1.021], [.139, 1.243], [.119, .968], [.079, .845], [.101, .819], [.069, .745], [.092, .72], [.055, .633], [.071, .611], [.058, .185]], .061, m.metal, 'Curved salvaged saber');
    face(g, [[-.045, .18], [-.057, .665], [-.02, 1.021], [.139, 1.243], [.051, 1.006], [-.015, .659], [-.019, .18]], .066, m.shell, 'Bright saber cutting edge');
    const guard = mesh(g, new THREE.TorusGeometry(.145, .02, 5, 24, Math.PI * 1.28), m.copper, 'Open knuckle bow', [.076, .015, 0]); guard.rotation.z = -Math.PI * .58;
    box(g, [.236, .041, .083], [0, .149, 0], m.accent, 'Uneven salvage crossguard');
    for (let i = 0; i < 3; i++) face(g, [[-.03, .365 + i * .13], [.046, .338 + i * .13], [.048, .358 + i * .13], [-.029, .385 + i * .13]], .066, m.ink, 'Blade weld seam');
  } else if (!crown) {
    face(g, [[-.085, .177], [-.13, .426], [-.145, 1.033], [-.077, 1.233], [.145, 1.09], [.183, .966], [.107, .991], [.098, .629], [.139, .598], [.09, .5], [.107, .465], [.061, .176]], .085, m.ink, 'Broad hooked dragon cleaver');
    face(g, [[-.13, .426], [-.145, 1.033], [-.077, 1.233], [-.08, 1.014], [-.077, .437]], .092, m.copper, 'Copper cleaver cutting edge');
    for (const sign of [-1, 1]) {
      face(g, [[0, .159], [sign * .105, .234], [sign * .25, .33], [sign * .217, .17], [sign * .119, .189], [sign * .069, .12]], .085, m.accent, 'Dragon horn guard');
      face(g, [[sign * .198, .221], [sign * .25, .33], [sign * .279, .381], [sign * .252, .233]], .068, m.gold, 'Guard fang');
    }
    for (const sign of [-1, 1]) face(g, [[-.014, .264], [.042, .625], [.015, .671], [.047, 1.064], [.074, .616], [.042, .551]], .007, m.gold, 'Dragon cleaver fissure', sign * .049);
  } else {
    face(g, [[-.055, .205], [-.114, .423], [-.084, .802], [-.101, .907], [0, 1.355], [.101, .907], [.084, .802], [.114, .423], [.055, .205]], .075, m.gold, 'Golden crown blade');
    face(g, [[0, .223], [-.059, .454], [-.043, .858], [0, 1.317], [.044, .858], [.06, .454]], .085, m.shell, 'Ivory center facet');
    face(g, [[-.24, .233], [-.24, .331], [-.156, .26], [-.111, .379], [0, .267], [.111, .379], [.156, .26], [.24, .331], [.24, .233], [.104, .166], [-.104, .166]], .091, m.gold, 'Five-point royal crossguard');
    for (const sign of [-1, 1]) {
      const jewel = mesh(g, new THREE.OctahedronGeometry(.048), m.light, 'Crown emerald', [0, .227, sign * .064]); jewel.scale.set(.74, 1, .4);
      for (let i = 0; i < 3; i++) { const rune = box(g, [.021, .043, .007], [0, .451 + i * .178, sign * .047], m.gold, 'Royal blade inlay'); rune.rotation.z = Math.PI / 4; }
    }
  }
  g.userData.bladeTip = new THREE.Vector3(scrap ? .139 : 0, crown ? 1.355 : 1.243, 0);
  return g;
}

const ids = ['sidekick', 'wayfinder', 'short-fuse', 'needle', 'copperhead', 'scout', 'breachcaster', 'ranger', 'pocket-auto', 'street-sweeper', 'longshot', 'heavy-hand', 'drumrunner', 'quad-barrel', 'frostbite', 'pulse-carbine', 'scrap-saber', 'dragon-cleaver', 'end-sword', 'crown-blade'] as const;

/** Every call owns fresh geometry/materials, including the four returning arena designs. */
export function createGunGameWeapon(index: number): THREE.Group {
  const stage = Number.isFinite(index) ? Math.max(0, Math.min(19, Math.floor(index))) : 0;
  let g: THREE.Group;
  switch (stage) {
    case 0: g = pistol('sidekick'); break;
    case 1: g = createWeapon('rifle'); break;
    case 2: g = shotgun('short-fuse'); break;
    case 3: g = compactGun('needle'); break;
    case 4: g = revolver(); break;
    case 5: g = sniper('scout'); break;
    case 6: {
      g = createWeapon('shotgun'); const m = materials(0xbb7858);
      box(g, [.107, .13, .132], [0, -.073, -.245], m.ink, 'Box magazine'); break;
    }
    case 7: g = compactGun('ranger'); break;
    case 8: g = pistol('pocket-auto'); break;
    case 9: g = shotgun('street-sweeper'); break;
    case 10: g = createWeapon('sniper'); break;
    case 11: g = pistol('heavy-hand'); break;
    case 12: g = compactGun('drumrunner'); break;
    case 13: g = shotgun('quad-barrel'); break;
    case 14: g = sniper('frostbite'); break;
    case 15: g = compactGun('pulse-carbine'); break;
    case 16: g = sword('scrap-saber'); break;
    case 17: g = sword('dragon-cleaver'); break;
    case 18: g = createWeapon('aote'); break;
    default: g = sword('crown-blade');
  }
  g.name = `Gun Game: ${ids[stage]}`;
  g.userData.gunGameStage = stage;
  g.userData.gunGameId = ids[stage];
  return g;
}
