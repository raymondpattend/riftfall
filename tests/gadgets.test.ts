import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { GADGETS, GADGET_IDS, isGadget } from '../src/gadgets';
import type { GadgetId } from '../src/gadgets';
import { GROUND_LOOT } from '../src/loot-rules';
import { DEFAULT_MODIFIERS } from '../src/modifiers';
import { WEAPONS } from '../src/rules';
import type { Movement, Player } from '../src/rules';
import type { Collider } from '../src/world-types';

const floor: Collider = { minX: -100, maxX: 100, minY: -2, maxY: 0, minZ: -100, maxZ: 100 };
const wall: Collider = { minX: -4, maxX: 4, minY: 0, maxY: 8, minZ: -4, maxZ: -3 };

function fixture(colliders: Collider[] = [floor]) {
  const simulation = new Simulation({ colliders, pickups: [], jumpPads: [], spawns: [
    { x: -30, y: 0, z: -30, yaw: 0 }, { x: 30, y: 0, z: 30, yaw: Math.PI },
    { x: 30, y: 0, z: -30, yaw: 0 }, { x: -30, y: 0, z: 30, yaw: Math.PI },
  ] });
  const owner = simulation.addPlayer('owner', 'Juniper')!;
  const rival = simulation.addPlayer('rival', 'Cinder')!;
  Object.assign(owner, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, protectedUntil: 0 });
  Object.assign(rival, { x: 0, y: 0, z: -8, protectedUntil: 0 });
  return { simulation, owner, rival };
}

function equip(player: Player, gadget: GadgetId, charges: number = GADGETS[gadget].charges) {
  Object.assign(player, { gadget, gadgetCharges: charges, gadgetUntil: 0 });
}

function collect(simulation: Simulation, player: Player, gadget: GadgetId) {
  const item = GROUND_LOOT.find(item => item.kind === gadget)!;
  Object.assign(player, { x: item.x, y: item.y, z: item.z });
  simulation.action(player.id, { type: 'pickup' });
  return item;
}

