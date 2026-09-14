import {SnapshotDelivery} from '../src/snapshot-delivery';
import {FixedClock} from '../src/fixed-clock';
import {DurableObject} from 'cloudflare:workers';
import {Simulation} from '../src/simulation';
import {courseFor,courseColliders,isParkourArena} from '../src/parkour';
import type {ArenaId} from '../src/world-types';
import type {Packet,ChatEntry,RoomOptions} from '../src/protocol';
import type {Env} from './index';
import arenas from './arenas.json';

type Session={delivery:SnapshotDelivery;id:string;token:string;lastSeen:number;window:number;count:number;chat:number[];admitted:boolean};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const clean=(value:unknown,length:number)=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,length):'';
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export class GameRoom extends DurableObject<Env> {
 private sim:Simulation|null=null;
 private sessions=new Map<WebSocket,Session>();
 private owner='';private code='';private timer:ReturnType<typeof setInterval>|undefined;
 private clock=new FixedClock();
 private lastTick=0;private listing=false;private listingAt=0;private listingOwner='';
 async fetch(request:Request){
  const url=new URL(request.url);
  if(url.pathname==='/listing'){
   const body=await request.json() as {hostToken?:string;token?:string};
   const owner=[...this.sessions.values()].find(s=>s.id===this.owner&&s.admitted);
   const token=body.hostToken||body.token;
   if(!owner||token!==owner.token)return json({error:'Only the room owner can publish this room.'},403);
   this.listing=request.method!=='DELETE';await this.updateListing();return json({token});
  }
  if(this.sessions.size>=8)return json({error:'This arena is full.'},409);
  const id=url.searchParams.get('id')||'',token=url.searchParams.get('token')||'';
  if(!/^[a-f0-9-]{36}$/.test(id)||token.length<16||token.length>128)return json({error:'Invalid session.'},400);
  if([...this.sessions.values()].some(s=>s.id===id))return json({error:'Session already connected.'},409);
  const pair=new WebSocketPair(),client=pair[0],server=pair[1];server.accept();
  this.code=url.pathname.split('/').at(-1)!;
  this.sessions.set(server,{delivery:new SnapshotDelivery(),id,token,lastSeen:Date.now(),window:Date.now(),count:0,chat:[],admitted:false});
  server.addEventListener('message',event=>this.message(server,event.data));
  server.addEventListener('close',()=>this.leave(server));server.addEventListener('error',()=>this.leave(server));
  if(!this.timer){this.lastTick=performance.now();this.timer=setInterval(()=>this.tick(),50);}
  return new Response(null,{status:101,webSocket:client});
 }
 private send(ws:WebSocket,packet:Packet){try{ws.send(JSON.stringify(packet));}catch{this.leave(ws);}}
 private broadcast(packet:Packet){for(const [ws,s] of this.sessions)if(s.admitted)this.send(ws,packet);}
 private snapshot(){if(!this.sim)return;const snapshot=this.sim.snapshot();for(const [ws,s] of this.sessions)if(s.admitted){if(s.delivery.expired(performance.now())){this.reject(ws,'Connection fell behind. Join the room again.');continue;}const packet=s.delivery.next(snapshot,performance.now());if(packet)this.send(ws,packet);}}
 private notice(text:string){const entry:ChatEntry={id:crypto.randomUUID(),name:'',text,system:true};this.broadcast({type:'room-message',entry});}
 private reject(ws:WebSocket,message:string){this.send(ws,{type:'error',message});ws.close(1008,message.slice(0,100));this.leave(ws);}
 private message(ws:WebSocket,raw:unknown){
  const s=this.sessions.get(ws);if(!s)return;
  if(typeof raw!=='string'||raw.length>16384){this.reject(ws,'Invalid game message.');return;}
  const now=Date.now();s.lastSeen=now;if(now-s.window>=1000){s.window=now;s.count=0;}if(++s.count>100){this.reject(ws,'Too many game messages.');return;}
  let p;try{p=JSON.parse(raw);}catch{this.reject(ws,'Invalid game message.');return;}if(!p||typeof p!=='object')return;
  if(p.type==='ping'&&Number.isFinite(p.at)){this.send(ws,{type:'pong',at:p.at,serverTime:this.sim?.time});return;}
  if(!s.admitted){
   if(p.type!=='create'&&p.type!=='hello')return;
   if(p.type==='create'){
    if(this.sim){this.reject(ws,'That room code is already in use.');return;}
    const o=p.options as RoomOptions;if(!o||typeof o!=='object'){this.reject(ws,'Invalid room settings.');return;}
    const mode=['ffa','gun-game','parkour'].includes(o.gameMode)?o.gameMode:'ffa';
    const id:ArenaId=mode==='parkour'?(o.arena==='switchback'?'switchback':'sky-steps'):(Object.hasOwn(arenas,o.arena)?o.arena:'crown');
    const seed=crypto.getRandomValues(new Uint32Array(1))[0],start=courseFor(id,seed)[0];
    const arena=isParkourArena(id)?{courseSeed:seed,colliders:courseColliders(id,seed),spawns:[{x:start.x,y:start.y,z:start.z,yaw:0}],pickups:[],jumpPads:[],loot:[]}:structuredClone(arenas[id as keyof typeof arenas]);
    this.sim=new Simulation(arena as ConstructorParameters<typeof Simulation>[0],id,mode);if(o.modifiers&&typeof o.modifiers==='object')this.sim.setModifiers(o.modifiers);
    this.sim.onEvent=event=>{for(const session of this.sessions.values())if(session.admitted)session.delivery.event(event);};
    this.sim.onResult=result=>{for(const session of this.sessions.values())if(session.id===result.id)session.delivery.result(result);};
    this.owner=s.id;p.name=o.name;p.appearance=o.appearance;
    this.sim.addPlayer(s.id,clean(p.name,18)||'Wanderer');
    this.sim.fillBots(Math.min(5,Math.max(0,Math.floor(Number(o.bots)||0)))+1);
   }else{
    if(!this.sim){this.reject(ws,'Room not found. Check the code.');return;}
    this.sim.makeRoom();if(!this.sim.addPlayer(s.id,clean(p.name,18)||'Wanderer')){this.reject(ws,'This arena is full.');return;}
   }
   s.admitted=true;this.sim!.setAppearance(s.id,p.appearance);this.broadcast({type:'owner',id:this.owner});this.snapshot();this.notice(`${this.sim!.players.get(s.id)!.name} joined the arena.`);return;
  }
  const sim=this.sim;if(!sim)return;
  if(p.type==='snapshot-ack'){s.delivery.ack(p.delivery);return;}
  if(p.type==='inputs')sim.inputs(s.id,p.inputs);
  else if(p.type==='command')sim.command(s.id,p.command);
  else if(p.type==='appearance')sim.setAppearance(s.id,p.appearance);
  else if(p.type==='modifiers'&&s.id===this.owner&&p.modifiers&&typeof p.modifiers==='object')sim.setModifiers(p.modifiers);
  else if(p.type==='restart'&&s.id===this.owner){for(const session of this.sessions.values())session.delivery.clearEvents();sim.restart();}
  else if(p.type==='chat'){
   const text=clean(p.text,240);s.chat=s.chat.filter(at=>now-at<5000);if(!text||s.chat.length>=5)return;s.chat.push(now);
   this.broadcast({type:'room-message',entry:{id:crypto.randomUUID(),name:sim.players.get(s.id)!.name,text,system:false}});
  }
 }
 private tick(){
  const now=Date.now(),tickAt=performance.now(),dt=Math.min(.5,Math.max(0,(tickAt-this.lastTick)/1000));this.lastTick=tickAt;
  for(const [ws,s] of this.sessions)if(now-s.lastSeen>(s.admitted?30000:10000)){ws.close(1001,'Session timed out');this.leave(ws);}
  if(this.sim){this.clock.advance(dt,step=>this.sim?.tick(step));this.snapshot();}
  if(this.listing&&now-this.listingAt>30000){this.listingAt=now;this.ctx.waitUntil(this.updateListing());}
 }
 private leave(ws:WebSocket){
  const s=this.sessions.get(ws);if(!s)return;this.sessions.delete(ws);
  const name=this.sim?.players.get(s.id)?.name;this.sim?.removePlayer(s.id);if(name)this.notice(`${name} left the arena.`);
  if(s.id===this.owner){this.owner=[...this.sessions.values()].find(v=>v.admitted)?.id||'';this.broadcast({type:'owner',id:this.owner});}
  if(![...this.sessions.values()].some(v=>v.admitted)){
   this.sim=null;this.owner='';this.listing=false;
  }
  if(!this.sessions.size){if(this.timer)clearInterval(this.timer);this.timer=undefined;}
  this.ctx.waitUntil(this.updateListing());
 }
 private async updateListing(){
  const directory=this.env.DIRECTORY.getByName('public-v1');
  const owner=[...this.sessions.values()].find(s=>s.id===this.owner&&s.admitted);
  if(!this.listing||!owner||!this.sim){if(this.listingOwner)await directory.fetch('https://directory/rooms',{method:'DELETE',body:JSON.stringify({code:this.code,owner:this.listingOwner})});return;}
  this.listingOwner=await digest(owner.token);this.listingAt=Date.now();
  await directory.fetch('https://directory/rooms',{method:'POST',body:JSON.stringify({code:this.code,owner:this.listingOwner,name:this.sim.players.get(owner.id)?.name||'Wanderer',arena:this.sim.arenaId,gameMode:this.sim.gameMode,players:[...this.sessions.values()].filter(s=>s.admitted).length,updated:Date.now()})});
 }
}
