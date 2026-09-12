import { afterEach, describe, expect, it, vi } from 'vitest';
import { Simulation } from '../src/simulation';
import { GADGETS, GADGET_IDS } from '../src/gadgets';
import { TARGET_KILLS } from '../src/rules';
import type { Grenade, Player, Vec3 } from '../src/rules';
import type { Collider } from '../src/world-types';

const floor: Collider = { minX: -100, maxX: 100, minY: -2, maxY: 0, minZ: -100, maxZ: 100 };
const nukeDrop = { id: 'nuke-test', kind: 'nuke' as const, x: 0, y: 0, z: 0 };

function fixture(colliders: Collider[] = [floor]) {
  const simulation = new Simulation({ colliders, pickups: [], jumpPads: [], loot: [nukeDrop], spawns: [
    { x: -40, y: 0, z: -40, yaw: 0 }, { x: 40, y: 0, z: 40, yaw: 0 },
    { x: 40, y: 0, z: -40, yaw: 0 }, { x: -40, y: 0, z: 40, yaw: 0 },
  ] });
  const owner = simulation.addPlayer('owner', 'Juniper')!;
  const victim = simulation.addPlayer('victim', 'Cinder')!;
  Object.assign(owner, { x: 40, y: 0, z: 0, yaw: 0, pitch: 0, protectedUntil: 0 });
  Object.assign(victim, { x: 0, y: 0, z: 0, protectedUntil: 0 });
  return { simulation, owner, victim };
}

function extra(simulation: Simulation, id: string, position: Partial<Vec3> = {}) {
  const player = simulation.addPlayer(id, id)!;
  Object.assign(player, { x: 5, y: 0, z: 0, protectedUntil: 0 }, position);
  return player;
}

function collect(simulation: Simulation, player: Player) {
  Object.assign(player, { x: nukeDrop.x, y: nukeDrop.y, z: nukeDrop.z });
  simulation.action(player.id, { type: 'pickup' });
}

/** Scoring fixtures bypass only the acquisition gate, which is tested separately. */
function arm(simulation: Simulation, owner: Player): Grenade {
  simulation.nukeUnlocked = true;
  Object.assign(owner, { gadget: 'nuke', gadgetCharges: 1, gadgetUntil: 0 });
  simulation.action(owner.id, { type: 'gadget' });
  expect(simulation.grenades.at(-1)?.kind).toBe('nuke');
  return simulation.grenades.at(-1)!;
}

function detonate(simulation: Simulation, grenade: Grenade, position: Vec3 = { x: 0, y: 0, z: 0 }) {
  Object.assign(grenade, position, { vx: 0, vy: 0, vz: 0, expires: simulation.time });
  simulation.tick(0);
}

const nukeKills = (simulation: Simulation) => simulation.events.filter(e => e.type === 'kill' && e.text === 'nuke');
afterEach(() => vi.restoreAllMocks());