describe('pocket relic inventory', () => {
  it('spawns with an empty slot and clears relics and slows on ordinary respawn', () => {
    const { simulation, owner } = fixture();
    expect(owner).toMatchObject({ gadget: null, gadgetCharges: 0, gadgetUntil: 0, chilledUntil: 0 });
    equip(owner, 'ice_wand');
    Object.assign(owner, { chilledUntil: 10, gadgetUntil: 10 });
    simulation.spawn(owner);
    expect(owner).toMatchObject({ gadget: null, gadgetCharges: 0, gadgetUntil: 0, chilledUntil: 0 });
  });

  it.each(GADGET_IDS.filter(id => id !== 'nuke'))('collects %s from its actual ground drop and replaces the carried relic', gadget => {
    const { simulation, owner } = fixture();
    equip(owner, gadget === 'ice_wand' ? 'bonzo_staff' : 'ice_wand', 99);
    const item = collect(simulation, owner, gadget);
    expect(owner).toMatchObject({ gadget, gadgetCharges: GADGETS[gadget].charges, gadgetUntil: 0, weapon: 'rifle' });
    expect(simulation.loot[item.id]).toBeGreaterThan(simulation.time);
    expect(simulation.events.find(event => event.type === 'pickup')).toMatchObject({ from: owner.id, text: GADGETS[gadget].name });
  });

  it('shares a relic pickup cooldown between players and makes the drop available again', () => {
    const { simulation, owner, rival } = fixture();
    const item = collect(simulation, owner, 'ice_wand');
    Object.assign(rival, { x: item.x, y: item.y, z: item.z });
    simulation.action(rival.id, { type: 'pickup' });
    expect(rival).toMatchObject({ gadget: null, gadgetCharges: 0 });
    simulation.tick(simulation.loot[item.id] - simulation.time + 0.001);
    simulation.action(rival.id, { type: 'pickup' });
    expect(rival).toMatchObject({ gadget: 'ice_wand', gadgetCharges: 2 });
    expect(simulation.events.filter(event => event.type === 'pickup')).toHaveLength(2);
  });

  it('rejects movement packets that try to replace inventory or reset effect timers', () => {
    const { simulation, owner } = fixture();
    equip(owner, 'ice_wand', 1);
    Object.assign(owner, { gadgetUntil: 10, chilledUntil: 7 });
    const movement = { x: 0.5, y: 0, z: 0, yaw: 0, pitch: 0, weapon: 'rifle', grounded: true, warp: owner.warp,
      gadget: 'bonzo_staff', gadgetCharges: 999, gadgetUntil: 0, chilledUntil: 0,
      modifiers: { partyLoot: true, fastReload: true } } as unknown as Movement;
    simulation.movement(owner.id, movement);
    expect(owner).toMatchObject({ x: 0, gadget: 'ice_wand', gadgetCharges: 1, gadgetUntil: 10, chilledUntil: 7 });
    expect(simulation.modifiers).toMatchObject({ partyLoot: false, fastReload: false });
  });

  it.each(['empty', 'zero charges', 'reloading', 'dead', 'finished round'] as const)('cannot activate a relic while %s', state => {
    const { simulation, owner, rival } = fixture();
    equip(owner, 'ice_wand');
    if (state === 'empty') Object.assign(owner, { gadget: null, gadgetCharges: 0 });
    if (state === 'zero charges') owner.gadgetCharges = 0;
    if (state === 'reloading') Object.assign(owner, { reloading: 'rifle', reloadUntil: 10 });
    if (state === 'dead') Object.assign(owner, { hp: 0, deadUntil: 99 });
    if (state === 'finished round') simulation.winner = rival.id;
    const charges = owner.gadgetCharges;
    simulation.action(owner.id, { type: 'gadget' });
    expect(owner.gadgetCharges).toBe(charges);
    expect(rival).toMatchObject({ hp: 100, shield: 50, chilledUntil: 0 });
    expect(simulation.fields).toHaveLength(0);
    expect(simulation.grenades).toHaveLength(0);
  });

  it('respects the scaled activation cooldown and empties the slot after the last use', () => {
    const { simulation, owner } = fixture();
    simulation.setModifiers({ cooldownScale: 0.5 });
    equip(owner, 'ice_wand');
    simulation.action(owner.id, { type: 'gadget' });
    expect(owner.gadgetUntil - simulation.time).toBeCloseTo(0.325);
    expect(owner.gadgetCharges).toBe(1);
    simulation.tick(0.324);
    simulation.action(owner.id, { type: 'gadget' });
    expect(owner.gadgetCharges).toBe(1);
    simulation.tick(0.002);
    simulation.action(owner.id, { type: 'gadget' });
    expect(owner).toMatchObject({ gadget: null, gadgetCharges: 0 });
  });

  it('snapshots copy carried relic state and field data without exposing live objects', () => {
    const { simulation, owner } = fixture();
    equip(owner, 'healing_totem');
    simulation.action(owner.id, { type: 'gadget' });
    equip(owner, 'ice_wand');
    const snapshot = simulation.snapshot();
    const player = snapshot.players.find(player => player.id === owner.id)!;
    expect(player).toMatchObject({ gadget: 'ice_wand', gadgetCharges: 2 });
    expect(snapshot.fields).toHaveLength(1);
    player.gadgetCharges = 99;
    snapshot.fields![0].x = 999;
    expect(owner.gadgetCharges).toBe(2);
    expect(simulation.fields[0].x).not.toBe(999);
  });
});

describe('Ice Spray Wand', () => {
  it('slows a visible opponent for three seconds and deals ten damage', () => {
    const { simulation, owner, rival } = fixture();
    equip(owner, 'ice_wand');
    simulation.action(owner.id, { type: 'gadget' });
    expect(rival).toMatchObject({ hp: 100, shield: 40 });
    expect(rival.chilledUntil - simulation.time).toBeCloseTo(3);
    expect(owner.chilledUntil).toBe(0);
    expect(owner.gadgetCharges).toBe(1);
  });

  it.each([{ x: 0, z: -13 }, { x: 8, z: -4 }, { x: 0, z: 4 }])('does not reach an opponent at $x, $z outside its forward cone or range', position => {
    const { simulation, owner, rival } = fixture();
    Object.assign(rival, position);
    equip(owner, 'ice_wand');
    simulation.action(owner.id, { type: 'gadget' });
    expect(rival).toMatchObject({ hp: 100, shield: 50, chilledUntil: 0 });
    expect(owner.gadgetCharges).toBe(1);
  });

  it('does not apply damage or slow through a wall or to a protected opponent', () => {
    const blocked = fixture([floor, wall]);
    equip(blocked.owner, 'ice_wand');
    blocked.simulation.action(blocked.owner.id, { type: 'gadget' });
    expect(blocked.rival).toMatchObject({ shield: 50, chilledUntil: 0 });
    const protectedMatch = fixture();
    protectedMatch.rival.protectedUntil = 10;
    equip(protectedMatch.owner, 'ice_wand');
    protectedMatch.simulation.action(protectedMatch.owner.id, { type: 'gadget' });
    expect(protectedMatch.rival).toMatchObject({ shield: 50, chilledUntil: 0 });
  });
});

