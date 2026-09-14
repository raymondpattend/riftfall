import {describe,it,expect} from 'vitest';
import {Simulation} from '../src/simulation';
import {GUN_GAME_STAGES,weaponStats,gunStage} from '../src/gun-game';
import {WEAPON_IDS} from '../src/rules';
import type {Player} from '../src/rules';

function fixture(){
 const sim=new Simulation({colliders:[{minX:-100,maxX:100,minY:-2,maxY:0,minZ:-100,maxZ:100}],spawns:[{x:0,y:0,z:0,yaw:0},{x:40,y:0,z:40,yaw:0}],pickups:[],jumpPads:[],loot:[{id:'rifle',kind:'rifle',x:0,y:0,z:0},{id:'aote',kind:'aote',x:0,y:0,z:0},{id:'nuke',kind:'nuke',x:0,y:0,z:0}]},'glacier','gun-game');
 // Keep weapon-specific legacy checks deterministic; shuffled rounds are tested separately.
 sim.gunOrder=GUN_GAME_STAGES.map((_,i)=>i);
 const player=sim.addPlayer('host','Host')!,rival=sim.addPlayer('rival','Rival')!;
 aim(player,rival);return {sim,player,rival};
}
function aim(player:Player,rival:Player){Object.assign(player,{x:0,y:0,z:0,yaw:0,pitch:0,protectedUntil:0});Object.assign(rival,{x:0,y:0,z:-2,hp:100,shield:0,protectedUntil:0});}

