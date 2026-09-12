import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { MAX_PLAYERS, TARGET_KILLS, WEAPONS } from '../src/rules';
import { GROUND_LOOT, LOOT_LABELS } from '../src/loot-rules';
import { DEFAULT_MODIFIERS } from '../src/modifiers';
import type { Movement, Player } from '../src/rules';
import type { ArenaAsset, Collider } from '../src/world-types';

const floor: Collider = { minX: -100, maxX: 100, minY: -2, maxY: 0, minZ: -100, maxZ: 100 };
const wall: Collider = { minX: -3, maxX: 3, minY: 0, maxY: 5, minZ: -6, maxZ: -5 };
const fixture = (colliders: Collider[] = [floor]): Pick<ArenaAsset, 'colliders' | 'spawns' | 'pickups' | 'jumpPads'> => ({
  colliders,
  spawns: [{ x: -30, y: 0, z: -30, yaw: 0 }, { x: 30, y: 0, z: 30, yaw: Math.PI }, { x: 30, y: 0, z: -30, yaw: 0 }, { x: -30, y: 0, z: 30, yaw: Math.PI }],
  pickups: [],
  jumpPads: [],
});

function duel(colliders: Collider[] = [floor]) {
  const simulation = new Simulation(fixture(colliders));
  const shooter = simulation.addPlayer('shooter', 'Juniper')!;
  const target = simulation.addPlayer('target', 'Cinder')!;
  Object.assign(shooter, { x: 0, y: 0, z: 0, yaw: -WEAPONS.rifle.spread, pitch: 0, protectedUntil: 0 });
  Object.assign(target, { x: 0, y: 0, z: -10, protectedUntil: 0 });
  return { simulation, shooter, target };
}