describe('Swap Pearl', () => {
  it('swaps visible opponents and invalidates both old movement acknowledgements', () => {
    const { simulation, owner, rival } = fixture();
    equip(owner, 'swap_pearl');
    const previousOwner = { x: owner.x, y: owner.y, z: owner.z, warp: owner.warp };
    const previousRival = { x: rival.x, y: rival.y, z: rival.z, warp: rival.warp };
    simulation.action(owner.id, { type: 'gadget' });
    expect(owner).toMatchObject({ x: previousRival.x, y: previousRival.y, z: previousRival.z, warp: previousOwner.warp + 1, gadget: null, gadgetCharges: 0 });
    expect(rival).toMatchObject({ x: previousOwner.x, y: previousOwner.y, z: previousOwner.z, warp: previousRival.warp + 1 });
    simulation.movement(rival.id, { ...previousRival, yaw: 0, pitch: 0, weapon: 'rifle', grounded: true });
    expect(rival.z).toBe(previousOwner.z);
    expect(owner.hp).toBe(100);
    expect(rival.hp).toBe(100);
  });

  it.each([{ x: 10, z: -10 }, { x: 0, z: -29 }])('keeps the pearl when the opponent at $x, $z is not a valid aimed target', position => {
    const { simulation, owner, rival } = fixture();
    Object.assign(rival, position);
    equip(owner, 'swap_pearl');
    const warp = owner.warp;
    simulation.action(owner.id, { type: 'gadget' });
    expect(owner).toMatchObject({ gadget: 'swap_pearl', gadgetCharges: 1, warp, z: 0 });
  });

  it('keeps the pearl when cover blocks the aimed opponent', () => {
    const { simulation, owner, rival } = fixture([floor, wall]);
    equip(owner, 'swap_pearl');
    simulation.action(owner.id, { type: 'gadget' });
    expect(owner).toMatchObject({ gadget: 'swap_pearl', gadgetCharges: 1, z: 0 });
    expect(rival.z).toBe(-8);
  });
});

describe('Bonzo Staff', () => {
  it('fires a balloon with a 1.1 second fuse and lets it bounce off a solid wall', () => {
    const { simulation, owner } = fixture([floor, wall]);
    equip(owner, 'bonzo_staff');
    simulation.action(owner.id, { type: 'gadget' });
    expect(owner.gadgetCharges).toBe(2);
    expect(simulation.grenades).toHaveLength(1);
    const balloon = simulation.grenades[0];
    expect(balloon.kind).toBe('bonzo');
    expect(balloon.expires - simulation.time).toBeCloseTo(1.1);
    let bounced = false;
    for (let frame = 0; frame < 30; frame++) { simulation.tick(1 / 60); if (balloon.vz > 0) bounced = true; }
    expect(bounced).toBe(true);
    simulation.tick(0.61);
    expect(simulation.grenades).toHaveLength(0);
    expect(simulation.events.some(event => event.type === 'explode' && event.text === 'bonzo')).toBe(true);
  });

  it('deals 32 damage at the burst center and pushes the opponent upward', () => {
    const { simulation, owner, rival } = fixture();
    equip(owner, 'bonzo_staff');
    simulation.action(owner.id, { type: 'gadget' });
    const balloon = simulation.grenades[0];
    Object.assign(balloon, { x: rival.x, y: rival.y + 0.8, z: rival.z, vx: 0, vy: 0, vz: 0, expires: simulation.time });
    simulation.tick(0);
    expect(rival).toMatchObject({ hp: 100, shield: 18 });
    expect(simulation.events.find(event => event.type === 'push' && event.to === rival.id)?.end?.y).toBe(9);
  });

  it('damages its nearby owner while cover still protects a rival', () => {
    const { simulation, owner, rival } = fixture([floor, wall]);
    equip(owner, 'bonzo_staff');
    simulation.action(owner.id, { type: 'gadget' });
    Object.assign(rival, { z: -5 });
    Object.assign(simulation.grenades[0], { x: 0, y: 0.8, z: -1, vx: 0, vy: 0, vz: 0, expires: simulation.time });
    simulation.tick(0);
    expect(owner).toMatchObject({ hp: 100, shield: 23 });
    expect(simulation.events.find(event => event.type === 'hit' && event.to === owner.id)?.value).toBe(27);
    expect(simulation.events.some(event => event.type === 'push' && event.to === owner.id)).toBe(true);
    expect(rival).toMatchObject({ hp: 100, shield: 50 });
    expect(simulation.events.some(event => event.type === 'push' && event.to === rival.id)).toBe(false);
  });

  it('deals the same 32 damage to its owner and a rival at the exact burst center', () => {
    const { simulation, owner, rival } = fixture();
    Object.assign(rival, { x: owner.x, y: owner.y, z: owner.z });
    equip(owner, 'bonzo_staff');
    simulation.action(owner.id, { type: 'gadget' });
    Object.assign(simulation.grenades[0], { x: owner.x, y: owner.y + .8, z: owner.z, vx: 0, vy: 0, vz: 0, expires: simulation.time });
    simulation.tick(0);
    for (const player of [owner, rival]) {
      expect(player).toMatchObject({ hp: 100, shield: 18 });
      expect(simulation.events.find(event => event.type === 'hit' && event.to === player.id)?.value).toBe(32);
    }
  });

  it('can eliminate its injured owner without awarding a self-kill', () => {
    const { simulation, owner } = fixture();
    Object.assign(owner, { hp: 20, shield: 0 });
    equip(owner, 'bonzo_staff');
    simulation.action(owner.id, { type: 'gadget' });
    Object.assign(simulation.grenades[0], { x: owner.x, y: owner.y + .8, z: owner.z, vx: 0, vy: 0, vz: 0, expires: simulation.time });
    simulation.tick(0);
    expect(owner).toMatchObject({ hp: 0, deaths: 1, kills: 0 });
  });
});

