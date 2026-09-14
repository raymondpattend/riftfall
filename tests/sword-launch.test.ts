import {describe,it,expect} from 'vitest';
import {Simulation} from '../src/simulation';
import {SprintInput,swordTarget} from '../src/sword-launch';
import type {Collider} from '../src/world-types';
const floor:Collider={minX:-100,maxX:100,minY:-2,maxY:0,minZ:-100,maxZ:100};
const wall:Collider={minX:-3,maxX:3,minY:0,maxY:5,minZ:-6,maxZ:-5};
function duel(colliders=[floor]){
 const sim=new Simulation({colliders,spawns:[{x:0,y:0,z:0,yaw:0}],pickups:[],jumpPads:[],loot:[]});
 const a=sim.addPlayer('a','A')!,b=sim.addPlayer('b','B')!;
 Object.assign(a,{x:0,y:0,z:0,yaw:0,pitch:0,weapon:'aote',aoteOwned:true,protectedUntil:0});
 Object.assign(b,{x:0,y:0,z:-12,protectedUntil:0});
 return {sim,a,b};
}
function finish(sim:Simulation){for(let i=0;i<100;i++)sim.tick(.01);}
describe('Sword launch',()=>{
 it('moves toward the aimed player and hits exactly once on arrival',()=>{const {sim,a,b}=duel();sim.action(a.id,{type:'lunge'});expect(a.lunging).toBe(true);expect(b.shield).toBe(50);sim.tick(.1);expect(a.z).toBeCloseTo(-3.2);expect(b.shield).toBe(50);finish(sim);expect(a.lunging).toBe(false);expect(a.z).toBeLessThan(-10);expect(b.shield).toBe(35);expect(sim.events.filter(e=>e.type==='hit')).toHaveLength(1);});
 it('rejects targets behind walls, outside range, and off the crosshair',()=>{const {sim,a,b}=duel([floor,wall]);expect(swordTarget(a,sim.players.values(),sim.arena.colliders)).toBeNull();sim.action(a.id,{type:'lunge'});expect(a.lunging).toBe(false);b.x=10;expect(swordTarget(a,sim.players.values(),[floor])).toBeNull();b.x=0;b.z=-25;expect(swordTarget(a,sim.players.values(),[floor])).toBeNull();});
 it('stops if an obstacle enters the path after launch',()=>{const {sim,a,b}=duel();sim.action(a.id,{type:'lunge'});sim.arena.colliders.push(wall);finish(sim);expect(a.z).toBeGreaterThan(-5);expect(b.shield).toBe(50);expect(a.lunging).toBe(false);});
 it('does not hit a target that dodges away',()=>{const {sim,a,b}=duel();sim.action(a.id,{type:'lunge'});b.x=8;finish(sim);expect(b.shield).toBe(50);});
 it('rejects guns, unowned swords and repeated launch actions',()=>{const {sim,a}=duel();a.weapon='rifle';sim.action(a.id,{type:'lunge'});expect(a.lunging).toBe(false);a.weapon='aote';a.aoteOwned=false;sim.action(a.id,{type:'lunge'});expect(a.lunging).toBe(false);a.aoteOwned=true;sim.action(a.id,{type:'lunge'});sim.action(a.id,{type:'lunge'});expect(sim.events.filter(e=>e.type==='lunge'&&!e.text)).toHaveLength(1);});
 it('keeps movement and other actions from overriding a launch',()=>{const {sim,a}=duel();sim.action(a.id,{type:'lunge'});sim.movement(a.id,{x:20,y:0,z:0,yaw:1,pitch:0,weapon:'rifle',grounded:true});sim.action(a.id,{type:'ability'});sim.action(a.id,{type:'fire'});expect(a.x).toBe(0);expect(a.weapon).toBe('aote');expect(a.mana).toBe(100);});
 it('cannot damage a respawned target with an earlier launch',()=>{const {sim,a,b}=duel();sim.action(a.id,{type:'lunge'});sim.spawn(b);finish(sim);expect(b.shield).toBe(50);expect(a.lunging).toBe(false);});
 it('consumes Dragon sword once and credits its lethal arrival',()=>{const {sim,a,b}=duel();a.weapon='aotd';a.aotdCharges=1;sim.action(a.id,{type:'lunge'});finish(sim);expect(b.hp).toBe(0);expect(a.kills).toBe(1);expect(a.aotdCharges).toBe(0);expect(a.weapon).toBe('aote');});
 it('preserves spawn protection',()=>{const {sim,a,b}=duel();b.protectedUntil=5;sim.action(a.id,{type:'lunge'});finish(sim);expect(b.shield).toBe(50);});
 it('supports every Gun Game sword and promotes with the captured stage source',()=>{for(let stage=16;stage<20;stage++){const {sim,a,b}=duel();sim.gameMode='gun-game';a.kills=stage;sim.spawn(a);Object.assign(a,{x:0,y:0,z:0,yaw:0,pitch:0});b.shield=0;b.hp=1;sim.action(a.id,{type:'lunge'});finish(sim);expect(a.kills).toBe(stage+1);expect(sim.events.some(e=>e.type==='kill'&&e.from===a.id)).toBe(true);}});
});
describe('Sprint tap and hold',()=>{
 it('toggles only on a short right-shift release',()=>{const s=new SprintInput();s.down('ShiftRight',1);expect(s.active).toBe(true);s.up('ShiftRight',1.1);expect(s.active).toBe(true);s.down('ShiftRight',2);s.up('ShiftRight',2.1);expect(s.active).toBe(false);});
 it('holds either Shift without latching a long press',()=>{const s=new SprintInput();s.down('ShiftRight',1);s.down('ShiftRight',1.4);s.up('ShiftRight',1.5);expect(s.active).toBe(false);s.down('ShiftLeft',2);expect(s.active).toBe(true);s.up('ShiftLeft',2.1);expect(s.active).toBe(false);});
 it('clears latched and held state when reset',()=>{const s=new SprintInput();s.down('ShiftRight',1);s.up('ShiftRight',1.1);s.down('ShiftLeft',2);s.reset();expect(s.active).toBe(false);});
});