describe('host-owned shooting and damage', () => {
  it('stops a shot at solid cover before reaching a player behind it', () => {
    const { simulation, shooter, target } = duel([floor, wall]);
    simulation.action(shooter.id, { type: 'fire' });
    expect(target.shield).toBe(50);
    expect(target.hp).toBe(100);
    expect(simulation.events.some(e => e.type === 'hit')).toBe(false);
    expect(simulation.events.find(e => e.type === 'shot')!.end!.z).toBeCloseTo(-5);
    expect(shooter.ammo.rifle).toBe(29);
  });

  it.each([50, 100])('requires two 100-damage AR headshots against full health and %i shield', shield => {
    const { simulation, shooter, target } = duel();
    target.shield = shield;
    simulation.action(shooter.id, { type: 'fire' });
    expect(target.shield).toBe(0);
    expect(target.hp).toBe(shield);
    expect(target.deaths).toBe(0);
    expect(shooter.kills).toBe(0);
    expect(simulation.events.find(e => e.type === 'hit')).toMatchObject({ value: 100, headshot: true });

    simulation.tick(WEAPONS.rifle.interval + 0.001);
    simulation.action(shooter.id, { type: 'fire' });
    expect(target).toMatchObject({ hp: 0, shield: 0, deaths: 1 });
    expect(shooter.kills).toBe(1);
    expect(simulation.events.filter(e => e.type === 'hit')).toHaveLength(2);
  });

  it('allows one AR headshot to eliminate an already injured target', () => {
    const { simulation, shooter, target } = duel();
    Object.assign(target, { hp: 60, shield: 20 });
    simulation.action(shooter.id, { type: 'fire' });
    expect(target).toMatchObject({ hp: 0, shield: 0, deaths: 1 });
    expect(shooter.kills).toBe(1);
    expect(simulation.events.find(e => e.type === 'hit')).toMatchObject({ value: 80, headshot: true });
  });

  it('deals eight damage on an AR chest hit without applying the headshot rule', () => {
    const { simulation, shooter, target } = duel();
    shooter.pitch = Math.atan2(0.98 - 1.55, 10);
    simulation.action(shooter.id, { type: 'fire' });
    expect(target).toMatchObject({ shield: 42, hp: 100, deaths: 0 });
    expect(simulation.events.find(e => e.type === 'hit')).toMatchObject({ value: 8, headshot: false });
  });

  it('deals four damage per shotgun body pellet for 32 damage when all eight connect', () => {
    const { simulation, shooter, target } = duel();
    Object.assign(shooter, { weapon: 'shotgun', yaw: 0, pitch: Math.atan2(0.98 - 1.55, 3) });
    Object.assign(target, { z: -3, shield: 100 });
    simulation.action(shooter.id, { type: 'fire' });
    const hits = simulation.events.filter(e => e.type === 'hit');
    expect(hits).toHaveLength(8);
    for (const hit of hits) expect(hit).toMatchObject({ value: 4, headshot: false });
    expect(target).toMatchObject({ hp: 100, shield: 68, deaths: 0 });
  });

  it.each([50, 100].flatMap(shield => [
    { shield, hitbox: 'head', height: 1.55, headshot: true },
    { shield, hitbox: 'chest', height: 0.98, headshot: false },
    { shield, hitbox: 'legs', height: 0.4, headshot: false },
  ]))('instantly eliminates with a sniper $hitbox hit through $shield shield and full health', ({ shield, height, headshot }) => {
    const { simulation, shooter, target } = duel();
    Object.assign(shooter, { weapon: 'sniper', yaw: -WEAPONS.sniper.spread, pitch: Math.atan2(height - 1.55, 10) });
    target.shield = shield;
    simulation.action(shooter.id, { type: 'fire' });
    expect(target).toMatchObject({ hp: 0, shield: 0, deaths: 1 });
    expect(shooter.kills).toBe(1);
    expect(shooter.ammo.sniper).toBe(WEAPONS.sniper.mag - 1);
    const hit = simulation.events.find(e => e.type === 'hit');
    expect(hit).toMatchObject({ headshot });
    expect(hit!.value).toBeGreaterThanOrEqual(100 + shield);
    expect(simulation.events.filter(e => e.type === 'kill')).toHaveLength(1);
  });

  it.each([50, 100])('instantly eliminates with a shotgun headshot through %i shield and full health', shield => {
    const { simulation, shooter, target } = duel();
    Object.assign(shooter, { weapon: 'shotgun', yaw: 0, pitch: 0 });
    target.shield = shield;
    simulation.action(shooter.id, { type: 'fire' });
    expect(target).toMatchObject({ hp: 0, shield: 0, deaths: 1 });
    expect(shooter.kills).toBe(1);
    expect(simulation.events.find(e => e.type === 'hit')).toMatchObject({ headshot: true });
    expect(simulation.events.filter(e => e.type === 'kill')).toHaveLength(1);
  });

  it('still blocks an instant-elimination sniper shot at solid cover', () => {
    const { simulation, shooter, target } = duel([floor, wall]);
    Object.assign(shooter, { weapon: 'sniper', yaw: -WEAPONS.sniper.spread, pitch: 0 });
    target.shield = 100;
    simulation.action(shooter.id, { type: 'fire' });
    expect(target).toMatchObject({ hp: 100, shield: 100, deaths: 0 });
    expect(simulation.events.some(e => e.type === 'hit')).toBe(false);
    expect(simulation.events.find(e => e.type === 'shot')!.end!.z).toBeCloseTo(-5);
  });

  it('preserves spawn protection against an instant-elimination sniper shot', () => {
    const { simulation, shooter, target } = duel();
    Object.assign(shooter, { weapon: 'sniper', yaw: -WEAPONS.sniper.spread, pitch: 0 });
    target.protectedUntil = 2.5;
    simulation.action(shooter.id, { type: 'fire' });
    expect(target).toMatchObject({ hp: 100, shield: 50, deaths: 0 });
    expect(shooter.kills).toBe(0);
  });

  it('absorbs damage into shields before health and never allows negative health', () => {
    const { simulation, shooter, target } = duel();
    simulation.damage(target, 35, shooter);
    expect(target).toMatchObject({ shield: 15, hp: 100 });
    simulation.damage(target, 40, shooter);
    expect(target).toMatchObject({ shield: 0, hp: 75 });
    simulation.damage(target, 999, shooter);
    expect(target.hp).toBe(0);
    expect(target.deaths).toBe(1);
    expect(shooter.kills).toBe(1);
  });

  it('honors spawn protection and ends the shooter’s protection when firing', () => {
    const { simulation, shooter, target } = duel();
    shooter.protectedUntil = 2.5;
    target.protectedUntil = 2.5;
    simulation.action(shooter.id, { type: 'fire' });
    expect(shooter.protectedUntil).toBe(0);
    expect(target.shield).toBe(50);
    simulation.tick(2.51);
    simulation.action(shooter.id, { type: 'fire' });
    expect(target).toMatchObject({ shield: 0, hp: 50 });
  });

  it('enforces fire rate and only damages the nearest player on a ray', () => {
    const { simulation, shooter, target } = duel();
    const farther = simulation.addPlayer('farther', 'Moss')!;
    Object.assign(farther, { x: 0, y: 0, z: -15, protectedUntil: 0 });
    simulation.action(shooter.id, { type: 'fire' });
    simulation.action(shooter.id, { type: 'fire' });
    expect(shooter.ammo.rifle).toBe(29);
    expect(target).toMatchObject({ shield: 0, hp: 50 });
    expect(farther.shield).toBe(50);
    simulation.tick(WEAPONS.rifle.interval + 0.001);
    simulation.action(shooter.id, { type: 'fire' });
    expect(shooter.ammo.rifle).toBe(28);
  });

  it('also prevents sword swings through cover', () => {
    const swordWall = { ...wall, minZ: -1.7, maxZ: -1.5 };
    const { simulation, shooter, target } = duel([floor, swordWall]);
    Object.assign(shooter, { weapon: 'aotd', aoteOwned: true, yaw: 0, aotdCharges: 1 });
    target.z = -3;
    simulation.action(shooter.id, { type: 'fire' });
    expect(target.shield).toBe(50);
    expect(simulation.events.some(e => e.type === 'hit')).toBe(false);
    expect(shooter).toMatchObject({ aotdCharges: 0, weapon: 'aote' });
  });

  it.each(['aote', 'aotd'] as const)('instantly eliminates a fully shielded target when %s is aimed at its head', weapon => {
    const { simulation, shooter, target } = duel();
    Object.assign(shooter, { weapon, aoteOwned: weapon === 'aote', yaw: 0, pitch: 0, aotdCharges: weapon === 'aotd' ? 1 : 0 });
    Object.assign(target, { z: -3, shield: 100 });
    simulation.action(shooter.id, { type: 'fire' });
    expect(target).toMatchObject({ hp: 0, shield: 0, deaths: 1 });
    expect(shooter.kills).toBe(1);
    expect(simulation.events.find(e => e.type === 'hit')).toMatchObject({ headshot: true });
  });

  it('deals 15 damage when AOTE is aimed at the chest', () => {
    const { simulation, shooter, target } = duel();
    Object.assign(shooter, { weapon: 'aote', aoteOwned: true, yaw: 0, pitch: Math.atan2(0.98 - 1.55, 3) });
    Object.assign(target, { z: -3, shield: 100 });
    simulation.action(shooter.id, { type: 'fire' });
    expect(target).toMatchObject({ hp: 100, shield: 85, deaths: 0 });
    expect(simulation.events.find(e => e.type === 'hit')).toMatchObject({ value: 15, headshot: false });
  });

  it('limits a grenade explosion at point blank range to 40 damage', () => {
    const { simulation, shooter, target } = duel();
    shooter.x = 20;
    Object.assign(target, { x: 0, y: 0, z: 0, shield: 100 });
    simulation.grenades.push({ id: 1, owner: shooter.id, x: 0, y: 0.8, z: 0, vx: 0, vy: 0, vz: 0, expires: 0 });
    simulation.tick(0);
    expect(target).toMatchObject({ hp: 100, shield: 60, deaths: 0 });
    expect(simulation.events.find(e => e.type === 'hit' && e.to === target.id)).toMatchObject({ value: 40 });
  });
});

