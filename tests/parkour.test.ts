import {describe,it,expect} from 'vitest';
import {Simulation} from '../src/simulation';
import {courseFor,platformAt,PARKOUR_LENGTH} from '../src/parkour';
import {shuffledGunOrder,weaponStats} from '../src/gun-game';
const arena={colliders:[],spawns:[{x:0,y:0,z:0,yaw:0}],pickups:[],jumpPads:[],loot:[]};
describe('round shuffle',()=>{
 it('shuffles only the 16 guns and shares a single complete order with every player',()=>{
  expect(shuffledGunOrder(()=>0).slice(0,16)).not.toEqual(Array.from({length:16},(_,i)=>i));
  const sim=new Simulation(arena,'crown','gun-game'),a=sim.addPlayer('a','A')!,b=sim.addPlayer('b','B')!;
  expect(new Set(sim.gunOrder).size).toBe(20);expect(sim.gunOrder.slice(16)).toEqual([16,17,18,19]);expect(a.gunGameStage).toBe(b.gunGameStage);
  for(let i=0;i<20;i++){a.kills=i;sim.spawn(a);expect(a.gunGameStage).toBe(sim.gunOrder[i]);expect(a.ammo[a.weapon]).toBe(weaponStats(a).mag);}
  const old=sim.gunOrder;sim.restart();expect(sim.gunOrder).not.toBe(old);expect(a.gunGameStage).toBe(sim.gunOrder[0]);expect(sim.snapshot().gunOrder).toEqual(sim.gunOrder);
 });
});
for(const id of ['sky-steps','switchback'] as const)describe(id,()=>{
 it('blocks combat and abilities, resets falls to checkpoints, requires ordered landings and ends once',()=>{
  const sim=new Simulation(arena,id,'parkour'),a=sim.addPlayer('a','A')!,b=sim.addPlayer('b','B')!,course=courseFor(id,sim.courseSeed);
  sim.setModifiers({oneTap:true,partyLoot:true,infiniteMana:true});a.protectedUntil=b.protectedUntil=0;
  for(const type of ['fire','lunge','grenade','gadget','ability','grapple','heal','pickup'] as const)sim.action('a',{type});sim.damage(b,999,a);
  expect(b.hp).toBe(100);expect(a.kills).toBe(0);expect(a.gadget).toBeNull();expect(sim.grenades).toEqual([]);
  Object.assign(a,course[PARKOUR_LENGTH],{grounded:true});sim.tick(0);expect(sim.winner).toBeNull();
  for(let i=1;i<=9;i++){Object.assign(a,platformAt(course[i],sim.time),{grounded:true});sim.tick(0);}
  expect(a.checkpoint).toBe(8);a.y=-20;const warp=a.warp;sim.tick(0);expect(a.parkourStep).toBe(8);expect(a.z).toBe(course[8].z);expect(a.warp).toBe(warp+1);expect(a.falls).toBe(1);expect(a.deaths).toBe(0);
  for(let i=9;i<=PARKOUR_LENGTH;i++){Object.assign(a,platformAt(course[i],sim.time),{grounded:true});sim.tick(0);}
  expect(sim.winner).toBe('a');expect(sim.events.filter(e=>e.type==='end')).toHaveLength(1);sim.restart();expect(a.checkpoint).toBe(0);expect(a.parkourStep).toBe(0);expect(a.falls).toBe(0);expect(a.z).toBe(course[0].z);
 });
 it('bots attempt the course and miss jumps without killing anyone',()=>{
  const sim=new Simulation({...arena,courseSeed:17},id,'parkour');sim.fillBots(3);
  for(let i=0;i<3600;i++)sim.tick(1/60);
  expect([...sim.players.values()].some(p=>(p.falls??0)>0)).toBe(true);expect([...sim.players.values()].every(p=>p.hp===100&&p.kills===0)).toBe(true);
 });
});
describe('generated long courses',()=>{
 it('repeats by seed, varies between seeds, includes different jump types and eight safe checkpoints',()=>{
  const course=courseFor('sky-steps',101);expect(course).toHaveLength(65);expect(courseFor('sky-steps',101)).toEqual(course);expect(courseFor('sky-steps',102)).not.toEqual(course);expect(new Set(course.map(p=>p.kind)).size).toBe(8);expect(course.filter(p=>p.isCheckpoint)).toHaveLength(9);expect(course.filter(p=>p.isCheckpoint).every(p=>p.travel===0)).toBe(true);
 });
 it('keeps every generated jump inside sprint-jump reach across 100 seeds per course',()=>{
  for(const id of ['sky-steps','switchback'] as const)for(let seed=1;seed<=100;seed++){
   const c=courseFor(id,seed);for(let i=1;i<c.length;i++){
    const a=c[i-1],b=c[i],flight=(10+Math.sqrt(100-44*(b.y-a.y)))/22;
    const worstDistance=Math.hypot(Math.abs(b.x-a.x)+a.travel+b.travel,b.z-a.z);
    expect(worstDistance/flight).toBeLessThan(10);
   }
  }
 });
 it('animates moving ledges and synchronizes a new seed on rematch',()=>{
  const p=courseFor('sky-steps',101).find(p=>p.travel)!;expect(platformAt(p,0).x).not.toBe(platformAt(p,2).x);
  const sim=new Simulation({...arena,courseSeed:101},'sky-steps','parkour');const before=sim.snapshot().courseSeed;sim.restart();expect(sim.snapshot().courseSeed).not.toBe(before);expect(sim.arena.colliders).toHaveLength(65);
 });
});
