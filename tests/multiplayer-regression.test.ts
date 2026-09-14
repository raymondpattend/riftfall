import {it,expect,describe,vi,afterEach} from 'vitest';
import {Simulation} from '../src/simulation';
import {GameEngine} from '../src/engine';
import {motionAt,advanceMotion,INPUT_STEP,type MoveInput} from '../src/movement';
import {DEFAULT_MODIFIERS} from '../src/modifiers';
import {historicalPosition} from '../src/timeline';
const arena=()=>({colliders:[{minX:-200,maxX:200,minY:-1,maxY:0,minZ:-200,maxZ:200},{minX:5,maxX:6,minY:0,maxY:5,minZ:-5,maxZ:5}],spawns:[{x:0,y:0,z:0,yaw:0}],pickups:[],jumpPads:[],loot:[]});
const input=(seq:number,warp=1):MoveInput=>({seq,warp,forward:0,strafe:1,yaw:0,pitch:0,weapon:'rifle',sprint:false,focused:false,jump:false,slide:false});
afterEach(()=>vi.unstubAllGlobals());
it('recovers a 40-unit disagreement from authoritative motion and preserves newer input',()=>{
 const s=new Simulation(arena()),p=s.addPlayer('p','Player')!;const e:any=Object.create(GameEngine.prototype);
 Object.assign(e,{arenaId:'crown',arena:s.arena,localId:'p',snapshot:s.snapshot(),body:{...motionAt(p).body,x:40},warp:p.warp,equippedStage:null,weapon:'rifle',history:[],pendingInputs:[input(1)],unsentInputs:[],modifiers:DEFAULT_MODIFIERS});
 e.receiveSnapshot(s.snapshot());expect(e.body.x).toBeGreaterThan(0);expect(e.body.x).toBeLessThan(.1);expect(e.pendingInputs).toHaveLength(1);
 s.inputs('p',[input(1)]);s.tick(INPUT_STEP);e.receiveSnapshot(s.snapshot());expect(e.body.x).toBeCloseTo(p.x);expect(e.pendingInputs).toHaveLength(0);
});
it('ignores position assignments and bounds flood movement by elapsed simulation time and walls',()=>{
 const s=new Simulation(arena()),p=s.addPlayer('p','Player')!;
 for(const x of [20,40,60,80,100])s.movement('p',{...p,x});expect(p.x).toBe(0);
 s.inputs('p',Array.from({length:30},(_,n)=>input(n+1)));expect(p.x).toBe(0);s.tick(INPUT_STEP);expect(p.x).toBeLessThan(.1);
 for(let n=0;n<120;n++){s.inputs('p',[input(n+31)]);s.tick(INPUT_STEP);}expect(p.x).toBeLessThanOrEqual(5-.34);expect(p.x).toBeGreaterThan(4);
});
it('rejects nonfinite, out-of-range, duplicate and stale input and clears pre-warp queues',()=>{
 const s=new Simulation(arena()),p=s.addPlayer('p','Player')!;
 s.inputs('p',[{...input(1),forward:NaN},{...input(2),strafe:2},{...input(3),warp:0}]);s.tick(INPUT_STEP);expect(p.x).toBe(0);
 s.inputs('p',[input(4),input(4),input(3)]);s.tick(INPUT_STEP);expect(p.ack).toBe(4);const x=p.x;s.tick(INPUT_STEP);expect(p.x).toBe(x);
 s.inputs('p',[input(5)]);s.spawn(p);s.tick(INPUT_STEP);expect(p.x).toBe(0);expect(p.motion!.body.x).toBe(0);
});
describe('render-independent fixed movement',()=>{
 for(const fps of [10,20,60,144])it(`walks and sprints equally for 2 seconds at ${fps} FPS`,()=>{
  const s=new Simulation({...arena(),colliders:arena().colliders.slice(0,1)}),p=s.addPlayer('p','P')!;
  for(const sprint of [false,true]){const m=motionAt(p);let acc=0,seq=0;for(let frame=0;frame<fps*2;frame++){acc+=1/fps;while(acc+1e-8>=INPUT_STEP){acc-=INPUT_STEP;advanceMotion(m,{...input(++seq),sprint},p,DEFAULT_MODIFIERS,s.arena.colliders,[],0);}}
   expect(m.body.x).toBeCloseTo(sprint?19.4547:12.6456,3);
  }
 });
});
for(const rtt of [0,50,150,250])it(`hits the displayed moving target at ${rtt}ms RTT`,()=>{
 const s=new Simulation({...arena(),colliders:arena().colliders.slice(0,1)}),p=s.addPlayer('p','P')!,target=s.addPlayer('t','T')!;p.protectedUntil=target.protectedUntil=0;
 for(let n=0;n<120;n++){target.x=n/60*3;target.z=-15;s.tick(INPUT_STEP);}
 const at=s.time-rtt/2000,viewAt=at-.1,seen={x:(viewAt-INPUT_STEP)*3,y:0,z:-15};
 s.command('p',{inputSeq:0,seq:1,warp:p.warp,at,viewAt,yaw:Math.atan2(-seen.x,15),pitch:Math.atan2(.98-1.55,Math.hypot(seen.x,15)),weapon:'sniper',focused:true,action:{type:'fire'}});
 expect(target.hp).toBe(0);
});
it('rejects stale, future and replayed commands without spending ammunition',()=>{
 const s=new Simulation(arena()),p=s.addPlayer('p','P')!;s.tick(1);
 const c={inputSeq:0,seq:1,warp:p.warp,at:1,viewAt:.9,yaw:1,pitch:0,weapon:'rifle' as const,focused:false,action:{type:'fire' as const}};
 for(const at of [-1,2,NaN])s.command('p',{...c,at});expect(p.ammo.rifle).toBe(30);
 s.command('p',c);expect(p.ammo.rifle).toBe(29);s.tick(.2);s.command('p',c);expect(p.ammo.rifle).toBe(29);expect(p.yaw).toBe(1);
});
it('never interpolates through teleport or respawn boundaries',()=>{
 const s=new Simulation(arena()),p=s.addPlayer('p','P')!;const old=s.snapshot();p.warp++;p.x=30;const next=s.snapshot();next.time=1;
 expect(historicalPosition([old,next],p,.5)).toBeNull();p.life++;expect(historicalPosition([next],p,1)).toBeNull();
});
it('preserves wall occlusion for rewound targets',()=>{
 const s=new Simulation(arena()),p=s.addPlayer('p','P')!,t=s.addPlayer('t','T')!;t.x=10;t.z=0;t.protectedUntil=0;s.tick(.1);
 s.command('p',{inputSeq:0,seq:1,warp:p.warp,at:.1,viewAt:0,yaw:-Math.PI/2,pitch:0,weapon:'sniper',focused:true,action:{type:'fire'}});expect(t.hp).toBe(100);
});
for(const fps of [10,20,60,144])it(`preserves held-fire cadence when ${fps} FPS batches commands`,()=>{
 const s=new Simulation(arena()),p=s.addPlayer('p','P')!;let command=0,local=0,last=-1,acc=0;
 for(let frame=0;frame<fps*2;frame++){
  acc+=1/fps;while(acc+1e-8>=INPUT_STEP){acc-=INPUT_STEP;local+=INPUT_STEP;if(local-last>=.13){s.command('p',{inputSeq:0,seq:++command,warp:p.warp,at:s.time,viewAt:Math.max(0,s.time-.1),yaw:0,pitch:0,weapon:'rifle',focused:false,action:{type:'fire'}});last=local;}}
  let elapsed=1/fps;while(elapsed>1e-8){const dt=Math.min(INPUT_STEP,elapsed);s.tick(dt);elapsed-=dt;}
 }
 expect(30-p.ammo.rifle).toBeGreaterThanOrEqual(14);expect(30-p.ammo.rifle).toBeLessThanOrEqual(16);
});
it('does not undo a warp when new inputs arrive before the next tick',()=>{
 const s=new Simulation(arena()),p=s.addPlayer('p','P')!;s.inputs('p',[input(1)]);s.tick(INPUT_STEP);p.x=-20;p.warp++;
 s.inputs('p',[input(2,p.warp)]);s.tick(INPUT_STEP);expect(p.x).toBeLessThan(-19);expect(p.motion!.body.x).toBe(p.x);
});
it('waits for the shot input acknowledgment and keeps atomic aim',()=>{
 const s=new Simulation(arena()),p=s.addPlayer('p','P')!;
 s.inputs('p',[input(1)]);s.command('p',{inputSeq:1,seq:1,warp:p.warp,at:0,viewAt:0,yaw:1,pitch:0,weapon:'shotgun',focused:true,action:{type:'fire'}});
 expect(p.ammo.shotgun).toBe(8);s.tick(INPUT_STEP);expect(p.ammo.shotgun).toBe(7);expect(p.yaw).toBe(1);expect(p.weapon).toBe('shotgun');
});
it('expires commands blocked behind missing input instead of bursting on recovery',()=>{
 const s=new Simulation(arena()),p=s.addPlayer('p','P')!;
 s.command('p',{inputSeq:1,seq:1,warp:p.warp,at:0,viewAt:0,yaw:0,pitch:0,weapon:'rifle',focused:false,action:{type:'fire'}});
 for(let n=0;n<31;n++)s.tick(INPUT_STEP);s.inputs('p',[input(1)]);s.tick(INPUT_STEP);expect(p.ammo.rifle).toBe(30);
});
it('bounds server catch-up and preserves elapsed time for 100-500ms stalls',async()=>{
 const {FixedClock}=await import('../src/fixed-clock');
 for(const stall of [.1,.25,.5]){const s=new Simulation(arena()),p=s.addPlayer('p','P')!,clock=new FixedClock();s.inputs('p',Array.from({length:30},(_,n)=>input(n+1)));clock.advance(stall,dt=>s.tick(dt));expect(s.time).toBeCloseTo(stall);expect(p.x).toBeLessThan(5-.34);}
 const clock=new FixedClock();let steps=0;clock.advance(30,()=>steps++);expect(steps).toBe(30);clock.advance(0,()=>steps++);expect(steps).toBe(30);
});
it('does not let a silent client suspend gravity in midair',()=>{
 const s=new Simulation(arena()),p=s.addPlayer('p','P')!;s.inputs('p',[{...input(1),jump:true}]);s.tick(INPUT_STEP);
 for(let n=0;n<120;n++)s.tick(INPUT_STEP);expect(p.y).toBe(0);expect(p.grounded).toBe(true);
});