describe('drop-only AOTE ownership', () => {
  it('starts with AOTE unowned in host state and snapshots', () => {
    const { simulation, shooter } = duel();
    expect(shooter).toMatchObject({ aoteOwned: false, weapon: 'rifle' });
    expect(simulation.snapshot().players.find(p => p.id === shooter.id)).toMatchObject({ aoteOwned: false });
  });

  it('rejects equipping AOTE or forging ownership in a movement packet', () => {
    const { simulation, shooter } = duel();
    simulation.movement(shooter.id, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, weapon: 'aote', grounded: true,
      warp: shooter.warp, aoteOwned: true } as Movement);
    expect(shooter).toMatchObject({ weapon: 'rifle', aoteOwned: false });
  });

  it.each(['fire', 'ability'] as const)('rejects an unowned AOTE %s without spending mana or changing position', action => {
    const { simulation, shooter, target } = duel();
    Object.assign(shooter, { weapon: 'aote', aoteOwned: false, yaw: 0, pitch: 0 });
    target.z = -3;
    const before = { x: shooter.x, y: shooter.y, z: shooter.z, mana: shooter.mana, warp: shooter.warp, nextFire: shooter.nextFire, abilityUntil: shooter.abilityUntil };
    simulation.action(shooter.id, { type: action });
    expect(shooter).toMatchObject(before);
    expect(target).toMatchObject({ hp: 100, shield: 50 });
    expect(simulation.events).toEqual([]);
  });

  it('keeps a collected AOTE across weapon switches and removes ownership on the next life', () => {
    const { simulation, shooter, target } = duel();
    const drop = GROUND_LOOT.find(item => item.kind === 'aote')!;
    Object.assign(shooter, { x: drop.x, y: drop.y, z: drop.z });
    simulation.action(shooter.id, { type: 'pickup' });
    expect(shooter.aoteOwned).toBe(true);
    const movement = { x: shooter.x, y: shooter.y, z: shooter.z, yaw: 0, pitch: 0, grounded: true, warp: shooter.warp };
    simulation.movement(shooter.id, { ...movement, weapon: 'rifle' });
    simulation.movement(shooter.id, { ...movement, weapon: 'aote' });
    expect(shooter).toMatchObject({ aoteOwned: true, weapon: 'aote' });
    const life = shooter.life;
    simulation.damage(shooter, 999, target);
    simulation.tick(3.01);
    expect(shooter).toMatchObject({ life: life + 1, aoteOwned: false, weapon: 'rifle', hp: 100 });
  });

  it.each(['fire', 'ability'] as const)('returns a spent AOTD %s to rifle when AOTE was never collected', action => {
    const { simulation, shooter, target } = duel();
    Object.assign(shooter, { weapon: 'aotd', aotdCharges: 1, aoteOwned: false });
    target.x = 50;
    simulation.action(shooter.id, { type: action });
    expect(shooter).toMatchObject({ weapon: 'rifle', aotdCharges: 0, aoteOwned: false });
  });
});

