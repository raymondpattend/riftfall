import {it,expect} from 'vitest';
import {Simulation} from '../src/simulation';
import {SnapshotDelivery} from '../src/snapshot-delivery';
import type {Command,CommandResult} from '../src/protocol';
const fixture=()=>({colliders:[],spawns:[{x:0,y:0,z:0,yaw:0}],pickups:[],jumpPads:[],loot:[]});
function setup(){const s=new Simulation(fixture()),p=s.addPlayer('p','Player')!,results:CommandResult[]=[];s.onResult=r=>results.push(r);s.time=10;return {s,p,results};}
function cmd(p:ReturnType<typeof setup>['p'],seq:number,at:number,type:Command['action']['type']='fire'):Command{return {inputSeq:0,seq,warp:p.warp,at,viewAt:Math.max(0,at-.1),yaw:0,pitch:0,weapon:p.weapon,focused:false,action:{type} as Command['action']};}
it('fresh creation time is independent from the delayed viewed snapshot, but rewind stays bounded',()=>{
 const {s,p,results}=setup();s.time=10.45;s.command('p',{...cmd(p,1,10.45),viewAt:10});
 expect(p.ammo.rifle).toBe(29);expect(results[0].status).toBe('accepted');expect(s.events.find(e=>e.type==='shot')?.commandSeq).toBe(1);
 s.command('p',{...cmd(p,2,10.45),viewAt:9});expect(results.at(-1)?.status).toBe('rejected');
});
it('reload cancels buffered fire immediately and never releases a late burst',()=>{
 const {s,p,results}=setup();p.ammo.rifle=20;p.nextFire=10.3;s.command('p',cmd(p,1,10));s.command('p',cmd(p,2,10,'reload'));
 expect(p.reloading).toBe('rifle');expect(results.map(r=>[r.seq,r.status])).toEqual([[1,'rejected'],[2,'accepted']]);s.tick(.31);expect(p.ammo.rifle).toBe(20);
});
it('caps buffered fire at one and expires input waits with correlated receipt and resolution times',()=>{
 const {s,p,results}=setup();s.command('p',{...cmd(p,1,10),inputSeq:20});s.command('p',cmd(p,2,10));expect(results[0].reason).toBe('command buffer full');s.tick(.41);
 expect(results.at(-1)).toMatchObject({seq:1,status:'expired',receivedAt:10,resolvedAt:10.41});expect(p.ammo.rifle).toBe(30);
});
it('preserves movement dependency for reload after cancelling buffered fire',()=>{
 const {s,p}=setup();p.ammo.rifle=20;s.command('p',{...cmd(p,1,10),inputSeq:2});s.command('p',{...cmd(p,2,10,'reload'),inputSeq:2});expect(p.reloading).toBeNull();p.ack=2;s.tick(.02);expect(p.reloading).toBe('rifle');
});
for(const state of ['death','warp','stage'] as const)it(`rejects pending shots across ${state}`,()=>{
 const {s,p,results}=setup();p.nextFire=10.3;s.command('p',cmd(p,1,10));if(state==='death')p.hp=0;else if(state==='warp')p.warp++;else p.gunGameStage=2;s.tick(.02);expect(results.at(-1)?.status).toBe('rejected');expect(p.ammo.rifle).toBe(30);
});
it('weapon changes cancel old fire and cap the old sniper cooldown',()=>{
 const {s,p,results}=setup();p.weapon='sniper';p.nextFire=11.2;s.command('p',cmd(p,1,10));s.movement('p',{...p,weapon:'rifle'});expect(results.at(-1)?.reason).toBe('weapon changed');expect(p.nextFire).toBeCloseTo(10.32);s.tick(.4);expect(p.ammo.sniper).toBe(5);
});
it('returns explicit rejection for empty magazine, reload and replay without spending ammo',()=>{
 const {s,p,results}=setup();p.ammo.rifle=0;s.command('p',cmd(p,1,10));expect(results.at(-1)?.status).toBe('rejected');expect(p.reloading).toBe('rifle');s.command('p',cmd(p,2,10));expect(results.at(-1)?.reason).toBe('reloading');s.command('p',cmd(p,2,10));expect(results.at(-1)?.reason).toBe('replayed command');
});
it('coalesces snapshots while retaining events and results until an exact acknowledgment',()=>{
 const {s}=setup(),d=new SnapshotDelivery();d.event({id:1,type:'shot'});const first=d.next(s.snapshot(),0);expect(first?.type).toBe('snapshot');d.event({id:2,type:'hit'});d.result({id:'p',seq:1,status:'accepted',reason:'executed',receivedAt:10,resolvedAt:10});
 for(let i=1;i<20;i++)expect(d.next(s.snapshot(),i*50)).toBeNull();d.ack(99);expect(d.next(s.snapshot(),1000)).toBeNull();d.ack(1);s.time=11;
 const next=d.next(s.snapshot(),1100);if(next?.type!=='snapshot')throw Error();expect(next.snapshot.time).toBe(11);expect(next.snapshot.events.map(e=>e.id)).toEqual([2]);expect(next.results).toHaveLength(1);expect(d.sends).toBe(2);expect(d.bytes).toBeGreaterThan(0);expect(d.expired(3200)).toBe(true);
});
it('disconnects rather than silently dropping reliable events when the cap is exhausted',()=>{
 const d=new SnapshotDelivery();for(let i=0;i<513;i++)d.event({id:i,type:'shot'});expect(d.expired(0)).toBe(true);
});
it('keeps the new weapon shot when its own movement acknowledgment equips that weapon',()=>{
 const {s,p,results}=setup();s.inputs('p',[{seq:1,warp:p.warp,forward:0,strafe:0,yaw:0,pitch:0,weapon:'shotgun',sprint:false,focused:false,jump:false,slide:false}]);s.command('p',{...cmd(p,1,10),weapon:'shotgun',inputSeq:1});s.tick(1/60);expect(p.ammo.shotgun).toBe(7);expect(results.at(-1)?.status).toBe('accepted');
});
it('rejects commands authored for a previous Gun Game stage even with the same base weapon',()=>{
 const {s,p,results}=setup();p.gunGameStage=1;s.command('p',{...cmd(p,1,10),stage:0});expect(results.at(-1)?.status).toBe('rejected');expect(p.ammo.rifle).toBe(30);
});
