import * as THREE from 'three';
import type { ArenaAsset, Collider, JumpPad, PickupPoint, SpawnPoint } from '../world-types';

/** The Crown: four open districts joined by a broken rift monument. Units are metres. */
export function createArena(): ArenaAsset {
  const group = new THREE.Group();
  group.name = 'The Crown · floating citadel';
  const colliders: Collider[] = [];
  const moving: Array<{ mesh: THREE.Object3D; baseY: number; phase: number }> = [];
  const cloth: THREE.Mesh[] = [];
  const material = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0.02, ...extra });
  const m = {
    turf: material(0x54bc3d), turfLight: material(0x89d64b),
    stone: material(0x8fbee0), stoneLight: material(0xd7efff), stoneSide: material(0x518aca),
    rock: material(0x637daf), rockDark: material(0x3e568b), rockLight: material(0x9aaed4),
    path: material(0xe7d2a2), pathDark: material(0xb7ce89),
    dark: material(0x294b93), wood: material(0x92603a), woodLight: material(0xc9914c),
    coral: material(0xf47636, { side: THREE.DoubleSide }), coralLight: material(0xffb348, { side: THREE.DoubleSide }),
    brass: material(0xffca55, { metalness: 0.28, roughness: 0.44 }),
    leaf: material(0x36952e), leafLight: material(0x74ce3f),
    crystal: material(0x38bdff, { metalness: 0.18, roughness: 0.25 }),
    crystalDeep: material(0x2371db, { metalness: 0.12, roughness: 0.3 }),
    crystalLight: material(0x8ce8ff, { metalness: 0.12, roughness: 0.24 }),
    pad: material(0x3f8af2), charcoal: material(0x2b4a72),
    grass: material(0x93de52, { side: THREE.DoubleSide }),
  };
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  // A colored top is tessellated once, never painted with a second coplanar box.
  // BoxGeometry group 2 is its +Y face. Keep the sides/bottom for solid platforms.
  const openTopBox = unitBox.clone();
  const openIndices: number[] = [];
  for (const face of unitBox.groups) {
    if (face.materialIndex === 2) continue;
    for (let i = face.start; i < face.start + face.count; i++) openIndices.push(unitBox.index!.getX(i));
  }
  openTopBox.setIndex(openIndices); openTopBox.clearGroups();
  const bounds = new THREE.Box3();
  const add = (geometry: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, solid = false) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = y > 0;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) collision(mesh);
    return mesh;
  };
  const collision = (mesh: THREE.Object3D) => {
    mesh.updateMatrixWorld(true);
    bounds.setFromObject(mesh);
    colliders.push({ minX: bounds.min.x, maxX: bounds.max.x, minY: bounds.min.y,
      maxY: bounds.max.y, minZ: bounds.min.z, maxZ: bounds.max.z });
  };
  const box = (x: number, y: number, z: number, w: number, h: number, d: number,
    mat: THREE.Material = m.stone, solid = true) => {
    const mesh = add(unitBox, mat, x, y, z);
    mesh.scale.set(w, h, d);
    if (solid) collision(mesh);
    return mesh;
  };
  type Point = [number, number];
  type SurfacePart = { polygon: Point[]; material: THREE.Material };
  const rectangle = (x0: number, x1: number, z0: number, z1: number): Point[] =>
    [[x0, z0], [x0, z1], [x1, z1], [x1, z0]];
  const surface = (parts: SurfacePart[], y: number, name: string) => {
    const geometry = new THREE.BufferGeometry();
    const materials = [...new Set(parts.map(part => part.material))];
    const vertices: number[] = [];
    for (const [index, mat] of materials.entries()) {
      const start = vertices.length / 3;
      for (const { polygon, material } of parts) {
        if (material !== mat || polygon.length < 3) continue;
        for (let i = 1; i < polygon.length - 1; i++) {
          for (const p of [polygon[0], polygon[i], polygon[i + 1]]) vertices.push(p[0], 0, p[1]);
        }
      }
      geometry.addGroup(start, vertices.length / 3 - start, index);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    const mesh = add(geometry, materials, 0, y, 0);
    mesh.name = name;
    mesh.castShadow = false;
    return mesh;
  };
  const openBox = (x: number, top: number, z: number, w: number, h: number, d: number, mat: THREE.Material) => {
    const mesh = add(openTopBox, mat, x, top - h / 2, z);
    mesh.scale.set(w, h, d);
    collision(mesh);
    return mesh;
  };
  const beam = (a: THREE.Vector3, b: THREE.Vector3, width: number, depth: number, mat: THREE.Material, solid = true) => {
    const middle = a.clone().add(b).multiplyScalar(0.5);
    const mesh = box(middle.x, middle.y, middle.z, width, a.distanceTo(b), depth, mat, false);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    if (solid) collision(mesh);
    return mesh;
  };
  const slab = (x: number, z: number, w: number, d: number, top: number, mat = m.stone) =>
    box(x, top - 0.3, z, w, 0.6, d, mat);
  const post = (x: number, z: number, height: number, ground = 0, width = 0.8) => {
    // Body stops at the cap's underside; it must not share the cap's visible top.
    box(x, ground + (height + 0.08) / 2, z, width, height - 0.56, width, m.stoneSide);
    box(x, ground + 0.16, z, width + 0.32, 0.32, width + 0.32, m.stone);
    box(x, ground + height - 0.12, z, width + 0.25, 0.24, width + 0.25, m.stoneLight);
  };
  // Filled treads are 30cm high. Every tread is a real walking surface.
  const stairs = (x: number, z: number, count: number, direction: 'north' | 'south' | 'east' | 'west',
    width = 3.8, run = 0.72, ground = 0) => {
    const dx = direction === 'east' ? 1 : direction === 'west' ? -1 : 0;
    const dz = direction === 'south' ? 1 : direction === 'north' ? -1 : 0;
    for (let i = 0; i < count; i++) {
      const h = (i + 1) * 0.3;
      box(x + dx * run * (i + 0.5), ground + h / 2, z + dz * run * (i + 0.5),
        dx ? run : width, h, dz ? run : width, i % 3 === 0 ? m.stoneLight : m.stone);
    }
  };
  const crate = (x: number, z: number, size = 1.6, bottom = 0, stacked = false) => {
    box(x, bottom + size / 2, z, size, size, size, m.wood);
    // The frame is a visual detail on an already solid box.
    box(x, bottom + size * 0.17, z, size + 0.04, 0.13, size + 0.04, m.woodLight, false);
    box(x, bottom + size * 0.83, z, size + 0.04, 0.13, size + 0.04, m.woodLight, false);
    if (stacked) {
      const top = size * 0.76;
      box(x, bottom + size + top / 2, z, top, top, top, m.woodLight);
    }
  };
  const planter = (x: number, z: number, width: number, depth: number, bottom = 0) => {
    openBox(x, bottom + 1.1, z, width, 1.1, depth, m.stoneSide);
    const x0 = x - width / 2, x1 = x + width / 2, z0 = z - depth / 2, z1 = z + depth / 2;
    surface([
      { polygon: rectangle(x0, x1, z0, z0 + 0.12), material: m.stoneSide },
      { polygon: rectangle(x0, x1, z1 - 0.12, z1), material: m.stoneSide },
      { polygon: rectangle(x0, x0 + 0.12, z0 + 0.12, z1 - 0.12), material: m.stoneSide },
      { polygon: rectangle(x1 - 0.12, x1, z0 + 0.12, z1 - 0.12), material: m.stoneSide },
      { polygon: rectangle(x0 + 0.12, x1 - 0.12, z0 + 0.12, z1 - 0.12), material: m.turfLight },
    ], bottom + 1.1, 'Planter: flush soil and rim');
  };
  const tree = (x: number, z: number, scale = 1, bottom = 0) => {
    box(x, bottom + 1.4 * scale, z, 0.56 * scale, 2.8 * scale, 0.56 * scale, m.wood);
    // Broad, asymmetric crowns read as cheerful trees instead of miniature conifers.
    const lower = add(new THREE.IcosahedronGeometry(2.7 * scale, 1), m.leaf,
      x - 0.55 * scale, bottom + 4.55 * scale, z);
    lower.scale.set(1.18, 0.86, 1.04); lower.rotation.y = 0.28;
    const upper = add(new THREE.IcosahedronGeometry(2.35 * scale, 1), m.leafLight,
      x + 0.45 * scale, bottom + 6.15 * scale, z + 0.18 * scale);
    upper.scale.set(1.03, 0.9, 1.05); upper.rotation.y = 0.68;
    const side = add(new THREE.IcosahedronGeometry(1.8 * scale, 0), m.leafLight,
      x + 1.65 * scale, bottom + 4.3 * scale, z - 0.35 * scale);
    side.scale.set(1.12, 0.94, 1.02);
    beam(new THREE.Vector3(x, bottom + 2.3 * scale, z),
      new THREE.Vector3(x + 1.45 * scale, bottom + 4.15 * scale, z),
      0.28 * scale, 0.3 * scale, m.woodLight, false);
    // Foliage is deliberately not bullet-proof cover. The visible trunk is solid.
  };
  const crystalCluster = (x: number, z: number, angle: number) => {
    const foot = add(new THREE.CylinderGeometry(2.45, 2.65, 0.38, 6), m.rockLight, x, 0.19, z);
    foot.rotation.y = angle;
    collision(foot);
    for (const [offsetX, offsetZ, radius, height, lean] of [
      [0, 0, 0.9, 5.25, 0.03], [1.1, 0.3, 0.68, 3.15, -0.26], [-0.95, -0.6, 0.5, 2.25, 0.3],
    ]) {
      const vertices: number[] = [];
      const geometry = new THREE.BufferGeometry();
      const point = (a: number, y: number) => [Math.cos(a) * radius, y, Math.sin(a) * radius];
      const top = [radius * 0.12, height, -radius * 0.16];
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3, b = (i + 1) * Math.PI / 3;
        const p0 = point(a, 0), p1 = point(b, 0), p2 = point(a, height * 0.73), p3 = point(b, height * 0.73);
        const start = vertices.length / 3;
        vertices.push(...p0, ...p2, ...p1, ...p1, ...p2, ...p3, ...p2, ...top, ...p3);
        geometry.addGroup(start, 9, i % 3);
      }
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.computeVertexNormals();
      const mesh = add(geometry, [m.crystal, m.crystalDeep, m.crystalLight],
        x + Math.cos(angle) * offsetX - Math.sin(angle) * offsetZ, 0.28,
        z + Math.sin(angle) * offsetX + Math.cos(angle) * offsetZ);
      mesh.rotation.z = lean; mesh.rotation.y = angle;
      collision(mesh);
    }
  };
  const sign = (text: string, x: number, y: number, z: number, rotation = 0) => {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#294b93'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff'; ctx.font = '800 57px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 384, 67);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = add(new THREE.PlaneGeometry(5.4, 0.9), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }), x, y, z);
    mesh.rotation.y = rotation;
  };

  // TERRAIN SURFACE CONTRACT: ground, grass, every street intersection and the
  // central octagonal inlay are disjoint triangles at y=0. The one ground AABB
  // ends at exactly y=0. There are no underlying top faces, millimetre overlays,
  // polygon offsets or intersecting path boxes for the depth buffer to resolve.
  openBox(0, 0, 0, 84, 4, 84, m.rock);
  type PathRect = { x0: number; x1: number; z0: number; z1: number; material: THREE.Material };
  const paths: PathRect[] = [];
  const path = (x: number, z: number, w: number, d: number, material = m.path) =>
    paths.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, material });
  // Main paths take priority over the connecting lanes at their shared junctions.
  path(0, -38.5, 76, 4.8); path(0, 38.5, 76, 4.8);
  path(-38.5, 0, 4.8, 72); path(38.5, 0, 4.8, 72);
  path(0, 0, 9, 76); path(0, 0, 76, 9);
  for (const s of [-1, 1]) {
    path(s * 21.5, -12, 34, 4, m.pathDark);
    path(s * 21.5, 12, 34, 4, m.pathDark);
    path(-12, s * 25, 4, 24, m.pathDark);
    path(12, s * 25, 4, 24, m.pathDark);
  }
  const xCuts = [...new Set([-42, 42, ...paths.flatMap(p => [p.x0, p.x1])])].sort((a, b) => a - b);
  const zCuts = [...new Set([-42, 42, ...paths.flatMap(p => [p.z0, p.z1])])].sort((a, b) => a - b);
  const octagon = (radius: number): Point[] => Array.from({ length: 8 }, (_, i) => {
    const a = Math.PI / 8 + i * Math.PI / 4;
    return [Math.cos(a) * radius, Math.sin(a) * radius];
  });
  // Split a polygon into the portion inside a convex clip and disjoint exterior
  // pieces. This keeps the blue octagonal plaza inset flush with the streets.
  const partition = (polygon: Point[], clip: Point[]) => {
    let inside = polygon;
    const outside: Point[][] = [];
    for (let i = 0; i < clip.length && inside.length; i++) {
      const a = clip[i], b = clip[(i + 1) % clip.length];
      const side = (p: Point) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      const keep: Point[] = [], cut: Point[] = [];
      for (let j = 0; j < inside.length; j++) {
        const p = inside[j], q = inside[(j + 1) % inside.length];
        const dp = side(p), dq = side(q);
        (dp >= 0 ? keep : cut).push(p);
        if ((dp >= 0) !== (dq >= 0)) {
          const t = dp / (dp - dq);
          const crossing: Point = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
          keep.push(crossing); cut.push(crossing);
        }
      }
      if (cut.length >= 3) outside.push(cut);
      inside = keep;
    }
    return { inside, outside };
  };
  const terrainParts: SurfacePart[] = [];
  const plazaOuter = octagon(11.3), plazaInner = octagon(9.5);
  for (let xi = 0; xi < xCuts.length - 1; xi++) for (let zi = 0; zi < zCuts.length - 1; zi++) {
    const x0 = xCuts[xi], x1 = xCuts[xi + 1], z0 = zCuts[zi], z1 = zCuts[zi + 1];
    const x = (x0 + x1) / 2, z = (z0 + z1) / 2;
    const mat = paths.find(p => x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1)?.material ?? m.turf;
    const outer = partition(rectangle(x0, x1, z0, z1), plazaOuter);
    for (const polygon of outer.outside) terrainParts.push({ polygon, material: mat });
    if (outer.inside.length >= 3) {
      const inner = partition(outer.inside, plazaInner);
      for (const polygon of inner.outside) terrainParts.push({ polygon, material: m.stone });
      if (inner.inside.length >= 3) terrainParts.push({ polygon: inner.inside, material: m.pathDark });
    }
  }
  surface(terrainParts, 0, 'Terrain: one flush grass, street and plaza surface');

  // A steep, faceted root under the playable crown. Below-map stone is scenery.
  const root = add(new THREE.CylinderGeometry(59.35, 25, 13, 4, 1, false), m.rock, 0, -10.5, 0);
  root.rotation.y = Math.PI / 4;
  const point = add(new THREE.ConeGeometry(25, 16, 4), m.rockDark, 0, -24.5, 0);
  point.rotation.z = Math.PI;
  point.rotation.y = Math.PI / 4;
  for (const [x, z, turn] of [[-32, -32, 0.2], [31, -30, 0.7], [-29, 33, 0.5], [32, 31, 1.1]]) {
    const shard = add(new THREE.ConeGeometry(7, 17, 5), m.rockLight, x, -9, z);
    shard.rotation.z = Math.PI; shard.rotation.y = turn;
  }
  // Perimeter cover is deliberately broken by lookout bays rather than a fence.
  for (const side of [-1, 1]) {
    for (const at of [-32, -20, -8, 8, 20, 32]) {
      box(at, 0.64, side * 41.1, 5.4, 1.28, 1.3, m.stoneSide);
      box(side * 41.1, 0.64, at, 1.3, 1.28, 5.4, m.stoneSide);
    }
  }
  // CENTRAL RIFT. The lower quarter is missing, leaving an unobstructed doorway.
  for (const x of [-5.55, 5.55]) {
    box(x, 1.35, 0, 2.1, 2.7, 2.4, m.stoneSide);
    box(x, 2.63, 0, 2.45, 0.3, 2.65, m.stoneLight);
    box(x, 0.21, 0, 3, 0.42, 3, m.stone);
  }
  const radius = 7.6, centerY = 7.95;
  for (let i = 0; i < 9; i++) {
    const angle1 = (-45 + i * 30) * Math.PI / 180;
    const angle2 = (-45 + (i + 1) * 30) * Math.PI / 180;
    const a = new THREE.Vector3(Math.cos(angle1) * radius, centerY + Math.sin(angle1) * radius, 0);
    const b = new THREE.Vector3(Math.cos(angle2) * radius, centerY + Math.sin(angle2) * radius, 0);
    beam(a, b, 1.15, 1.65, m.dark);
    // Porcelain face follows the ring's actual facets, rather than a light bloom.
    a.z = 0.885; b.z = 0.885;
    beam(a, b, 0.54, 0.1, i % 3 === 0 ? m.brass : m.stoneLight, false);
  }
  for (let i = 0; i < 4; i++) {
    const shard = add(new THREE.OctahedronGeometry(0.7 - i * 0.08, 0), m.crystal,
      Math.sin(i * 1.8) * 1.6, 10.5 + i * 1.2, -0.12);
    shard.scale.y = 1.75;
    moving.push({ mesh: shard, baseY: shard.position.y, phase: i * 1.6 });
  }
  // Low flanking cover makes the middle contestable without closing its sightlines.
  box(-12.8, 0.75, -3.8, 4.6, 1.5, 1.4, m.stoneSide);
  box(12.8, 0.75, 3.8, 4.6, 1.5, 1.4, m.stoneSide);
  box(-3.8, 0.75, 13.2, 1.4, 1.5, 4.6, m.stoneSide);
  box(3.8, 0.75, -13.2, 1.4, 1.5, 4.6, m.stoneSide);
  // Faceted sapphire outcrops frame the monument while leaving all four streets open.
  crystalCluster(-10.2, -9.5, 0.6);
  crystalCluster(10.2, 9.5, Math.PI + 0.6);
  crystalCluster(10.8, -10.2, -0.75);
  crystalCluster(-10.8, 10.2, Math.PI - 0.75);

  // NORTHWEST · The Forge: a high open armory, with a broad stair from the plaza.
  slab(-25, -24, 18, 12, 3.6);
  for (const x of [-33, -17]) for (const z of [-29, -19]) post(x, z, 3);
  stairs(-24, -9.36, 12, 'north', 4.2);
  box(-25, 4.08, -29.45, 18, 0.96, 1.1, m.stoneSide);
  box(-33.45, 4.08, -24.95, 1.1, 0.96, 7.9, m.stoneSide);
  box(-16.55, 4.08, -25.45, 1.1, 0.96, 6.9, m.stoneSide);
  // Stair landing remains entirely clear.
  crate(-29, -24, 1.8, 3.6, true);
  crate(-20, -27, 1.6, 3.6);
  box(-29, 0.55, -25, 5.5, 1.1, 2.4, m.charcoal);
  box(-29, 1.3, -25, 2.8, 0.55, 1.3, m.dark);
  box(-20.5, 1.15, -24.5, 2.3, 2.3, 2.3, m.stoneSide);
  box(-20.5, 2.4, -24.5, 2.7, 0.26, 2.7, m.stoneLight);
  crate(-31, -15, 1.8, 0, true);
  crate(-34, -14.8, 1.6);
  // A narrow crane gives this quarter a recognizable silhouette, with no giant roof.
  box(-32, 6.8, -28.5, 0.72, 6.4, 0.72, m.dark);
  box(-29, 9.8, -28.5, 6.7, 0.6, 0.65, m.dark);
  beam(new THREE.Vector3(-31.7, 7.6, -28.5), new THREE.Vector3(-27.4, 9.65, -28.5), 0.24, 0.3, m.brass);
  const pennant = add(new THREE.PlaneGeometry(2.4, 2), m.coral, -31.55, 8, -28.45);
  cloth.push(pennant);
  sign('THE FORGE', -25, 2.82, -17.68);
  tree(-35, -33, 0.85);
  // A bright blue smelter stack is visible above the forge from every approach.
  box(-34, 4.75, -25, 2.2, 9.5, 2.2, m.dark);
  box(-34, 7.95, -25, 2.32, 2.1, 2.32, m.coral);
  box(-34, 9.5, -25, 3.1, 0.64, 3.1, m.coralLight);
  box(-34, 9.85, -25, 1.85, 0.12, 1.85, m.charcoal, false);
  box(-34, 0.28, -25, 2.9, 0.56, 2.9, m.stone);

  // NORTHEAST · Hanging Garden: tallest playable terrace and a single ascending lane.
  slab(25, -26, 14, 14, 5.4, m.stoneLight);
  for (const x of [19, 31]) for (const z of [-32, -20]) post(x, z, 4.8, 0, 1.05);
  stairs(5.04, -26, 18, 'east', 4.2);
  planter(25, -31.8, 12.5, 1.55, 5.4);
  planter(31.3, -26, 1.4, 8.4, 5.4);
  planter(24, -19.7, 6.5, 1.4, 5.4);
  tree(28.7, -30.7, 0.64, 6.5);
  tree(22, -31.8, 0.52, 6.5);
  // Broad square blocks are an alternative double-jump ascent from the south.
  slab(27, -15, 4, 4, 1.5, m.stoneSide);
  slab(31.1, -16.2, 3.3, 3.3, 3, m.stone);
  planter(22, -24, 3.6, 2.2, 5.4);
  box(22, 0.85, -29, 4.2, 1.7, 2, m.stoneSide);
  box(28.5, 0.72, -23.5, 3.8, 1.44, 1.8, m.stoneSide);
  tree(35.5, -33.5, 1.04);
  tree(35.6, -16.4, 0.75);
  planter(20, -12, 4.5, 2.2);
  sign('HANGING GARDEN', 25, 4.68, -18.66);
  for (const x of [19.5, 25, 30.5]) {
    box(x, 8, -33, 0.2, 5.2, 0.2, m.brass);
    const bannerShape = new THREE.Shape();
    bannerShape.moveTo(0, 0); bannerShape.lineTo(2.2, -0.6);
    bannerShape.lineTo(1.7, -1.4); bannerShape.lineTo(0, -1.8); bannerShape.closePath();
    const banner = add(new THREE.ShapeGeometry(bannerShape), x === 25 ? m.coralLight : m.coral,
      x + 0.1, 10.6, -33);
    cloth.push(banner);
  }

  // SOUTHEAST · Astral Court: low stepped terraces, open arches and an armillary.
  slab(25, 25, 18, 18, 1.2, m.stone);
  stairs(13.12, 24, 4, 'east', 5);
  stairs(25, 13.12, 4, 'south', 5);
  slab(29, 29, 7.5, 7.5, 2.4, m.stoneLight);
  stairs(29, 22.37, 4, 'south', 3, 0.72, 1.2);
  for (const z of [18, 31.5]) {
    post(17.8, z, 5.15, 1.2);
    post(22.8, z, 5.15, 1.2);
    box(20.3, 6.7, z, 6.1, 0.7, 1.12, m.stoneLight);
    const roof = add(new THREE.ConeGeometry(4.1, 2.4, 4), m.coral, 20.3, 8.25, z);
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = 0.56;
    collision(roof);
  }
  box(33.1, 1.8, 20, 1.2, 1.2, 7, m.stoneSide);
  box(25, 1.8, 33.36, 5.4, 1.2, 1.2, m.stoneSide);
  box(29, 3.12, 29, 2.1, 1.44, 2.1, m.dark);
  const globe = add(new THREE.IcosahedronGeometry(1.05, 0), m.crystal, 29, 5.1, 29);
  // The instrument is solid cover; its broad plinth is the same footprint.
  collision(globe);
  const orbit1 = add(new THREE.TorusGeometry(1.85, 0.09, 4, 12), m.brass, 29, 5.1, 29);
  const orbit2 = add(new THREE.TorusGeometry(1.85, 0.09, 4, 12), m.brass, 29, 5.1, 29);
  orbit1.rotation.x = 0.8; orbit1.rotation.y = 0.38;
  orbit2.rotation.y = Math.PI / 2; orbit2.rotation.z = 0.28;
  moving.push({ mesh: orbit1, baseY: 5.1, phase: 2.1 });
  moving.push({ mesh: orbit2, baseY: 5.1, phase: 3.7 });
  // A fallen column creates a useful piece of long cover on the outer lane.
  box(32.5, 0.9, 11.1, 5.6, 1.8, 1.7, m.stoneSide);
  box(13.2, 0.68, 31.5, 1.4, 1.36, 5.4, m.stoneSide);
  tree(36, 34.5, 0.9);
  tree(35.6, 16, 0.7);
  sign('ASTRAL COURT', 25.8, 2.25, 15.93);

  // SOUTHWEST · Wind Bazaar: climbable awnings and a lively, legible ground maze.
  // Roof color bands are adjacent faces in one surface, at the exact 2.4m
  // collider height. No full orange roof or stripe boxes sit underneath them.
  openBox(-27, 2.4, 24.5, 14, 0.6, 9, m.woodLight);
  const stripeCenters = [-32.2, -29, -25.8, -22.6];
  const roofCuts = [-34, ...stripeCenters.flatMap(x => [x - 0.65, x + 0.65]), -20];
  surface(roofCuts.slice(0, -1).map((x0, i) => ({
    polygon: rectangle(x0, roofCuts[i + 1], 20, 29),
    material: i % 2 ? m.coralLight : m.coral,
  })), 2.4, 'Bazaar roof: flush orange and gold stripes');
  for (const x of [-33, -21]) for (const z of [21, 28]) {
    box(x, 0.9, z, 0.58, 1.8, 0.58, m.wood);
  }
  stairs(-27, 14.24, 8, 'south', 4);
  for (const x of [-32, -29.5, -27, -24.5, -22]) {
    box(x, 2.15, 29.04, 1.18, 0.46, 0.045, m.coralLight, false);
  }
  box(-33.5, 2.94, 24.5, 0.7, 1.05, 9, m.wood);
  crate(-22.5, 26.4, 1.5, 2.4);
  crate(-30.5, 26.4, 1.5, 2.4);
  box(-29.5, 0.55, 25, 5.6, 1.1, 1.6, m.woodLight);
  crate(-22.2, 24.4, 1.55);
  // Small adjacent stalls form flanking choices rather than a single choke.
  openBox(-16.6, 2.4, 28.6, 5.5, 0.6, 5.5, m.woodLight);
  surface([{ polygon: rectangle(-19.35, -13.85, 25.85, 31.35), material: m.coralLight }],
    2.4, 'Small bazaar roof: single canvas surface');
  for (const x of [-18.9, -14.3]) {
    box(x, 0.9, 30.9, 0.45, 1.8, 0.45, m.wood);
  }
  crate(-16.7, 25.3, 1.2);
  crate(-14.6, 31.2, 1.4);
  crate(-33.6, 15.2, 1.9, 0, true);
  crate(-17.4, 17.1, 1.6, 0, true);
  box(-28, 0.56, 33.6, 5.6, 1.12, 1.6, m.stoneSide);
  tree(-35.5, 34.5, 0.9);
  tree(-35.4, 10.9, 0.74);
  sign('WIND BAZAAR', -27, 1.8, 19.94);

  // Street furniture offers hard cover between safe outer spawns and the action.
  for (const [x, z, w, d] of [[-23, 3, 4.5, 1.6], [23, -3, 4.5, 1.6],
    [-3, -23, 1.6, 4.5], [3, 23, 1.6, 4.5]] as number[][]) {
    planter(x, z, w, d);
  }
  crate(-10, -34, 1.7);
  crate(8.5, 33, 1.7, 0, true);
  crate(-33, -4.7, 1.8);
  crate(33, 4.7, 1.8);

  const jumpPads: JumpPad[] = [
    { x: -9, y: 0.16, z: -19, radius: 1.6, power: 16.5 },
    { x: 9, y: 0.16, z: 19, radius: 1.6, power: 16.5 },
    { x: -31.5, y: 0.16, z: 7, radius: 1.6, power: 15 },
    { x: 31.5, y: 0.16, z: -7, radius: 1.6, power: 15 },
  ];
  for (const pad of jumpPads) {
    const rim = add(new THREE.CylinderGeometry(1.65, 1.8, 0.12, 8), m.dark, pad.x, 0.06, pad.z);
    rim.rotation.y = Math.PI / 8;
    collision(rim);
    const face = add(new THREE.CylinderGeometry(1.4, 1.4, 0.04, 8, 1, true), m.pad, pad.x, 0.14, pad.z);
    face.rotation.y = Math.PI / 8;
    collision(face);
    const faceShape = new THREE.Shape(octagon(1.4).map(([x, z]) => new THREE.Vector2(x, z)));
    // The face has real holes for its inlaid chevrons. All three colors occupy
    // exactly one plane at 0.16m, matching the pad collider and launch point.
    for (const offset of [-0.33, 0.33]) {
      const shape = new THREE.Shape();
      shape.moveTo(-0.7, offset - 0.15); shape.lineTo(0, offset + 0.26);
      shape.lineTo(0.7, offset - 0.15); shape.lineTo(0.7, offset + 0.08);
      shape.lineTo(0, offset + 0.5); shape.lineTo(-0.7, offset + 0.08); shape.closePath();
      faceShape.holes.push(new THREE.Path(shape.getPoints()));
      const chevron = add(new THREE.ShapeGeometry(shape), m.stoneLight, pad.x, pad.y, pad.z);
      chevron.rotation.x = -Math.PI / 2;
    }
    const inlay = add(new THREE.ShapeGeometry(faceShape), m.pad, pad.x, pad.y, pad.z);
    inlay.rotation.x = -Math.PI / 2;
  }

  // Small grass tufts break up the lawn without hiding players or creating obstacles.
  // One instanced draw keeps the more colorful landscape inexpensive in the browser.
  const grassGeometry = new THREE.BufferGeometry();
  grassGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.3, 0, 0, -0.08, 0.56, 0.07, 0.02, 0, 0,
    -0.02, 0, 0.12, 0.16, 0.42, 0.04, 0.32, 0, 0.12,
    0.04, 0, -0.22, -0.1, 0.38, -0.08, 0.2, 0, 0.08,
  ], 3));
  grassGeometry.computeVertexNormals();
  const tufts: THREE.Matrix4[] = [];
  const tuftTransform = new THREE.Object3D();
  for (let i = 0; i < 220; i++) {
    const x = Math.sin(i * 127.13) * 35.8;
    const z = Math.sin(i * 91.73 + 1.7) * 35.8;
    if (Math.abs(x) < 6 || Math.abs(z) < 6 || Math.abs(Math.abs(x) - 12) < 2.4 || Math.abs(Math.abs(z) - 12) < 2.4) continue;
    if (colliders.some(c => c.maxY > 0.04 && c.minY < 1 && x > c.minX - 0.3 && x < c.maxX + 0.3 && z > c.minZ - 0.3 && z < c.maxZ + 0.3)) continue;
    tuftTransform.position.set(x, 0, z);
    tuftTransform.rotation.y = i * 2.4;
    tuftTransform.scale.setScalar(0.65 + (i % 5) * 0.17);
    tuftTransform.updateMatrix();
    tufts.push(tuftTransform.matrix.clone());
  }
  const grass = new THREE.InstancedMesh(grassGeometry, m.grass, tufts.length);
  tufts.forEach((matrix, i) => grass.setMatrixAt(i, matrix));
  grass.receiveShadow = true;
  group.add(grass);

  // Offset islands give the skyline depth. They cannot be reached or used as cover.
  for (const [x, z, size, height] of [[-96, -83, 15, -3], [93, -58, 12, 5],
    [111, 70, 18, -9], [-87, 93, 11, 2], [4, -140, 20, -18]] as number[][]) {
    const land = add(new THREE.CylinderGeometry(size, size * 0.85, 2, 6), m.turf, x, height, z);
    land.rotation.y = 0.4;
    const rock = add(new THREE.ConeGeometry(size * 0.92, size * 1.8, 6), m.rockLight, x, height - size * 0.9 - 1, z);
    rock.rotation.z = Math.PI; rock.rotation.y = 0.4;
    box(x, height + 3, z, 2.4, 5, 2.4, m.stoneSide, false);
    box(x, height + 6, z, 4.5, 1.2, 4.5, m.stone, false);
  }

  const spawns: SpawnPoint[] = [
    { x: -35.6, y: 0.05, z: -35.6, yaw: -Math.PI * 0.75 },
    { x: 35.6, y: 0.05, z: -35.6, yaw: Math.PI * 0.75 },
    { x: 35.6, y: 0.05, z: 35.6, yaw: Math.PI / 4 },
    { x: -35.6, y: 0.05, z: 35.6, yaw: -Math.PI / 4 },
    { x: 0, y: 0.05, z: -36.5, yaw: Math.PI },
    { x: 36.5, y: 0.05, z: 0, yaw: Math.PI / 2 },
    { x: 0, y: 0.05, z: 36.5, yaw: 0 },
    { x: -36.5, y: 0.05, z: 0, yaw: -Math.PI / 2 },
    { x: -27, y: 3.65, z: -20.4, yaw: Math.PI },
    { x: 26, y: 5.45, z: -24.5, yaw: 0 },
    { x: 24, y: 1.25, z: 27, yaw: 0 },
    { x: -27, y: 2.45, z: 23, yaw: 0 },
  ];
  const pickups: PickupPoint[] = [
    { id: 'forge-health', kind: 'health', x: -24, y: 4.5, z: -25 },
    { id: 'forge-mana', kind: 'mana', x: -25, y: 0.9, z: -21 },
    { id: 'garden-shield', kind: 'shield', x: 27.5, y: 6.3, z: -26 },
    { id: 'garden-haste', kind: 'haste', x: 25, y: 0.9, z: -22 },
    { id: 'court-mana', kind: 'mana', x: 25, y: 2.1, z: 24 },
    { id: 'court-health', kind: 'health', x: 31, y: 3.3, z: 29 },
    { id: 'bazaar-shield', kind: 'shield', x: -27, y: 3.3, z: 25.2 },
    { id: 'bazaar-haste', kind: 'haste', x: -18.3, y: 0.9, z: 22 },
  ];
  group.updateMatrixWorld(true);
  return { group, colliders, spawns, pickups, jumpPads,
    update(time: number, _dt: number) {
      for (const { mesh, baseY, phase } of moving) {
        mesh.rotation.y = time * 0.3 + phase;
        mesh.position.y = baseY + Math.sin(time * 1.1 + phase) * 0.12;
      }
      for (const mesh of cloth) mesh.rotation.y = Math.sin(time * 1.5) * 0.08;
    },
  };
}