describe('drop-only, single-use AOTD', () => {
  it('starts players without an AOTD charge or an equipped AOTD', () => {
    const { simulation, shooter } = duel();
    expect(shooter.aotdCharges).toBe(0);
    expect(shooter.weapon).not.toBe('aotd');
    expect(simulation.snapshot().players.find(p => p.id === shooter.id)!.aotdCharges).toBe(0);
  });

  it('resolves an attempted AOTD equip to an owned AOTE when no AOTD drop has been collected', () => {
    const { simulation, shooter } = duel();
    shooter.aoteOwned = true;
    simulation.movement(shooter.id, { x: shooter.x, y: shooter.y, z: shooter.z, yaw: 0, pitch: 0,
      weapon: 'aotd', grounded: true, warp: shooter.warp });
    expect(shooter).toMatchObject({ weapon: 'aote', aotdCharges: 0 });
  });

  it.each(['fire', 'ability'] as const)('rejects AOTD %s when there is no charge', action => {
    const { simulation, shooter, target } = duel();
    Object.assign(shooter, { weapon: 'aotd', aoteOwned: true, aotdCharges: 0, yaw: 0, pitch: 0 });
    target.z = -3;
    simulation.action(shooter.id, { type: action });
    expect(target).toMatchObject({ hp: 100, shield: 50, deaths: 0 });
    expect(shooter.aotdCharges).toBe(0);
    expect(simulation.events.some(e => e.type === 'blast' || (e.type === 'shot' && e.text === 'aotd'))).toBe(false);
  });

  it.each(['fire', 'ability'] as const)('collecting AOTD permits exactly one %s before reverting to owned AOTE attacks', action => {
    const { simulation, shooter, target } = duel();
    shooter.aoteOwned = true;
    const item = GROUND_LOOT.find(item => item.kind === 'aotd')!;
    Object.assign(shooter, { x: item.x, y: item.y, z: item.z, yaw: 0, pitch: 0 });
    simulation.action(shooter.id, { type: 'pickup' });
    expect(shooter).toMatchObject({ weapon: 'aotd', aotdCharges: 1 });
    expect(simulation.loot[item.id]).toBeGreaterThan(simulation.time);
    Object.assign(target, { x: item.x, y: item.y, z: item.z - 3, shield: 100 });
    shooter.pitch = Math.atan2(0.98 - 1.55, 3);
    shooter.mana = 0;
    simulation.action(shooter.id, { type: action });
    expect(target).toMatchObject({ hp: 0, shield: 0, deaths: 1 });
    expect(shooter).toMatchObject({ weapon: 'aote', aotdCharges: 0, kills: 1 });

    const survivor = simulation.addPlayer('survivor', 'Moss')!;
    Object.assign(survivor, { x: item.x, y: item.y, z: item.z - 3, shield: 100, protectedUntil: 0 });
    simulation.tick(WEAPONS.aotd.interval + 0.01);
    simulation.movement(shooter.id, { x: shooter.x, y: shooter.y, z: shooter.z, yaw: 0, pitch: Math.atan2(0.98 - 1.55, 3),
      weapon: 'aotd', grounded: true, warp: shooter.warp });
    expect(shooter).toMatchObject({ weapon: 'aote', aotdCharges: 0 });
    simulation.action(shooter.id, { type: 'fire' });
    expect(survivor).toMatchObject({ hp: 100, shield: 85, deaths: 0 });
    expect(shooter.kills).toBe(1);
    expect(simulation.events.filter(e => e.type === 'shot').at(-1)).toMatchObject({ text: 'aote' });
  });

  it.each(['fire', 'ability'] as const)('a missed AOTD %s still consumes the charge without costing mana', action => {
    const { simulation, shooter, target } = duel();
    Object.assign(shooter, { weapon: 'aotd', aoteOwned: true, aotdCharges: 1, yaw: 0, pitch: 0, mana: 0 });
    target.x = 50;
    simulation.action(shooter.id, { type: action });
    expect(shooter).toMatchObject({ weapon: 'aote', aotdCharges: 0, mana: 0, kills: 0 });
    expect(target).toMatchObject({ hp: 100, shield: 50, deaths: 0 });
    expect(simulation.events.some(e => e.type === (action === 'fire' ? 'shot' : 'blast'))).toBe(true);
  });

  it.each([{ height: 1.55, headshot: true }, { height: 0.98, headshot: false }])('a charged AOTD melee hit at height $height eliminates through full shields', ({ height, headshot }) => {
    const { simulation, shooter, target } = duel();
    Object.assign(shooter, { weapon: 'aotd', aoteOwned: true, aotdCharges: 1, yaw: 0, pitch: Math.atan2(height - 1.55, 3), mana: 0 });
    Object.assign(target, { z: -3, shield: 100 });
    simulation.action(shooter.id, { type: 'fire' });
    expect(target).toMatchObject({ hp: 0, shield: 0, deaths: 1 });
    expect(simulation.events.find(e => e.type === 'hit')).toMatchObject({ headshot, value: 200 });
    expect(shooter).toMatchObject({ weapon: 'aote', aotdCharges: 0 });
  });

  it('resets an unused AOTD charge on respawn', () => {
    const { simulation, shooter, target } = duel();
    Object.assign(shooter, { weapon: 'aotd', aoteOwned: true, aotdCharges: 1 });
    simulation.damage(shooter, 999, target);
    simulation.tick(3.01);
    expect(shooter).toMatchObject({ hp: 100, aotdCharges: 0 });
    expect(shooter.weapon).not.toBe('aotd');
    simulation.movement(shooter.id, { x: shooter.x, y: shooter.y, z: shooter.z, yaw: 0, pitch: 0,
      weapon: 'aotd', grounded: true, warp: shooter.warp });
    expect(shooter).toMatchObject({ weapon: 'rifle', aoteOwned: false });
  });
});

describe('training-bot damage reduction', () => {
  it.each([{ amount: 8, damage: 4 }, { amount: 14, damage: 7 }, { amount: 24, damage: 12 }, { amount: 100, damage: 12 }, { amount: 999, damage: 12 }])('reduces bot damage $amount to $damage before shields absorb it', ({ amount, damage }) => {
    const { simulation, shooter, target } = duel();
    shooter.bot = true;
    target.shield = 100;
    simulation.damage(target, amount, shooter);
    expect(target).toMatchObject({ hp: 100, shield: 100 - damage, deaths: 0 });
    expect(simulation.events.find(e => e.type === 'hit')).toMatchObject({ value: damage });
  });

  it('applies the bot damage cap before overflowing shields into health', () => {
    const { simulation, shooter, target } = duel();
    shooter.bot = true;
    target.shield = 5;
    simulation.damage(target, 100, shooter);
    expect(target).toMatchObject({ hp: 93, shield: 0, deaths: 0 });
  });

  it.each(['rifle', 'sniper'] as const)('prevents a bot %s headshot from instantly eliminating the player', weapon => {
    const { simulation, shooter, target } = duel();
    Object.assign(shooter, { bot: true, weapon, yaw: -WEAPONS[weapon].spread, pitch: 0 });
    target.shield = 100;
    simulation.action(shooter.id, { type: 'fire' });
    expect(target).toMatchObject({ hp: 100, shield: 88, deaths: 0 });
    expect(simulation.events.find(e => e.type === 'hit')).toMatchObject({ headshot: true, value: 12 });
  });

  it('lets the global oneTap modifier override reduced bot damage', () => {
    const { simulation, shooter, target } = duel();
    shooter.bot = true;
    target.shield = 100;
    simulation.setModifiers({ oneTap: true });
    simulation.damage(target, 8, shooter);
    expect(target).toMatchObject({ hp: 0, shield: 0, deaths: 1 });
    expect(shooter.kills).toBe(1);
  });
});

