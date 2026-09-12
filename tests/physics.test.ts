import { afterAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createArena } from '../src/assets/arena';
import { blocked, HEIGHT, RADIUS, rayBox, raySphere, rayWorld, safeBlink, stepBody } from '../src/physics';
import type { Body } from '../src/physics';
import type { Collider } from '../src/world-types';

const floor: Collider = { minX: -100, maxX: 100, minY: -2, maxY: 0, minZ: -100, maxZ: 100 };
const wall: Collider = { minX: -3, maxX: 3, minY: 0, maxY: 5, minZ: -3, maxZ: -2 };
const body = (overrides: Partial<Body> = {}): Body => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grounded: true, jumps: 0, ...overrides });

describe('combat ray intersections', () => {
  it('finds an axis-aligned wall face and rejects a parallel ray outside its bounds', () => {
    expect(rayBox({ x: 0, y: 1.55, z: 0 }, { x: 0, y: 0, z: -1 }, wall)).toBe(2);
    expect(rayBox({ x: 5, y: 1.55, z: 0 }, { x: 0, y: 0, z: -1 }, wall)).toBe(Infinity);
  });

  it('returns the nearest obstruction regardless of collider ordering', () => {
    const distant = { ...wall, minZ: -9, maxZ: -8 };
    expect(rayWorld({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, [distant, wall], 100)).toBe(2);
    expect(rayWorld({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, [distant], 5)).toBe(5);
  });

  it('distinguishes a head hit, an off-axis miss, and a target behind the shooter', () => {
    const origin = { x: 0, y: 1.55, z: 0 };
    const direction = { x: 0, y: 0, z: -1 };
    expect(raySphere(origin, direction, { x: 0, y: 1.55, z: -10 }, 0.29)).toBeCloseTo(9.71);
    expect(raySphere(origin, direction, { x: 1, y: 1.55, z: -10 }, 0.29)).toBe(Infinity);
    expect(raySphere(origin, direction, { x: 0, y: 1.55, z: 10 }, 0.29)).toBe(Infinity);
  });
});

describe('character movement', () => {
  it('completes a jump, lands on the floor, and restores both jumps', () => {
    const b = body({ vy: 9, grounded: false, jumps: 1 });
    let apex = 0;
    for (let i = 0; i < 120; i++) { stepBody(b, 1 / 60, [floor]); apex = Math.max(apex, b.y); }
    expect(apex).toBeGreaterThan(1.6);
    expect(b.y).toBe(0);
    expect(b.vy).toBe(0);
    expect(b.grounded).toBe(true);
    expect(b.jumps).toBe(0);
  });

  it('stops upward velocity when the head meets a ceiling', () => {
    const ceiling: Collider = { minX: -2, maxX: 2, minY: 2.5, maxY: 3, minZ: -2, maxZ: 2 };
    const b = body({ y: 0.65, vy: 9, grounded: false, jumps: 1 });
    stepBody(b, 1 / 60, [floor, ceiling]);
    expect(b.y).toBeCloseTo(ceiling.minY - HEIGHT);
    expect(b.vy).toBe(0);
    expect(blocked(b, [ceiling])).toBe(false);
  });

  it('blocks normal forward movement at a wall without stopping parallel motion', () => {
    const b = body({ vx: 1.5, vz: -6.5 });
    for (let i = 0; i < 25; i++) stepBody(b, 1 / 60, [floor, wall]);
    expect(b.z).toBeGreaterThanOrEqual(wall.maxZ + RADIUS);
    expect(b.x).toBeGreaterThan(0.5);
    expect(blocked(b, [wall])).toBe(false);
  });

  it('walks up a 30 cm tread and remains above its solid volume', () => {
    const tread: Collider = { minX: -2, maxX: 2, minY: 0, maxY: 0.3, minZ: -2, maxZ: -0.5 };
    const b = body({ vz: -3 });
    for (let i = 0; i < 20; i++) stepBody(b, 1 / 60, [floor, tread]);
    expect(b.z).toBeLessThan(-0.6);
    expect(b.y).toBeCloseTo(0.3, 1);
    expect(blocked(b, [tread])).toBe(false);
  });

  it('does not tunnel through thin cover at grapple speed on a 25 fps frame', () => {
    const thinWall: Collider = { minX: -2, maxX: 2, minY: 0, maxY: 4, minZ: -0.05, maxZ: 0.05 };
    const b = body({ z: 0.5, vz: -32 });
    stepBody(b, 0.04, [floor, thinWall]);
    expect(b.z).toBeGreaterThanOrEqual(thinWall.maxZ + RADIUS - 0.001);
    expect(blocked(b, [thinWall])).toBe(false);
  });

  it('still blocks thin walls at three times sprint speed combined with a grapple impulse', () => {
    const thinWall: Collider = { minX: -2, maxX: 2, minY: 0, maxY: 4, minZ: -0.05, maxZ: 0.05 };
    const b = body({ z: 0.5, vz: -(10 * 3 + 21) });
    stepBody(b, 0.04, [floor, thinWall]);
    expect(b.z).toBeGreaterThanOrEqual(thinWall.maxZ + RADIUS - 0.001);
    expect(blocked(b, [thinWall])).toBe(false);
  });

  it('low gravity creates a higher, longer jump that still lands and restores jumps', () => {
    const normal = body({ vy: 9, grounded: false, jumps: 1 });
    const lowGravity = body({ vy: 9, grounded: false, jumps: 1 });
    let normalApex = 0;
    let lowApex = 0;
    let normalLandedAt = 0;
    let lowLandedAt = 0;
    for (let frame = 1; frame <= 240; frame++) {
      stepBody(normal, 1 / 60, [floor], HEIGHT, 22);
      stepBody(lowGravity, 1 / 60, [floor], HEIGHT, 9);
      normalApex = Math.max(normalApex, normal.y);
      lowApex = Math.max(lowApex, lowGravity.y);
      if (normal.grounded && normalLandedAt === 0) normalLandedAt = frame / 60;
      if (lowGravity.grounded && lowLandedAt === 0) lowLandedAt = frame / 60;
    }
    expect(lowApex).toBeGreaterThan(normalApex * 2);
    expect(lowLandedAt).toBeGreaterThan(normalLandedAt * 2);
    expect(lowLandedAt).toBeGreaterThan(1.8);
    expect(lowGravity).toMatchObject({ y: 0, vy: 0, grounded: true, jumps: 0 });
  });
});

describe('safe teleport paths', () => {
  it('travels the intended distance through open space', () => {
    const result = safeBlink({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, [floor], 9);
    expect(result.z).toBeCloseTo(-9);
    expect(result.y).toBe(0);
  });

  it('stops the whole character before a wall, even when the destination is clear', () => {
    const result = safeBlink({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, [floor, wall], 9);
    expect(result.z).toBeLessThan(-1);
    expect(result.z).toBeGreaterThanOrEqual(wall.maxZ + RADIUS);
    expect(blocked(result, [wall])).toBe(false);
  });

  it('accounts for the head when attempting to blink under a low overhang', () => {
    const overhang: Collider = { minX: -2, maxX: 2, minY: 1.2, maxY: 2.5, minZ: -6, maxZ: -2 };
    const result = safeBlink({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, [floor, overhang], 9);
    expect(result.z).toBeGreaterThanOrEqual(overhang.maxZ + RADIUS);
    expect(blocked(result, [overhang])).toBe(false);
  });
});

describe('The Crown spawn locations', () => {
  const arena = createArena();
  afterAll(() => {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    arena.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
  });

  it('provides enough distinct spawn locations for a full eight-player match', () => {
    expect(arena.spawns.length).toBeGreaterThanOrEqual(8);
    expect(new Set(arena.spawns.map(s => `${s.x},${s.y},${s.z}`)).size).toBe(arena.spawns.length);
  });

  it.each(arena.spawns.map((spawn, index) => ({ ...spawn, index })))('spawn $index clears geometry and settles onto a real walking surface', spawn => {
    expect(blocked(spawn, arena.colliders)).toBe(false);
    expect(rayWorld(spawn, { x: 0, y: -1, z: 0 }, arena.colliders, 1)).toBeLessThan(0.11);
    const b = body(spawn);
    for (let i = 0; i < 12; i++) stepBody(b, 1 / 60, arena.colliders);
    expect(b.grounded).toBe(true);
    expect(Math.abs(b.y - spawn.y)).toBeLessThan(0.11);
    expect(blocked(b, arena.colliders)).toBe(false);
  });
});