describe('Gravity Orb and Healing Totem fields', () => {
  it('pulls nearby rivals toward a gravity field every 0.2 seconds and excludes its owner', () => {
    const { simulation, owner, rival } = fixture();
    equip(owner, 'gravity_orb');
    simulation.action(owner.id, { type: 'gadget' });
    const field = simulation.fields[0];
    expect(field).toMatchObject({ kind: 'gravity_orb', radius: 7 });
    expect(field.expires - simulation.time).toBe(5);
    Object.assign(owner, { x: field.x, y: field.y, z: field.z });
    Object.assign(rival, { x: field.x + 3, y: field.y, z: field.z });
    const outside = simulation.addPlayer('outside', 'Moss')!;
    Object.assign(outside, { x: field.x + 8, y: field.y, z: field.z, protectedUntil: 0 });
    simulation.tick(0.2);
    const pushes = () => simulation.events.filter(event => event.type === 'push');
    expect(pushes()).toHaveLength(1);
    expect(pushes()[0].to).toBe(rival.id);
    expect(pushes()[0].end!.x).toBeLessThan(0);
    simulation.tick(0.1);
    expect(pushes()).toHaveLength(1);
    simulation.tick(0.101);
    expect(pushes()).toHaveLength(2);
    expect(pushes().every(event => event.to === rival.id)).toBe(true);
    simulation.tick(5);
    expect(simulation.fields).toHaveLength(0);
    expect(pushes()).toHaveLength(2);
  });

  it('does not pull an opponent through solid cover', () => {
    const { simulation, owner, rival } = fixture();
    equip(owner, 'gravity_orb');
    simulation.action(owner.id, { type: 'gadget' });
    const field = simulation.fields[0];
    Object.assign(rival, { x: field.x + 3, y: field.y, z: field.z });
    simulation.arena.colliders.push({ minX: field.x + 1, maxX: field.x + 1.5, minY: field.y - 1, maxY: field.y + 5, minZ: field.z - 2, maxZ: field.z + 2 });
    simulation.tick(0.21);
    expect(simulation.events.some(event => event.type === 'push' && event.to === rival.id)).toBe(false);
  });

  it('heals its owner and a nearby rival at 12 HP per second, without reviving dead players', () => {
    const { simulation, owner, rival } = fixture();
    equip(owner, 'healing_totem');
    simulation.action(owner.id, { type: 'gadget' });
    const field = simulation.fields[0];
    expect(field).toMatchObject({ kind: 'healing_totem', radius: 6 });
    expect(field.expires - simulation.time).toBe(8);
    Object.assign(owner, { hp: 30, x: field.x, y: field.y, z: field.z });
    Object.assign(rival, { hp: 40, x: field.x + 2, y: field.y, z: field.z });
    const dead = simulation.addPlayer('dead', 'Moss')!;
    Object.assign(dead, { hp: 0, deadUntil: 99, x: field.x - 2, y: field.y, z: field.z });
    simulation.tick(1);
    expect(owner.hp).toBe(42);
    expect(rival.hp).toBe(52);
    expect(dead.hp).toBe(0);
    expect(owner.shield).toBe(50);
    owner.hp = 95;
    simulation.tick(1);
    expect(owner.hp).toBe(100);
    simulation.tick(6.01);
    expect(simulation.fields).toHaveLength(0);
    const health = rival.hp;
    simulation.tick(1);
    expect(rival.hp).toBe(health);
  });

  it('does not heal outside its radius or through a wall', () => {
    const { simulation, owner, rival } = fixture();
    equip(owner, 'healing_totem');
    simulation.action(owner.id, { type: 'gadget' });
    const field = simulation.fields[0];
    Object.assign(rival, { hp: 40, x: field.x + 3, y: field.y, z: field.z });
    simulation.arena.colliders.push({ minX: field.x + 1, maxX: field.x + 1.5, minY: -1, maxY: 5, minZ: -2, maxZ: 2 });
    simulation.tick(1);
    expect(rival.hp).toBe(40);
    Object.assign(rival, { x: field.x - 7 });
    simulation.tick(1);
    expect(rival.hp).toBe(40);
  });

  it('caps active fields and removes them on a round restart', () => {
    const { simulation, owner } = fixture();
    for (let i = 0; i < 20; i++) {
      equip(owner, 'healing_totem');
      simulation.action(owner.id, { type: 'gadget' });
    }
    expect(simulation.fields).toHaveLength(16);
    simulation.restart();
    expect(simulation.fields).toHaveLength(0);
    expect(simulation.snapshot().fields).toEqual([]);
  });
});