describe('reload, death, and match lifecycle', () => {
  it('blocks firing during reload and refills only after its full duration', () => {
    const { simulation, shooter } = duel();
    shooter.ammo.rifle = 3;
    simulation.action(shooter.id, { type: 'reload' });
    simulation.action(shooter.id, { type: 'fire' });
    expect(shooter.ammo.rifle).toBe(3);
    expect(shooter.reloading).toBe('rifle');
    simulation.tick(WEAPONS.rifle.reload - 0.01);
    expect(shooter.ammo.rifle).toBe(3);
    simulation.tick(0.011);
    expect(shooter.ammo.rifle).toBe(WEAPONS.rifle.mag);
    expect(shooter.reloading).toBeNull();
    simulation.action(shooter.id, { type: 'fire' });
    expect(shooter.ammo.rifle).toBe(WEAPONS.rifle.mag - 1);
  });

  it('starts a reload instead of creating a shot when the magazine is empty', () => {
    const { simulation, shooter } = duel();
    shooter.ammo.rifle = 0;
    simulation.action(shooter.id, { type: 'fire' });
    expect(shooter.reloading).toBe('rifle');
    expect(simulation.events.some(e => e.type === 'shot')).toBe(false);
  });

  it('respawns after three seconds with supplies restored and the score preserved', () => {
    const { simulation, shooter, target } = duel();
    const previousWarp = target.warp;
    target.kills = 4;
    target.ammo.rifle = 2;
    simulation.damage(target, 999, shooter);
    simulation.tick(2.99);
    expect(target.hp).toBe(0);
    simulation.tick(0.011);
    expect(target).toMatchObject({ hp: 100, shield: 50, mana: 100, kills: 4, deaths: 1 });
    expect(target.ammo.rifle).toBe(30);
    expect(target.warp).toBe(previousWarp + 1);
    expect(target.protectedUntil).toBeGreaterThan(simulation.time);
  });

  it('declares the first player to twenty and freezes subsequent combat and scoring', () => {
    const { simulation, shooter, target } = duel();
    const survivor = simulation.addPlayer('survivor', 'Moss')!;
    survivor.protectedUntil = 0;
    shooter.kills = TARGET_KILLS - 1;
    simulation.damage(target, 999, shooter);
    expect(simulation.winner).toBe(shooter.id);
    expect(shooter.kills).toBe(TARGET_KILLS);
    const eventCount = simulation.events.length;
    simulation.damage(survivor, 999, shooter);
    simulation.action(survivor.id, { type: 'fire' });
    simulation.tick(10);
    expect(shooter.kills).toBe(TARGET_KILLS);
    expect(survivor.hp).toBe(100);
    expect(target.hp).toBe(0);
    expect(simulation.events.length).toBe(eventCount);
    expect(simulation.events.filter(e => e.type === 'end')).toHaveLength(1);
  });

  it('restarts into a clean new round and restores all players', () => {
    const { simulation, shooter, target } = duel();
    shooter.kills = 19;
    simulation.damage(target, 999, shooter);
    simulation.restart();
    expect(simulation.winner).toBeNull();
    expect(simulation.round).toBe(2);
    expect(simulation.events).toHaveLength(0);
    for (const p of simulation.players.values()) expect(p).toMatchObject({ kills: 0, deaths: 0, hp: 100, shield: 50 });
  });
});

describe('mana abilities and pickups', () => {
  it('charges AOTE mana, teleports once, and respects both cooldown and insufficient mana', () => {
    const { simulation, shooter } = duel();
    Object.assign(shooter, { weapon: 'aote', aoteOwned: true, yaw: 0, mana: 60 });
    simulation.action(shooter.id, { type: 'ability' });
    expect(shooter.z).toBeCloseTo(-9);
    expect(shooter.mana).toBe(45);
    expect(shooter.abilityUntil - simulation.time).toBeCloseTo(0.22);
    const warp = shooter.warp;
    simulation.action(shooter.id, { type: 'ability' });
    expect(shooter.warp).toBe(warp);
    expect(shooter.mana).toBe(45);
    simulation.tick(0.221);
    shooter.mana = 14;
    simulation.action(shooter.id, { type: 'ability' });
    expect(shooter.warp).toBe(warp);
    shooter.mana = 15;
    simulation.action(shooter.id, { type: 'ability' });
    expect(shooter.warp).toBe(warp + 1);
    expect(shooter.mana).toBe(0);
  });

  it('AOTE stops before cover rather than teleporting through a clear space beyond it', () => {
    const { simulation, shooter } = duel([floor, wall]);
    Object.assign(shooter, { weapon: 'aote', aoteOwned: true, yaw: 0 });
    simulation.action(shooter.id, { type: 'ability' });
    expect(shooter.z).toBeGreaterThan(-4.67);
    expect(shooter.z).toBeLessThan(-4);
    expect(shooter.mana).toBe(85);
  });

  it('rejects stale movement acknowledgements that would undo an AOTE teleport', () => {
    const { simulation, shooter } = duel();
    Object.assign(shooter, { weapon: 'aote', aoteOwned: true, yaw: 0 });
    const staleMovement: Movement = { x: shooter.x, y: shooter.y, z: shooter.z, yaw: shooter.yaw, pitch: shooter.pitch,
      weapon: shooter.weapon, grounded: true, warp: shooter.warp };
    simulation.action(shooter.id, { type: 'ability' });
    const teleported = { x: shooter.x, y: shooter.y, z: shooter.z, warp: shooter.warp };
    expect(teleported.z).toBeCloseTo(-9);
    expect(teleported.warp).toBe(staleMovement.warp! + 1);
    simulation.movement(shooter.id, staleMovement);
    expect(shooter).toMatchObject(teleported);
    expect(shooter.mana).toBe(85);
  });

  it('accepts new movement after the client acknowledges the AOTE teleport snapshot', () => {
    const { simulation, shooter } = duel();
    Object.assign(shooter, { weapon: 'aote', aoteOwned: true, yaw: 0 });
    simulation.action(shooter.id, { type: 'ability' });
    const acknowledged = simulation.snapshot().players.find(p => p.id === shooter.id)!;
    const movement: Movement = { x: acknowledged.x + 0.5, y: acknowledged.y, z: acknowledged.z - 0.5,
      yaw: 0.3, pitch: -0.1, weapon: 'aote', grounded: false, warp: acknowledged.warp };
    simulation.movement(shooter.id, movement);
    expect(shooter).toMatchObject(movement);
    expect(shooter.mana).toBe(85);
  });

  it('AOTD eliminates a forward target without mana and consumes its only charge', () => {
    const { simulation, shooter, target } = duel();
    Object.assign(shooter, { weapon: 'aotd', aoteOwned: true, yaw: 0, aotdCharges: 1, mana: 0 });
    target.shield = 100;
    const behind = simulation.addPlayer('behind', 'Moss')!;
    Object.assign(behind, { x: 0, y: 0, z: 8, protectedUntil: 0 });
    simulation.action(shooter.id, { type: 'ability' });
    expect(target).toMatchObject({ shield: 0, hp: 0, deaths: 1 });
    expect(behind.shield).toBe(50);
    expect(shooter).toMatchObject({ mana: 20, aotdCharges: 0, weapon: 'aote', kills: 1 });
    shooter.weapon = 'aotd';
    simulation.action(shooter.id, { type: 'ability' });
    expect(shooter.mana).toBe(20);
    expect(simulation.events.filter(e => e.type === 'blast')).toHaveLength(1);
  });

  it('AOTD cannot damage an enemy through a wall', () => {
    const { simulation, shooter, target } = duel([floor, wall]);
    Object.assign(shooter, { weapon: 'aotd', aoteOwned: true, yaw: 0, aotdCharges: 1 });
    simulation.action(shooter.id, { type: 'ability' });
    expect(target).toMatchObject({ hp: 100, shield: 50, z: -10 });
    expect(shooter).toMatchObject({ aotdCharges: 0, weapon: 'aote' });
  });

  it('healing is capped at full health and respects its cooldown', () => {
    const { simulation, shooter } = duel();
    Object.assign(shooter, { hp: 80, mana: 100 });
    simulation.action(shooter.id, { type: 'heal' });
    expect(shooter).toMatchObject({ hp: 100, mana: 80 });
    shooter.hp = 50;
    simulation.action(shooter.id, { type: 'heal' });
    expect(shooter).toMatchObject({ hp: 50, mana: 80 });
  });

  it('allows one shared pickup collection and restores it after its respawn timer', () => {
    const arena = fixture();
    arena.pickups.push({ id: 'med', kind: 'health', x: 0, y: 0.8, z: 0 });
    const simulation = new Simulation(arena);
    const p = simulation.addPlayer('player', 'Juniper')!;
    Object.assign(p, { x: 0, y: 0, z: 0, hp: 20 });
    simulation.tick(0.01);
    expect(p.hp).toBe(65);
    simulation.tick(0.1);
    expect(p.hp).toBe(65);
    simulation.tick(16);
    expect(p.hp).toBe(100);
    expect(simulation.events.filter(e => e.type === 'pickup')).toHaveLength(2);
  });
});