describe('nuke unlock and acquisition', () => {
  it('is locked by default, and nine kills cannot collect its ground drop', () => {
    const { simulation, owner } = fixture();
    expect(simulation.snapshot().nukeUnlocked).toBe(false);
    owner.kills = 9;
    simulation.tick(0);
    collect(simulation, owner);
    expect(simulation.nukeUnlocked).toBe(false);
    expect(owner).toMatchObject({ gadget: null, gadgetCharges: 0 });
    expect(simulation.loot[nukeDrop.id]).toBeUndefined();
  });

  it('the tenth credited kill immediately unlocks the drop for every player', () => {
    const { simulation, owner, victim } = fixture();
    const collector = extra(simulation, 'collector', { x: 45 });
    owner.kills = 9;
    simulation.damage(victim, 999, owner);
    expect(owner.kills).toBe(10);
    expect(simulation.snapshot().nukeUnlocked).toBe(true);
    collect(simulation, collector);
    expect(collector).toMatchObject({ kills: 0, gadget: 'nuke', gadgetCharges: 1 });
    expect(simulation.loot[nukeDrop.id]).toBeGreaterThan(simulation.time);
    expect(simulation.events.filter(e => e.type === 'announcement' && e.text === 'NUKE DROP UNLOCKED')).toHaveLength(1);
  });

  it('does not automatically grant the nuke or auto-pick it up when the unlock occurs', () => {
    const { simulation, owner } = fixture();
    Object.assign(owner, { x: 0, kills: 10 });
    simulation.tick(.01);
    expect(simulation.nukeUnlocked).toBe(true);
    expect(owner).toMatchObject({ gadget: null, gadgetCharges: 0 });
    expect(simulation.loot[nukeDrop.id]).toBeUndefined();
  });

  it('keeps the unlock through the qualifying player dying or disconnecting, and clears it on round restart', () => {
    const { simulation, owner, victim } = fixture();
    owner.kills = 10;
    simulation.tick(0);
    simulation.damage(owner, 999, victim);
    expect(simulation.nukeUnlocked).toBe(true);
    simulation.removePlayer(owner.id);
    expect(simulation.nukeUnlocked).toBe(true);
    simulation.tick(.01);
    expect(simulation.nukeUnlocked).toBe(true);
    simulation.restart();
    expect(simulation.snapshot()).toMatchObject({ nukeUnlocked: false, round: 2, grenades: [], winner: null });
    collect(simulation, victim);
    expect(victim.gadget).toBeNull();
  });

  it('keeps nuke charges at one even when party loot doubles ordinary relics', () => {
    const { simulation, owner } = fixture();
    simulation.setModifiers({ partyLoot: true });
    owner.kills = 10;
    simulation.tick(0);
    collect(simulation, owner);
    expect(owner).toMatchObject({ gadget: 'nuke', gadgetCharges: 1 });
    expect(GADGETS.nuke.charges).toBe(1);
  });

  it.each([false, true])('never gives a nuke as a party-loot enable or respawn gift, across every random selection bin (unlocked: %s)', unlocked => {
    const { simulation, owner } = fixture();
    const random = vi.spyOn(Math, 'random');
    const seen = new Set<string>();
    simulation.nukeUnlocked = unlocked;
    for (let bin = 0; bin < GADGET_IDS.length * 4; bin++) {
      random.mockReturnValue((bin + .5) / (GADGET_IDS.length * 4));
      simulation.setModifiers({ partyLoot: false });
      Object.assign(owner, { gadget: null, gadgetCharges: 0 });
      simulation.setModifiers({ partyLoot: true });
      expect(owner.gadget).not.toBe('nuke');
      seen.add(owner.gadget!);
      simulation.spawn(owner);
      expect(owner.gadget).not.toBe('nuke');
      expect(owner.gadgetCharges).toBe(GADGETS[owner.gadget!].charges * 2);
    }
    expect([...seen].sort()).toEqual(GADGET_IDS.filter(id => id !== 'nuke').sort());
  });

  it('rejects activation of a forged nuke inventory while the round gate is locked', () => {
    const { simulation, owner } = fixture();
    Object.assign(owner, { gadget: 'nuke', gadgetCharges: 1 });
    simulation.action(owner.id, { type: 'gadget' });
    expect(owner).toMatchObject({ gadget: 'nuke', gadgetCharges: 1 });
    expect(simulation.grenades).toEqual([]);
  });
});