describe('Gun Game authoritative ladder',()=>{
 it('starts at one of exactly 20 distinct weapon variants with one loaded weapon',()=>{
  const {sim,player}=fixture();expect(GUN_GAME_STAGES).toHaveLength(20);expect(new Set(GUN_GAME_STAGES.map(s=>s.id)).size).toBe(20);
  expect(gunStage(player)?.id).toBe('sidekick');expect(player.ammo).toEqual({rifle:12,shotgun:0,sniper:0,aote:0,aotd:0});expect(player.gadget).toBeNull();expect(player.aoteOwned).toBe(false);
  expect(sim.snapshot()).toMatchObject({gameMode:'gun-game',arenaId:'glacier'});
 });
 it('requires 20 real weapon eliminations, promotes after every kill, and ends on the Crown Blade',()=>{
  const {sim,player,rival}=fixture();
  for(let index=0;index<20;index++){
   expect(player.gunGameStage).toBe(index);expect(player.weapon).toBe(GUN_GAME_STAGES[index].weapon);aim(player,rival);sim.time+=2;
   sim.action(player.id,{type:'fire'});expect(rival.hp).toBe(0);expect(player.kills).toBe(index+1);
   const kill=sim.events.filter(e=>e.type==='kill').at(-1)!;expect(kill.text).toBe(GUN_GAME_STAGES[index].id);
   if(index<19){expect(sim.winner).toBeNull();expect(player.gunGameStage).toBe(index+1);expect(player.ammo[player.weapon]).toBe(GUN_GAME_STAGES[index+1].stats.mag);sim.spawn(rival);}
  }
  expect(sim.winner).toBe(player.id);expect(sim.events.filter(e=>e.type==='end')).toHaveLength(1);
 });
 it('keeps stage and score through death, then resets both on rematch',()=>{
  const {sim,player,rival}=fixture();player.kills=13;sim.spawn(player);player.protectedUntil=0;
  sim.damage(player,999,rival);expect(player.kills).toBe(13);sim.spawn(player);
  expect(player.gunGameStage).toBe(13);expect(player.weapon).toBe('shotgun');expect(player.ammo.shotgun).toBe(4);
  sim.restart();expect(player.kills).toBe(0);expect(player.gunGameStage).toBe(sim.gunOrder[0]);expect(player.ammo[player.weapon]).toBe(weaponStats(player).mag);expect(sim.gameMode).toBe('gun-game');
 });
 it('does not advance on self-damage or a fall',()=>{
  const {sim,player}=fixture();sim.damage(player,999,player);expect(player.kills).toBe(0);expect(player.gunGameStage).toBe(0);
  sim.spawn(player);player.protectedUntil=0;sim.damage(player,999);expect(player.kills).toBe(0);
 });
 it('ignores client weapon switches including delayed packets after a promotion',()=>{
  const {sim,player,rival}=fixture();
  for(const weapon of WEAPON_IDS)sim.movement(player.id,{...player,weapon});expect(player.weapon).toBe('rifle');
  player.kills=1;sim.spawn(player);aim(player,rival);sim.action(player.id,{type:'fire'});expect(player.gunGameStage).toBe(2);
  sim.movement(player.id,{...player,weapon:'rifle'});expect(player.weapon).toBe('shotgun');expect(player.gunGameStage).toBe(2);
 });
 it('blocks all ground acquisition, grenades and relic use even with party modifiers',()=>{
  const {sim,player}=fixture();sim.setModifiers({partyLoot:true,infiniteMana:true});sim.spawn(player);Object.assign(player,{x:0,y:0,z:0});
  player.kills=10;sim.tick(0);expect(sim.nukeUnlocked).toBe(false);sim.action(player.id,{type:'pickup'});expect(sim.loot).toEqual({});expect(player.gadget).toBeNull();
  sim.action(player.id,{type:'grenade'});player.gadget='bonzo_staff';player.gadgetCharges=1;sim.action(player.id,{type:'gadget'});
  expect(sim.grenades).toHaveLength(0);expect(sim.fields).toHaveLength(0);
 });
 it('disables healing and only grants teleport at the End Sword stage',()=>{
  const {sim,player}=fixture();player.hp=30;sim.action(player.id,{type:'heal'});expect(player.hp).toBe(30);
  for(const index of [16,17,19]){player.kills=index;sim.spawn(player);Object.assign(player,{x:0,y:0,z:0,yaw:0,pitch:0});sim.action(player.id,{type:'ability'});expect(player.z).toBe(0);}
  player.kills=18;sim.spawn(player);Object.assign(player,{x:0,y:0,z:0,yaw:0,pitch:0});sim.action(player.id,{type:'ability'});expect(player.z).toBeLessThan(-8);expect(player.mana).toBe(85);
 });
 it('cancels an old reload on promotion and enforces the swap delay',()=>{
  const {sim,player,rival}=fixture();player.ammo.rifle=0;sim.action(player.id,{type:'reload'});expect(player.reloading).toBe('rifle');
  sim.damage(rival,999,player);expect(player.reloading).toBeNull();expect(player.ammo.rifle).toBe(30);
  sim.spawn(rival);aim(player,rival);sim.action(player.id,{type:'fire'});expect(rival.hp).toBe(100);
  sim.time+=.33;sim.action(player.id,{type:'fire'});expect(rival.hp).toBe(0);
 });
 it('uses the stage fire interval and magazine instead of the base family',()=>{
  const {sim,player,rival}=fixture();rival.x=30;sim.action(player.id,{type:'fire'});expect(player.ammo.rifle).toBe(11);
  sim.time+=.15;sim.action(player.id,{type:'fire'});expect(player.ammo.rifle).toBe(11);
  sim.time+=.18;sim.action(player.id,{type:'fire'});expect(player.ammo.rifle).toBe(10);
 });
 for(const [index,stage] of GUN_GAME_STAGES.entries())if(stage.stats.mag)it(`reloads the ${stage.stats.name} to its own capacity`,()=>{
  const {sim,player}=fixture();player.kills=index;sim.spawn(player);player.ammo[player.weapon]=0;sim.action(player.id,{type:'reload'});
  expect(player.reloadDuration).toBe(stage.stats.reload);sim.tick(stage.stats.reload+.01);expect(player.ammo[player.weapon]).toBe(stage.stats.mag);expect(weaponStats(player).name).toBe(stage.stats.name);
 });
 it('bots stay on their assigned weapon and close into melee range',()=>{
  const {sim}=fixture();const bot=sim.addPlayer('bot','Bot',true)!;bot.kills=17;sim.spawn(bot);Object.assign(bot,{x:0,y:0,z:12});
  for(let i=0;i<30;i++)sim.tick(.03);
  expect(bot.gunGameStage).toBe(17);expect(bot.weapon).toBe('aote');expect(bot.z).toBeLessThan(12);
 });
 for(const [index,stage] of GUN_GAME_STAGES.entries())it(`preserves full-shield headshot rules for ${stage.stats.name}`,()=>{
  const {sim,player,rival}=fixture();player.kills=index;sim.spawn(player);aim(player,rival);rival.shield=100;
  sim.action(player.id,{type:'fire'});
  if(stage.headshotDamage===100){expect(rival.hp).toBe(100);expect(rival.shield).toBe(0);sim.time+=stage.stats.interval+.01;sim.action(player.id,{type:'fire'});}
  expect(rival.hp).toBe(0);expect(player.kills).toBe(index+1);
 });
 it('does not change standard FFA loadouts or relic access',()=>{
  const {sim}=fixture();const ffa=new Simulation(sim.arena);const player=ffa.addPlayer('ffa','FFA')!;expect(player.gunGameStage).toBeNull();expect(player.ammo.rifle).toBe(30);
  Object.assign(player,{x:0,y:0,z:0});ffa.action(player.id,{type:'pickup'});expect(ffa.loot.rifle).toBe(22);
 });
});