describe('match modifiers and ability defaults', () => {
  const defaults = { ...DEFAULT_MODIFIERS };
  const abilities = [
    { label: 'AOTE', action: 'ability', weapon: 'aote', field: 'abilityUntil', cooldown: 0.22, cost: 15 },
    { label: 'grapple', action: 'grapple', weapon: 'rifle', field: 'grappleUntil', cooldown: 1.5, cost: 10 },
    { label: 'heal', action: 'heal', weapon: 'rifle', field: 'healUntil', cooldown: 3, cost: 20 },
    { label: 'grenade', action: 'grenade', weapon: 'rifle', field: 'grenadeUntil', cooldown: 3.5, cost: 0 },
  ] as const;

  it('starts with normal movement and combat modifiers', () => {
    const { simulation } = duel();
    expect(simulation.modifiers).toEqual(defaults);
    expect(simulation.snapshot().modifiers).toEqual(defaults);
  });

  it('clamps numeric modifiers while preserving options omitted from a partial update', () => {
    const { simulation } = duel();
    simulation.setModifiers({ speed: 99, jump: 0.1, cooldownScale: 99, oneTap: true, lowGravity: true });
    expect(simulation.modifiers).toEqual({ ...defaults, speed: 3, jump: 0.5, cooldownScale: 2, oneTap: true, lowGravity: true });
    simulation.setModifiers({ speed: 0.1, jump: 99, cooldownScale: 0.01 });
    expect(simulation.modifiers).toEqual({ ...defaults, speed: 0.5, jump: 3, cooldownScale: 0.1, oneTap: true, lowGravity: true });
    simulation.setModifiers({ oneTap: false, lowGravity: false });
    expect(simulation.modifiers).toMatchObject({ oneTap: false, lowGravity: false, speed: 0.5, jump: 3 });
  });

  it('returns independent modifier snapshots that cannot change live rules', () => {
    const { simulation } = duel();
    simulation.setModifiers({ speed: 2, infiniteMana: true });
    const snapshot = simulation.snapshot();
    expect(snapshot.modifiers).toMatchObject({ speed: 2, infiniteMana: true });
    snapshot.modifiers!.speed = 0.5;
    snapshot.modifiers!.infiniteMana = false;
    expect(simulation.modifiers).toMatchObject({ speed: 2, infiniteMana: true });
  });

  it('oneTap turns a single point of damage into an elimination through maximum shields', () => {
    const { simulation, shooter, target } = duel();
    simulation.setModifiers({ oneTap: true });
    target.shield = 100;
    simulation.damage(target, 1, shooter);
    expect(target).toMatchObject({ hp: 0, shield: 0, deaths: 1 });
    expect(shooter.kills).toBe(1);
  });

  it('oneTap does not eliminate from zero damage or bypass spawn protection', () => {
    const { simulation, shooter, target } = duel();
    simulation.setModifiers({ oneTap: true });
    simulation.damage(target, 0, shooter);
    expect(target).toMatchObject({ hp: 100, shield: 50, deaths: 0 });
    target.protectedUntil = simulation.time + 2.5;
    simulation.damage(target, 1, shooter);
    expect(target).toMatchObject({ hp: 100, shield: 50, deaths: 0 });
    expect(shooter.kills).toBe(0);
  });

  it('turning oneTap off restores normal weapon damage', () => {
    const { simulation, shooter, target } = duel();
    simulation.setModifiers({ oneTap: true });
    simulation.setModifiers({ oneTap: false });
    shooter.pitch = Math.atan2(0.98 - 1.55, 10);
    simulation.action(shooter.id, { type: 'fire' });
    expect(target).toMatchObject({ hp: 100, shield: 42, deaths: 0 });
  });

  it('instant respawn restores the eliminated player after 50 ms while preserving the kill', () => {
    const { simulation, shooter, target } = duel();
    simulation.setModifiers({ instantRespawn: true });
    const beforeWarp = target.warp;
    simulation.damage(target, 999, shooter);
    expect(target.deadUntil - simulation.time).toBeCloseTo(0.05);
    simulation.tick(0.049);
    expect(target.hp).toBe(0);
    simulation.tick(0.002);
    expect(target).toMatchObject({ hp: 100, shield: 50, deaths: 1 });
    expect(target.warp).toBe(beforeWarp + 1);
    expect(shooter.kills).toBe(1);
  });

  it.each(abilities)('uses the new default $label cooldown and mana cost', ability => {
    const { simulation, shooter } = duel(ability.action === 'grapple' ? [floor, wall] : [floor]);
    Object.assign(shooter, { weapon: ability.weapon, aoteOwned: ability.weapon === 'aote', yaw: 0, hp: 50 });
    simulation.action(shooter.id, { type: ability.action });
    expect(shooter.mana).toBe(100 - ability.cost);
    expect(shooter[ability.field] - simulation.time).toBeCloseTo(ability.cooldown);
  });

  it.each(abilities)('scales the $label cooldown and prevents reuse until the scaled timer expires', ability => {
    const { simulation, shooter } = duel(ability.action === 'grapple' ? [floor, wall] : [floor]);
    simulation.setModifiers({ cooldownScale: 0.5 });
    Object.assign(shooter, { weapon: ability.weapon, aoteOwned: ability.weapon === 'aote', yaw: 0, hp: 50 });
    simulation.action(shooter.id, { type: ability.action });
    const readyAt = shooter[ability.field];
    expect(readyAt - simulation.time).toBeCloseTo(ability.cooldown * 0.5);
    simulation.tick(readyAt - simulation.time - 0.001);
    const manaBefore = shooter.mana;
    simulation.action(shooter.id, { type: ability.action });
    expect(shooter[ability.field]).toBe(readyAt);
    expect(shooter.mana).toBe(manaBefore);
    simulation.tick(0.002);
    simulation.action(shooter.id, { type: ability.action });
    expect(shooter[ability.field] - simulation.time).toBeCloseTo(ability.cooldown * 0.5);
    expect(shooter[ability.field]).toBeGreaterThan(readyAt);
  });

  it.each(abilities.filter(ability => ability.cost > 0))('infinite mana lets $label execute without consuming any mana', ability => {
    const { simulation, shooter } = duel(ability.action === 'grapple' ? [floor, wall] : [floor]);
    simulation.setModifiers({ infiniteMana: true });
    Object.assign(shooter, { weapon: ability.weapon, aoteOwned: ability.weapon === 'aote', yaw: 0, hp: 50, mana: 100 });
    simulation.action(shooter.id, { type: ability.action });
    expect(shooter.mana).toBe(100);
    expect(shooter[ability.field]).toBeGreaterThan(simulation.time);
  });
});