describe('nuke detonation', () => {
  it('uses a three-second fuse, consumes the only charge, and emits one radius-26 explosion', () => {
    const { simulation, owner } = fixture();
    const grenade = arm(simulation, owner);
    expect(grenade).toMatchObject({ kind: 'nuke', owner: owner.id });
    expect(grenade.expires - simulation.time).toBe(3);
    expect(owner).toMatchObject({ gadget: null, gadgetCharges: 0 });
    simulation.action(owner.id, { type: 'gadget' });
    expect(simulation.grenades).toHaveLength(1);
    simulation.tick(2.999);
    expect(simulation.grenades).toHaveLength(1);
    simulation.tick(.002);
    expect(simulation.grenades).toEqual([]);
    expect(simulation.events.filter(e => e.type === 'explode')).toMatchObject([{ text: 'nuke', value: 26 }]);
  });

  it('kills all unprotected players including its owner, with an inclusive radius of 26m', () => {
    const { simulation, owner, victim } = fixture();
    owner.x = -2;
    victim.shield = 100;
    const edge = extra(simulation, 'edge', { x: 26 });
    const outside = extra(simulation, 'outside', { x: 26.001 });
    detonate(simulation, arm(simulation, owner));
    for (const player of [owner, victim, edge]) expect(player).toMatchObject({ hp: 0, shield: 0, deaths: 1 });
    expect(outside).toMatchObject({ hp: 100, shield: 50, deaths: 0 });
    expect(owner.kills).toBe(0);
  });

  it('ignores solid cover while preserving spawn protection', () => {
    const wall: Collider = { minX: -4, maxX: 4, minY: 0, maxY: 8, minZ: -4, maxZ: -3 };
    const { simulation, owner, victim } = fixture([floor, wall]);
    victim.z = -8;
    const protectedPlayer = extra(simulation, 'protected', { x: 1 });
    protectedPlayer.protectedUntil = 10;
    detonate(simulation, arm(simulation, owner));
    expect(victim).toMatchObject({ hp: 0, deaths: 1 });
    expect(protectedPlayer).toMatchObject({ hp: 100, shield: 50, deaths: 0 });
    expect(nukeKills(simulation).some(event => event.to === protectedPlayer.id)).toBe(false);
  });

  it('remains lethal when the owner is a training bot', () => {
    const { simulation, owner, victim } = fixture();
    owner.bot = true;
    detonate(simulation, arm(simulation, owner));
    expect(victim).toMatchObject({ hp: 0, shield: 0 });
  });

  it('does not count its owner as a kill or grant self-elimination mana', () => {
    const { simulation, owner, victim } = fixture();
    Object.assign(owner, { x: 0, hp: 60, mana: 7 });
    victim.x = 40;
    detonate(simulation, arm(simulation, owner));
    expect(owner).toMatchObject({ hp: 0, deaths: 1, kills: 0, mana: 7 });
    expect(nukeKills(simulation)).toMatchObject([{ to: owner.id, from: undefined }]);
  });
});