describe('Rocket Jump', () => {
  it('launches its owner upward at 16 and pushes nearby rivals away without self-damage', () => {
    const { simulation, owner, rival } = fixture();
    rival.z = -4;
    const outside = simulation.addPlayer('outside', 'Moss')!;
    Object.assign(outside, { x: 0, y: 0, z: -8, protectedUntil: 0 });
    equip(owner, 'rocket_boots');
    simulation.action(owner.id, { type: 'gadget' });
    const pushes = simulation.events.filter(event => event.type === 'push');
    expect(pushes.find(event => event.to === owner.id)!.end!.y).toBe(16);
    expect(pushes.find(event => event.to === rival.id)!.end!.z).toBeLessThan(0);
    expect(pushes.some(event => event.to === outside.id)).toBe(false);
    expect(owner).toMatchObject({ hp: 100, shield: 50, gadgetCharges: 1 });
    expect(rival).toMatchObject({ hp: 100, shield: 50 });
  });
});

describe('new match modifiers', () => {
  it('keeps every new modifier disabled by default and exposes host changes in snapshots', () => {
    const { simulation } = fixture();
    expect(simulation.modifiers).toEqual(DEFAULT_MODIFIERS);
    expect(simulation.modifiers).toMatchObject({ extraJumps: false, fastReload: false, knockback: false, vampiric: false, shieldRegen: false, partyLoot: false });
    simulation.setModifiers({ extraJumps: true, fastReload: true, knockback: true, vampiric: true, shieldRegen: true, partyLoot: true });
    expect(simulation.snapshot().modifiers).toMatchObject({ extraJumps: true, fastReload: true, knockback: true, vampiric: true, shieldRegen: true, partyLoot: true });
  });

  it.each(['rifle', 'shotgun', 'sniper'] as const)('fastReload refills %s after 35 percent of its normal reload duration', weapon => {
    const { simulation, owner } = fixture();
    simulation.setModifiers({ fastReload: true });
    owner.weapon = weapon;
    owner.ammo[weapon] = 0;
    simulation.action(owner.id, { type: 'reload' });
    const duration = WEAPONS[weapon].reload * 0.35;
    expect(owner.reloadDuration).toBeCloseTo(duration);
    expect(owner.reloadUntil - simulation.time).toBeCloseTo(duration);
    simulation.tick(duration - 0.001);
    expect(owner.ammo[weapon]).toBe(0);
    simulation.tick(0.002);
    expect(owner.ammo[weapon]).toBe(WEAPONS[weapon].mag);
    expect(owner.reloading).toBeNull();
  });

  it('knockback emits one impulse away from the attacker for a surviving damaged opponent', () => {
    const { simulation, owner, rival } = fixture();
    simulation.setModifiers({ knockback: true });
    simulation.damage(rival, 8, owner);
    const pushes = simulation.events.filter(event => event.type === 'push');
    expect(pushes).toHaveLength(1);
    expect(pushes[0].to).toBe(rival.id);
    expect(pushes[0].end!.z).toBeLessThan(0);
    expect(pushes[0].end!.y).toBeGreaterThan(0);
    expect(rival).toMatchObject({ hp: 100, shield: 42 });
  });

  it('vampiric heals 25 percent of actual damage and does not reward overkill', () => {
    const { simulation, owner, rival } = fixture();
    simulation.setModifiers({ vampiric: true });
    owner.hp = 50;
    Object.assign(rival, { hp: 20, shield: 0 });
    simulation.damage(rival, 999, owner);
    expect(owner.hp).toBe(55);
    expect(rival.hp).toBe(0);
  });

  it('vampiric includes absorbed shield damage, caps health, and cannot heal from protected targets', () => {
    const { simulation, owner, rival } = fixture();
    simulation.setModifiers({ vampiric: true });
    owner.hp = 50;
    simulation.damage(rival, 40, owner);
    expect(owner.hp).toBe(60);
    owner.hp = 98;
    simulation.damage(rival, 20, owner);
    expect(owner.hp).toBe(100);
    owner.hp = 50;
    rival.protectedUntil = 10;
    simulation.damage(rival, 40, owner);
    expect(owner.hp).toBe(50);
  });

  it('shield regeneration waits five seconds after damage, then restores eight per second', () => {
    const { simulation, owner, rival } = fixture();
    simulation.setModifiers({ shieldRegen: true });
    simulation.damage(rival, 30, owner);
    expect(rival.shield).toBe(20);
    simulation.tick(4.99);
    expect(rival.shield).toBe(20);
    simulation.tick(0.02);
    const afterThreshold = rival.shield;
    expect(afterThreshold).toBeGreaterThan(20);
    simulation.tick(1);
    expect(rival.shield).toBeCloseTo(afterThreshold + 8);
    simulation.damage(rival, 4, owner);
    const afterHit = rival.shield;
    expect(rival.lastHitAt).toBe(simulation.time);
    simulation.tick(4.99);
    expect(rival.shield).toBe(afterHit);
    simulation.tick(0.02);
    expect(rival.shield).toBeGreaterThan(afterHit);
    rival.shield = 99;
    simulation.tick(1);
    expect(rival.shield).toBe(100);
  });

  it('ordinary damage neither regenerates shields nor heals the attacker nor launches the victim', () => {
    const { simulation, owner, rival } = fixture();
    owner.hp = 50;
    simulation.damage(rival, 8, owner);
    simulation.tick(10);
    expect(owner.hp).toBe(50);
    expect(rival.shield).toBe(42);
    expect(simulation.events.some(event => event.type === 'push')).toBe(false);
  });

  it('partyLoot fills empty live slots while preserving a relic already carried', () => {
    const { simulation, owner, rival } = fixture();
    equip(rival, 'ice_wand', 1);
    simulation.setModifiers({ partyLoot: true });
    expect(owner.gadget).not.toBeNull();
    expect(isGadget(owner.gadget!)).toBe(true);
    expect(owner.gadgetCharges).toBe(GADGETS[owner.gadget!].charges * 2);
    expect(rival).toMatchObject({ gadget: 'ice_wand', gadgetCharges: 1 });
  });

  it('partyLoot gives double-charge relics on every spawn and ground pickup', () => {
    const { simulation, owner } = fixture();
    simulation.setModifiers({ partyLoot: true });
    simulation.spawn(owner);
    expect(isGadget(owner.gadget!)).toBe(true);
    expect(owner.gadgetCharges).toBe(GADGETS[owner.gadget!].charges * 2);
    collect(simulation, owner, 'bonzo_staff');
    expect(owner).toMatchObject({ gadget: 'bonzo_staff', gadgetCharges: 6 });
    simulation.setModifiers({ partyLoot: false });
    simulation.spawn(owner);
    expect(owner).toMatchObject({ gadget: null, gadgetCharges: 0 });
  });
});