describe('G-key ground loot actions', () => {
  it('collects a Rift Orb to restore full mana and reset ability, grapple, and heal cooldowns', () => {
    const { simulation, shooter } = duel();
    const item = GROUND_LOOT.find(item => item.kind === 'rift_orb')!;
    Object.assign(shooter, { x: item.x, y: item.y, z: item.z, mana: 5, abilityUntil: 10, grappleUntil: 20, healUntil: 30 });
    simulation.action(shooter.id, { type: 'pickup' });
    expect(shooter).toMatchObject({ mana: 100, abilityUntil: 0, grappleUntil: 0, healUntil: 0 });
    expect(simulation.loot[item.id]).toBeGreaterThan(simulation.time);
    expect(simulation.events.find(e => e.type === 'pickup')).toMatchObject({ from: shooter.id, text: LOOT_LABELS.rift_orb });
  });

  it.each([{ hp: 20, expected: 55 }, { hp: 85, expected: 100 }])('Dragon Heart raises $hp health to $expected and fills shields', ({ hp, expected }) => {
    const { simulation, shooter } = duel();
    const item = GROUND_LOOT.find(item => item.kind === 'dragon_heart')!;
    Object.assign(shooter, { x: item.x, y: item.y, z: item.z, hp, shield: 10 });
    simulation.action(shooter.id, { type: 'pickup' });
    expect(shooter).toMatchObject({ hp: expected, shield: 100 });
    expect(simulation.events.find(e => e.type === 'pickup')).toMatchObject({ text: LOOT_LABELS.dragon_heart });
  });

  it.each(['rifle', 'shotgun', 'sniper'] as const)('equips a %s ground drop with a full magazine and cancels the current reload', weapon => {
    const { simulation, shooter } = duel();
    const item = GROUND_LOOT.find(item => item.kind === weapon)!;
    Object.assign(shooter, { x: item.x, y: item.y, z: item.z, weapon: 'aote', reloading: 'rifle', reloadUntil: 10 });
    shooter.ammo[weapon] = 0;
    simulation.action(shooter.id, { type: 'pickup' });
    expect(shooter.weapon).toBe(weapon);
    expect(shooter.ammo[weapon]).toBe(WEAPONS[weapon].mag);
    expect(shooter.reloading).toBeNull();
    expect(simulation.loot[item.id]).toBeGreaterThan(simulation.time);
  });

  it('equips an AOTE ground drop and restores its ability mana', () => {
    const { simulation, shooter } = duel();
    const item = GROUND_LOOT.find(item => item.kind === 'aote')!;
    Object.assign(shooter, { x: item.x, y: item.y, z: item.z, weapon: 'rifle', mana: 5 });
    simulation.action(shooter.id, { type: 'pickup' });
    expect(shooter).toMatchObject({ weapon: 'aote', aoteOwned: true, mana: 100 });
    expect(simulation.loot[item.id]).toBeGreaterThan(simulation.time);
  });

  it('denies a pickup when the player is too far from the ground item', () => {
    const { simulation, shooter } = duel();
    const item = GROUND_LOOT.find(item => item.kind === 'rift_orb')!;
    Object.assign(shooter, { x: item.x + 4, y: item.y, z: item.z, mana: 5, abilityUntil: 10 });
    simulation.action(shooter.id, { type: 'pickup' });
    expect(shooter).toMatchObject({ mana: 5, abilityUntil: 10 });
    expect(simulation.loot[item.id]).toBeUndefined();
    expect(simulation.events.some(e => e.type === 'pickup')).toBe(false);
  });

  it('denies a nearby pickup through solid cover', () => {
    const item = GROUND_LOOT.find(item => item.kind === 'rift_orb')!;
    const obstruction: Collider = { minX: item.x - 1.3, maxX: item.x - 0.7, minY: item.y, maxY: item.y + 4, minZ: item.z - 2, maxZ: item.z + 2 };
    const { simulation, shooter } = duel([floor, obstruction]);
    Object.assign(shooter, { x: item.x - 2, y: item.y, z: item.z, mana: 5 });
    simulation.action(shooter.id, { type: 'pickup' });
    expect(shooter.mana).toBe(5);
    expect(simulation.loot[item.id]).toBeUndefined();
  });

  it('shares the ground-item cooldown between players and allows collection again after it expires', () => {
    const { simulation, shooter, target } = duel();
    const item = GROUND_LOOT.find(item => item.kind === 'rift_orb')!;
    for (const p of [shooter, target]) Object.assign(p, { x: item.x, y: item.y, z: item.z, mana: 5 });
    simulation.action(shooter.id, { type: 'pickup' });
    const respawnsAt = simulation.loot[item.id];
    shooter.mana = 5;
    simulation.action(shooter.id, { type: 'pickup' });
    simulation.action(target.id, { type: 'pickup' });
    expect(shooter.mana).toBe(5);
    expect(target.mana).toBe(5);
    expect(simulation.events.filter(e => e.type === 'pickup')).toHaveLength(1);
    expect(simulation.loot[item.id]).toBe(respawnsAt);

    simulation.tick(respawnsAt - simulation.time - 0.01);
    target.mana = 5;
    simulation.action(target.id, { type: 'pickup' });
    expect(target.mana).toBe(5);
    simulation.tick(0.02);
    target.mana = 5;
    simulation.action(target.id, { type: 'pickup' });
    expect(target.mana).toBe(100);
    expect(simulation.events.filter(e => e.type === 'pickup')).toHaveLength(2);
    expect(simulation.loot[item.id]).toBeGreaterThan(respawnsAt);
  });
});