describe('nuke damage-tag eligibility', () => {
  it.each([{ elapsed: 14.999, credit: true }, { elapsed: 15, credit: true }, { elapsed: 15.001, credit: false }])('uses the inclusive 15-second window at $elapsed seconds', ({ elapsed, credit }) => {
    const { simulation, owner, victim } = fixture();
    simulation.damage(victim, 8, owner);
    simulation.tick(elapsed);
    owner.mana = 0;
    detonate(simulation, arm(simulation, owner));
    expect(victim.hp).toBe(0);
    expect(owner.kills).toBe(credit ? 1 : 0);
    expect(owner.mana).toBe(credit ? 20 : 0);
    expect(nukeKills(simulation)[0].from).toBe(credit ? owner.id : undefined);
  });

  it('refreshes the owner’s eligibility with a new real hit after an old hit expires', () => {
    const { simulation, owner, victim } = fixture();
    simulation.damage(victim, 1, owner);
    simulation.tick(16);
    simulation.damage(victim, 1, owner);
    detonate(simulation, arm(simulation, owner));
    expect(owner.kills).toBe(1);
  });

  it('checks tag age at explosion time when a valid tag expires during the fuse', () => {
    const { simulation, owner, victim } = fixture();
    simulation.damage(victim, 8, owner);
    simulation.tick(12.001);
    const grenade = arm(simulation, owner);
    simulation.tick(2.99);
    Object.assign(grenade, { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
    simulation.tick(.011);
    expect(simulation.time).toBeGreaterThan(15);
    expect(victim.hp).toBe(0);
    expect(owner.kills).toBe(0);
    expect(nukeKills(simulation)[0].from).toBeUndefined();
  });

  it.each(['zero damage', 'spawn-protected hit'] as const)('does not qualify an owner from a %s', reason => {
    const { simulation, owner, victim } = fixture();
    if (reason === 'spawn-protected hit') victim.protectedUntil = 2;
    simulation.damage(victim, reason === 'zero damage' ? 0 : 8, owner);
    victim.protectedUntil = 0;
    detonate(simulation, arm(simulation, owner));
    expect(owner.kills).toBe(0);
  });

  it('gives no score, mana, or vampiric healing for unqualified victims', () => {
    const { simulation, owner, victim } = fixture();
    simulation.setModifiers({ vampiric: true });
    Object.assign(owner, { hp: 45, mana: 7 });
    detonate(simulation, arm(simulation, owner));
    expect(owner).toMatchObject({ hp: 45, mana: 7, kills: 0 });
    expect(victim.hp).toBe(0);
    expect(nukeKills(simulation)[0].from).toBeUndefined();
  });

  it('does not transfer nuke credit to a different player who tagged the victim', () => {
    const { simulation, owner, victim } = fixture();
    const other = extra(simulation, 'other', { x: -40 });
    simulation.damage(victim, 8, other);
    detonate(simulation, arm(simulation, owner));
    expect(owner.kills).toBe(0);
    expect(other.kills).toBe(0);
    expect(nukeKills(simulation)[0].from).toBeUndefined();
  });

  it('still credits the owner’s own tag when another attacker damages the same victim later', () => {
    const { simulation, owner, victim } = fixture();
    const other = extra(simulation, 'other', { x: -40 });
    simulation.damage(victim, 8, owner);
    simulation.tick(.1);
    simulation.damage(victim, 8, other);
    detonate(simulation, arm(simulation, owner));
    expect(owner.kills).toBe(1);
    expect(other.kills).toBe(0);
  });

  it.each([false, true])('clears an attacker’s tags when they die before detonation (respawn: %s)', respawn => {
    const { simulation, owner, victim } = fixture();
    simulation.damage(victim, 8, owner);
    const grenade = arm(simulation, owner);
    const life = owner.life;
    simulation.damage(owner, 999);
    if (respawn) {
      simulation.spawn(owner);
      Object.assign(owner, { x: 40, y: 0, z: 0, protectedUntil: 0 });
      expect(owner.life).toBe(life + 1);
    }
    detonate(simulation, grenade);
    expect(victim.hp).toBe(0);
    expect(owner.kills).toBe(0);
  });

  it('clears a victim’s old-life tags when they die and respawn before the blast', () => {
    const { simulation, owner, victim } = fixture();
    simulation.damage(victim, 8, owner);
    const grenade = arm(simulation, owner);
    const life = victim.life;
    simulation.damage(victim, 999);
    simulation.spawn(victim);
    Object.assign(victim, { x: 0, y: 0, z: 0, protectedUntil: 0 });
    expect(victim.life).toBe(life + 1);
    detonate(simulation, grenade);
    expect(victim.deaths).toBe(2);
    expect(owner.kills).toBe(0);
  });

  it.each(['owner', 'victim'] as const)('clears tags when the %s disconnects and reconnects under the same ID', who => {
    const { simulation, owner, victim } = fixture();
    simulation.damage(victim, 8, owner);
    const grenade = arm(simulation, owner);
    const removed = who === 'owner' ? owner : victim;
    simulation.removePlayer(removed.id);
    const replacement = simulation.addPlayer(removed.id, removed.name)!;
    Object.assign(replacement, { x: who === 'owner' ? 40 : 0, y: 0, z: 0, protectedUntil: 0 });
    detonate(simulation, grenade);
    expect((who === 'owner' ? replacement : owner).kills).toBe(0);
    expect(nukeKills(simulation)[0].from).toBeUndefined();
  });

  it('still detonates without a connected owner and grants no disconnected-player credit', () => {
    const { simulation, owner, victim } = fixture();
    simulation.damage(victim, 8, owner);
    const grenade = arm(simulation, owner);
    simulation.removePlayer(owner.id);
    detonate(simulation, grenade);
    expect(victim.hp).toBe(0);
    expect(owner.kills).toBe(0);
    expect(nukeKills(simulation)[0].from).toBeUndefined();
  });

  it.each(['owner', 'victim'] as const)('keeps eligibility when the %s uses AOTE without dying', who => {
    const { simulation, owner, victim } = fixture();
    simulation.damage(victim, 8, owner);
    const grenade = arm(simulation, owner);
    const blinker = who === 'owner' ? owner : victim;
    const before = { life: blinker.life, warp: blinker.warp };
    Object.assign(blinker, { weapon: 'aote', aoteOwned: true, yaw: 0, pitch: 0 });
    simulation.action(blinker.id, { type: 'ability' });
    expect(blinker.life).toBe(before.life);
    expect(blinker.warp).toBe(before.warp + 1);
    detonate(simulation, grenade);
    expect(owner.kills).toBe(1);
  });

  it('keeps both life tags across a Swap Pearl warp', () => {
    const { simulation, owner, victim } = fixture();
    Object.assign(owner, { x: 0, z: 8 });
    simulation.damage(victim, 8, owner);
    const grenade = arm(simulation, owner);
    const lives = [owner.life, victim.life], warps = [owner.warp, victim.warp];
    Object.assign(owner, { gadget: 'swap_pearl', gadgetCharges: 1, gadgetUntil: 0 });
    simulation.action(owner.id, { type: 'gadget' });
    expect([owner.life, victim.life]).toEqual(lives);
    expect([owner.warp, victim.warp]).toEqual(warps.map(warp => warp + 1));
    detonate(simulation, grenade);
    expect(owner).toMatchObject({ hp: 0, kills: 1 });
    expect(victim.hp).toBe(0);
  });

  it('snapshots eligibility before simultaneous deaths clear the owner’s tags', () => {
    const { simulation, owner, victim } = fixture();
    owner.x = -2;
    const second = extra(simulation, 'second');
    simulation.damage(victim, 8, owner);
    simulation.damage(second, 8, owner);
    detonate(simulation, arm(simulation, owner));
    expect(owner).toMatchObject({ hp: 0, deaths: 1, kills: 2 });
    expect(nukeKills(simulation).filter(event => event.from === owner.id).map(event => event.to).sort()).toEqual([victim.id, second.id].sort());
  });

  it('never uses its own nonlethal blast damage as a tag for a subsequent blast', () => {
    const { simulation, owner, victim } = fixture();
    // An over-health target makes this invariant observable without death clearing the history.
    Object.assign(victim, { hp: 1200, shield: 0 });
    detonate(simulation, arm(simulation, owner));
    expect(victim.hp).toBe(201);
    detonate(simulation, arm(simulation, owner));
    expect(victim.hp).toBe(0);
    expect(owner.kills).toBe(0);
    expect(nukeKills(simulation)[0].from).toBeUndefined();
  });
});

describe('nuke victory and fractional damage', () => {
  it('cannot win a round by eliminating unqualified victims while sitting at 19 kills', () => {
    const { simulation, owner, victim } = fixture();
    owner.kills = TARGET_KILLS - 1;
    const second = extra(simulation, 'second');
    detonate(simulation, arm(simulation, owner));
    expect(victim.hp).toBe(0);
    expect(second.hp).toBe(0);
    expect(owner.kills).toBe(19);
    expect(simulation.winner).toBeNull();
    expect(simulation.events.some(event => event.type === 'end')).toBe(false);
  });

  it('can reach 20 from a qualified victim and processes every simultaneous victim before announcing victory', () => {
    const { simulation, owner, victim } = fixture();
    Object.assign(owner, { x: -2, kills: TARGET_KILLS - 1 });
    const second = extra(simulation, 'second');
    const unqualified = extra(simulation, 'unqualified', { x: 8 });
    simulation.damage(victim, 8, owner);
    simulation.damage(second, 8, owner);
    detonate(simulation, arm(simulation, owner));
    expect([owner.hp, victim.hp, second.hp, unqualified.hp]).toEqual([0, 0, 0, 0]);
    expect(owner.kills).toBe(21);
    expect(simulation.winner).toBe(owner.id);
    expect(nukeKills(simulation)).toHaveLength(4);
    const end = simulation.events.filter(event => event.type === 'end');
    expect(end).toHaveLength(1);
    expect(end[0].from).toBe(owner.id);
    expect(simulation.events.at(-1)?.type).toBe('end');
  });

  it.each([{ hp: 99.4, shield: 33.7 }, { hp: 23.25, shield: 4.4 }, { hp: .6, shield: 0 }])('emits integer hit values when health is $hp and shield is $shield', ({ hp, shield }) => {
    const { simulation, owner, victim } = fixture();
    Object.assign(victim, { hp, shield });
    detonate(simulation, arm(simulation, owner));
    const hit = simulation.events.find(event => event.type === 'hit' && event.to === victim.id)!;
    expect(Number.isInteger(hit.value)).toBe(true);
    expect(hit.value).toBeGreaterThanOrEqual(0);
    expect(hit.value).toBeLessThanOrEqual(Math.ceil(hp + shield));
    expect(victim).toMatchObject({ hp: 0, shield: 0, deaths: 1 });
  });
});