describe('room state', () => {
  it('accepts movement without allowing extra packet fields to overwrite combat state', () => {
    const { simulation, shooter } = duel();
    const packet = { x: 1, y: 0, z: 0, yaw: 0, pitch: 0, weapon: 'rifle', grounded: true,
      hp: 999, kills: 19, shield: 999, mana: 999, id: 'another-player', ammo: { rifle: 999 }, aotdCharges: 999, aoteOwned: true,
      modifiers: { speed: 3, jump: 3, oneTap: true, infiniteMana: true } } as unknown as Movement;
    simulation.movement(shooter.id, packet);
    expect(shooter.x).toBe(1);
    expect(shooter).toMatchObject({ id: 'shooter', hp: 100, shield: 50, mana: 100, kills: 0, aotdCharges: 0, aoteOwned: false });
    expect(shooter.ammo.rifle).toBe(30);
    expect(simulation.modifiers).toMatchObject({ speed: 1, jump: 1, oneTap: false, infiniteMana: false });
    expect('modifiers' in shooter).toBe(false);
  });

  it('rejects nonfinite and impossible movement coordinates', () => {
    const { simulation, shooter } = duel();
    simulation.movement(shooter.id, { x: NaN, y: 0, z: 0, yaw: 0, pitch: 0, weapon: 'rifle', grounded: true });
    expect(shooter.x).toBe(0);
    simulation.movement(shooter.id, { x: 100, y: 0, z: 0, yaw: 0, pitch: 0, weapon: 'rifle', grounded: true });
    expect(shooter.x).toBe(0);
  });

  it('chooses a spawn far from the existing living player', () => {
    const simulation = new Simulation(fixture());
    const first = simulation.addPlayer('one', 'Juniper')!;
    Object.assign(first, { x: -30, y: 0, z: -30 });
    const second = simulation.addPlayer('two', 'Cinder')!;
    expect(second).toMatchObject({ x: 30, y: 0, z: 30 });
  });

  it('limits player capacity and replaces a training bot when making room', () => {
    const simulation = new Simulation(fixture());
    simulation.fillBots(MAX_PLAYERS);
    expect(simulation.players.size).toBe(MAX_PLAYERS);
    expect(simulation.addPlayer('human', 'Juniper')).toBeUndefined();
    simulation.makeRoom();
    expect(simulation.addPlayer('human', 'Juniper')).toBeDefined();
    expect(simulation.players.size).toBe(MAX_PLAYERS);
  });

  it('returns independent snapshot data so a receiver cannot mutate live ammo', () => {
    const { simulation, shooter } = duel();
    const snapshot = simulation.snapshot();
    const copy = snapshot.players.find((p: Player) => p.id === shooter.id)!;
    copy.ammo.rifle = 0;
    copy.hp = 0;
    expect(shooter.ammo.rifle).toBe(30);
    expect(shooter.hp).toBe(100);
  });
});
