import {historicalPosition,MAX_REWIND} from './timeline';
import {advanceMotion,motionAt,validInput,INPUT_STEP,type MoveInput} from './movement';
import type {Command,CommandResult} from './protocol';
import {swordTarget} from './sword-launch';
import type { ArenaAsset, ArenaId } from './world-types';
import { BOT_NAMES,COLORS,TARGET_KILLS,MAX_PLAYERS,WEAPONS,WEAPON_IDS,clamp,direction,dist,newPlayer,PICKUP_COLORS } from './rules';
import type {Player,Action,Movement,Snapshot,GameEvent,Vec3,Grenade,Field} from './rules';
import {blocked,rayWorld,raySphere,safeBlink,stepBody} from './physics';
import type {Body} from './physics';
import {GROUND_LOOT,LOOT_LABELS} from './loot-rules';
import {GADGETS,GADGET_IDS,isGadget} from './gadgets';
import {sanitizeAppearance} from './cosmetics';
import {GUN_GAME_STAGES,gunStage,weaponStats,stageIndexForKills,shuffledGunOrder} from './gun-game';
import type {GameMode} from './gun-game';
import {DEFAULT_MODIFIERS} from './modifiers';
import type {Modifiers} from './modifiers';

import {courseFor,platformAt,courseColliders,PARKOUR_LENGTH,CHECKPOINT_INTERVAL} from './parkour';

interface Brain {body:Body;phase:number;nextThink:number;target:string;impulse?:Vec3;}
export class Simulation {
 gunOrder=shuffledGunOrder();
 modifiers:Modifiers={...DEFAULT_MODIFIERS};
 setModifiers(changes:Partial<Modifiers>){const next={...this.modifiers};for(const key of ['speed','jump','cooldownScale'] as const){const value=changes[key];if(typeof value==='number'&&Number.isFinite(value))next[key]=clamp(value,key==='cooldownScale'?.1:.5,key==='cooldownScale'?2:3);}for(const key of ['oneTap','instantRespawn','lowGravity','infiniteMana','extraJumps','fastReload','knockback','vampiric','shieldRegen','partyLoot'] as const)if(typeof changes[key]==='boolean')next[key]=changes[key]!;const grantParty=next.partyLoot&&!this.modifiers.partyLoot;this.modifiers=next;if(grantParty&&this.gameMode==='ffa')for(const p of this.players.values())if(p.hp>0&&!p.gadget)this.grantPartyRelic(p);if(next.infiniteMana)for(const p of this.players.values())p.mana=100;}
 private spendMana(p:Player,cost:number){if(!this.modifiers.infiniteMana)p.mana-=cost;}
 players=new Map<string,Player>();time=0;winner:string|null=null;round=1;
 pickups:Record<string,number>={};loot:Record<string,number>={};grenades:Grenade[]=[];fields:Field[]=[];events:GameEvent[]=[];
 nukeUnlocked=false;private recentDamage=new Map<string,Map<string,{at:number;attackerLife:number;targetLife:number}>>();
 private lunges=new Map<string,{body:Body;target:string;life:number;targetLife:number;expires:number;weapon:Player['weapon'];stage:number|null;damage:number;source:string}>();
 onResult?:(result:CommandResult)=>void;onEvent?:(event:GameEvent)=>void;
 private activeCommand:number|undefined;
 private pendingCommands=new Map<string,(Command&{receivedAt:number;stage?:number|null})[]>();
 private hitHistory:Pick<Snapshot,'time'|'players'>[]=[];private shotTime:number|null=null;
 private controls=new Map<string,{queue:MoveInput[];received:number;command:number;credit:number;warp:number}>();
 private seq=0;private brains=new Map<string,Brain>();private spawnIndex=0;
 constructor(public arena:Pick<ArenaAsset,'colliders'|'spawns'|'pickups'|'jumpPads'|'loot'|'courseSeed'>,public arenaId:ArenaId='crown',public gameMode:GameMode='ffa'){this.courseSeed=arena.courseSeed??Math.floor(Math.random()*0xffffffff);if(gameMode==='parkour')this.arena.colliders=courseColliders(arenaId,this.courseSeed);}
 courseSeed:number;
 get groundLoot(){return this.arena.loot??GROUND_LOOT;}
 setAppearance(id:string,value:unknown){const p=this.players.get(id);if(p){p.appearance=sanitizeAppearance(value);p.color=p.appearance.accent;}}
 addPlayer(id:string,name:string,bot=false):Player|undefined {
  if(this.players.has(id))return this.players.get(id);
  if(this.players.size>=MAX_PLAYERS)return;
  const p=newPlayer(id,name,COLORS[this.players.size%COLORS.length],bot);this.players.set(id,p);this.spawn(p);
  if(bot)this.brains.set(id,{body:{x:p.x,y:p.y,z:p.z,vx:0,vy:0,vz:0,grounded:true,jumps:0},phase:Math.random()*6.28,nextThink:this.time+1,target:''});
  return p;
 }
 fillBots(total=5){while(this.players.size<total){let i=0;while(this.players.has(`bot-${i}`))i++;this.addPlayer(`bot-${i}`,BOT_NAMES[i%BOT_NAMES.length],true);}}
 removePlayer(id:string){this.players.delete(id);this.controls.delete(id);this.pendingCommands.delete(id);this.brains.delete(id);this.lunges.delete(id);this.clearDamageHistory(id);}
 makeRoom(){if(this.players.size>=MAX_PLAYERS){const b=[...this.players.values()].find(p=>p.bot);if(b)this.removePlayer(b.id);}}
 spawn(p:Player){
  p.life++;p.lunging=false;this.lunges.delete(p.id);this.clearDamageHistory(p.id);
  const others=[...this.players.values()].filter(v=>v.id!==p.id&&v.hp>0);
  const spawns=this.arena.spawns;
  let chosen=spawns[this.spawnIndex++%spawns.length];let best=-1;
  for(let i=0;i<spawns.length;i++){const s=spawns[(i+this.spawnIndex)%spawns.length];const distance=Math.min(80,...others.map(o=>dist(o,s)));if(distance>best){best=distance;chosen=s;}}
  if(this.gameMode==='parkour'){const course=courseFor(this.arenaId,this.courseSeed),at=course[p.checkpoint??0],next=course[Math.min(PARKOUR_LENGTH,(p.checkpoint??0)+1)];chosen={x:at.x,y:at.y,z:at.z,yaw:Math.atan2(at.x-next.x,at.z-next.z)};p.parkourStep??=0;p.checkpoint??=0;p.falls??=0;}
  Object.assign(p,chosen,{hp:100,shield:50,mana:100,aoteOwned:false,aotdCharges:0,gadget:null,gadgetCharges:0,gadgetUntil:0,chilledUntil:0,lastHitAt:this.time,reloadDuration:0,weapon:!WEAPONS[p.weapon].mag?'rifle':p.weapon,deadUntil:0,protectedUntil:this.time+2.5,grounded:true,reloadUntil:0,reloading:null,nextFire:0,abilityUntil:0,lungeUntil:0,lunging:false,healUntil:0,grappleUntil:0,grenadeUntil:0,hasteUntil:0});
  p.motion=motionAt(p);p.ammo={rifle:30,shotgun:8,sniper:5,aote:0,aotd:0};p.warp++;if(this.gameMode==='gun-game')this.equipStage(p);else if(this.modifiers.partyLoot)this.grantPartyRelic(p);
  const brain=this.brains.get(p.id);if(brain){brain.impulse={x:0,y:0,z:0};Object.assign(brain.body,{x:p.x,y:p.y,z:p.z,vx:0,vy:0,vz:0});}
 }
 movement(id:string,m:Movement){
  const p=this.players.get(id);if(!p||p.hp<=0||this.winner)return;
  if(m.warp!==undefined&&m.warp!==p.warp)return;
  if(![m.x,m.y,m.z,m.yaw,m.pitch].every(Number.isFinite)||!WEAPON_IDS.includes(m.weapon))return;
  if(p.lunging)return;
  const selected=this.gameMode==='gun-game'?GUN_GAME_STAGES[this.gunOrder[stageIndexForKills(p.kills)]].weapon:m.weapon==='aotd'&&p.aotdCharges<1?(p.aoteOwned?'aote':'rifle'):m.weapon==='aote'&&!p.aoteOwned?'rifle':m.weapon;
  if(selected!==p.weapon){p.reloading=null;p.reloadUntil=0;p.nextFire=Math.min(p.nextFire,this.time+.32);this.cancelShots(id,'weapon changed',selected);}
  Object.assign(p,{yaw:m.yaw,pitch:clamp(m.pitch,-1.5,1.5),weapon:selected,focused:m.focused===true});
 }
 inputs(id:string,inputs:MoveInput[]){
  const p=this.players.get(id);if(!p||!Array.isArray(inputs)||inputs.length>30)return;
  let c=this.controls.get(id);if(!c){c={queue:[],received:0,command:0,credit:0,warp:p.warp};this.controls.set(id,c);}
  if(c.warp!==p.warp){p.motion=motionAt(p);c.queue=[];c.credit=0;c.warp=p.warp;}
  for(const i of inputs){if(!validInput(i)||!WEAPON_IDS.includes(i.weapon)||i.warp!==p.warp||i.seq<=c.received||c.queue.length>=30)continue;c.received=i.seq;c.queue.push({...i});}
 }
 private result(id:string,c:Command,status:CommandResult['status'],reason:string,receivedAt=this.time){this.onResult?.({id,seq:c.seq,receivedAt,resolvedAt:this.time,status,reason});}
 private cancelShots(id:string,reason:string,keepWeapon?:Player['weapon']){const queue=this.pendingCommands.get(id);if(!queue)return;for(let i=queue.length-1;i>=0;i--)if(queue[i].action.type==='fire'&&queue[i].weapon!==keepWeapon){const c=queue.splice(i,1)[0];this.result(id,c,'rejected',reason,c.receivedAt);}}
 command(id:string,c:Command){
  const p=this.players.get(id);if(!p||!c||!Number.isSafeInteger(c.seq)||c.seq<=0)return;
  if(c.stage!==undefined&&c.stage!==p.gunGameStage||!Number.isSafeInteger(c.inputSeq)||c.inputSeq<0||c.warp!==p.warp||![c.at,c.viewAt,c.yaw,c.pitch].every(Number.isFinite)||c.at>this.time+.15||c.viewAt<0||c.viewAt>Math.min(c.at,this.time+.15)||c.at-c.viewAt>MAX_REWIND+.15||Math.abs(c.pitch)>1.5||Math.abs(c.yaw)>1e6||!WEAPON_IDS.includes(c.weapon)||typeof c.focused!=='boolean'||!c.action||!['fire','lunge','reload','ability','grenade','grapple','pickup','gadget'].includes(c.action.type)){this.result(id,c,'rejected','invalid command');return;}
  if(this.time-c.at>.4){this.result(id,c,'expired','command too old');return;}
  this.inputs(id,[]);const state=this.controls.get(id)!;if(c.seq<=state.command){this.result(id,c,'rejected','replayed command');return;}state.command=c.seq;
  // A later action cancels the single buffered fire, without bypassing its input dependency.
  if(c.action.type!=='fire')this.cancelShots(id,'cancelled by '+c.action.type);
  const queued=this.pendingCommands.get(id)??[];
  if(queued.length>=8||c.action.type==='fire'&&queued.some(q=>q.action.type==='fire')){this.result(id,c,'rejected','command buffer full');return;}
  queued.push({...c,action:{...c.action},receivedAt:this.time,stage:p.gunGameStage});this.pendingCommands.set(id,queued);this.flushCommands(id);
 }
 private flushCommands(id:string){
  const p=this.players.get(id),queue=this.pendingCommands.get(id);if(!p||!queue)return;
  while(queue.length){const c=queue[0];
   if(c.warp!==p.warp||p.hp<=0||this.winner||p.lunging||c.stage!==p.gunGameStage){queue.shift();this.result(id,c,'rejected','player state changed',c.receivedAt);continue;}
   if(this.time-c.receivedAt>.4||this.time-c.at>.4){queue.shift();this.result(id,c,'expired','input or cooldown wait expired',c.receivedAt);continue;}
   if((p.ack??0)<c.inputSeq)break;
   if(c.action.type==='fire'&&c.weapon===p.weapon&&p.nextFire>this.time)break;
   queue.shift();this.movement(id,{...p,yaw:c.yaw,pitch:c.pitch,weapon:c.weapon,focused:c.focused,warp:c.warp});
   const before=this.seq,oldReload=p.reloading;
   this.shotTime=clamp(c.viewAt,this.time-MAX_REWIND,this.time);this.activeCommand=c.seq;
   try{this.action(id,c.action);}finally{this.shotTime=null;this.activeCommand=undefined;}
   const accepted=c.action.type==='fire'?this.events.some(e=>e.id>before&&e.type==='shot'&&e.from===id):c.action.type==='reload'?!!p.reloading&&!oldReload:true;
   this.result(id,c,accepted?'accepted':'rejected',accepted?'executed':p.reloading?'reloading':'action unavailable',c.receivedAt);
  }
 }
 private moveHumans(dt:number){
  for(const [id,c] of this.controls){const p=this.players.get(id);if(!p){this.controls.delete(id);continue;}
   if(c.warp!==p.warp||!p.motion){p.motion=motionAt(p);c.queue=[];c.credit=0;c.warp=p.warp;}
   c.credit=Math.min(.25,c.credit+dt);
   if(p.hp<=0||p.lunging){c.queue=[];c.credit=0;continue;}
   if(this.gameMode==='parkour'&&p.motion!.body.grounded){const platform=courseFor(this.arenaId,this.courseSeed)[p.parkourStep??0];p.motion!.body.x+=platformAt(platform,this.time).x-platformAt(platform,this.time-dt).x;p.x=p.motion!.body.x;}
   while(c.queue.length&&c.credit+1e-8>=INPUT_STEP){const i=c.queue.shift()!;c.credit-=INPUT_STEP;if(i.warp!==p.warp)continue;
    this.movement(id,{...p,yaw:i.yaw,pitch:i.pitch,weapon:i.weapon,focused:i.focused,warp:i.warp});
    advanceMotion(p.motion!,i,p,this.modifiers,this.arena.colliders,this.arena.jumpPads,this.time);
    Object.assign(p,{x:p.motion!.body.x,y:p.motion!.body.y,z:p.motion!.body.z,grounded:p.motion!.body.grounded,ack:i.seq});
   }
   // Brief gaps can catch up. A silent client cannot suspend gravity indefinitely.
   if(!c.queue.length&&c.credit>=.25-1e-8){
    advanceMotion(p.motion!,{seq:c.received,warp:p.warp,forward:0,strafe:0,yaw:p.yaw,pitch:p.pitch,weapon:p.weapon,sprint:false,focused:false,jump:false,slide:false},p,this.modifiers,this.arena.colliders,this.arena.jumpPads,this.time,dt);
    Object.assign(p,{x:p.motion!.body.x,y:p.motion!.body.y,z:p.motion!.body.z,grounded:p.motion!.body.grounded});
   }
  }
 }
 event(e:Omit<GameEvent,'id'>){const event={...e,commandSeq:this.activeCommand,id:++this.seq};this.events.push(event);this.onEvent?.(event);if(this.events.length>100)this.events.shift();}
 action(id:string,a:Action){
  const p=this.players.get(id);if(!p||p.hp<=0||this.winner||p.lunging)return;
  if(a.type==='heal'||this.gameMode==='parkour')return;
  if(this.modifiers.infiniteMana)p.mana=100;
  if(this.gameMode==='gun-game'&&['pickup','gadget','grenade'].includes(a.type))return;
  if(a.type==='pickup'){
   const item=this.groundLoot.find(item=>(item.kind!=='nuke'||this.nukeUnlocked)&&(this.loot[item.id]||0)<=this.time&&dist(p,item)<2.9);
   if(!item)return;
   const o={x:p.x,y:p.y+1,z:p.z},len=dist(o,{...item,y:item.y+.8});const d={x:(item.x-o.x)/Math.max(.01,len),y:(item.y+.8-o.y)/Math.max(.01,len),z:(item.z-o.z)/Math.max(.01,len)};
   if(rayWorld(o,d,this.arena.colliders,len+.1)<len-.2)return;
   if(isGadget(item.kind)){p.gadget=item.kind;p.gadgetCharges=GADGETS[item.kind].charges*(this.modifiers.partyLoot&&item.kind!=='nuke'?2:1);p.gadgetUntil=0;}
   else if(item.kind==='rift_orb'){p.mana=100;p.abilityUntil=0;p.grappleUntil=0;p.healUntil=0;}
   else if(item.kind==='dragon_heart'){p.shield=100;p.hp=Math.min(100,p.hp+35);}
   else {if(item.kind==='aote')p.aoteOwned=true;if(item.kind==='aotd'){p.aotdCharges=1;p.abilityUntil=0;}p.weapon=item.kind;p.ammo[item.kind]=WEAPONS[item.kind].mag;p.reloading=null;if(!WEAPONS[item.kind].mag)p.mana=100;}
   this.loot[item.id]=this.time+22;this.event({type:'pickup',from:id,position:item,color:0xffd879,text:LOOT_LABELS[item.kind]});return;
  }
  if(a.type==='gadget'){this.useGadget(p);return;}
  if(a.type==='reload'){const w=weaponStats(p);if(w.mag&&p.ammo[p.weapon]<w.mag&&!p.reloading){p.reloading=p.weapon;p.reloadDuration=w.reload*(this.modifiers.fastReload?.35:1);p.reloadUntil=this.time+p.reloadDuration;}return;}
  if(a.type==='lunge'){this.startLunge(p);return;}
  if(a.type==='fire'){this.fire(p);return;}
  if(a.type==='ability'){
   if(this.gameMode==='gun-game'&&!gunStage(p)?.teleport)return;
   if(p.weapon==='aote'&&!p.aoteOwned)return;
   if(p.weapon==='aotd'&&p.aotdCharges<1)return;
   if(p.weapon!=='aotd'&&p.abilityUntil>this.time){this.event({type:'teleport',from:id,text:`Ability ready in ${Math.ceil(p.abilityUntil-this.time)}s`});return;}
   if((p.weapon==='aote'&&p.mana<15)){this.event({type:'teleport',from:id,text:'Not enough mana. Collect a Rift Orb or wait for regeneration.'});return;}
   const d=direction(p.yaw,p.pitch);
   if(p.weapon==='aote'&&p.mana>=15){
    const previous={x:p.x,y:p.y+1,z:p.z};const pos=safeBlink({...p,y:p.y+.035},d,this.arena.colliders,9);if(dist(p,pos)<.5){this.event({type:'teleport',from:id,text:'Path blocked. Aim at open space to teleport.'});return;}
    this.spendMana(p,15);p.abilityUntil=this.time+.22*this.modifiers.cooldownScale;Object.assign(p,pos);p.warp++;p.protectedUntil=0;
    this.event({type:'teleport',from:id,position:previous,end:{x:p.x,y:p.y+1,z:p.z},color:0x7fdfd0});
   }else if(p.weapon==='aotd'&&p.aotdCharges>0){
    p.protectedUntil=0;
    const eye={x:p.x,y:p.y+1.4,z:p.z};
    this.event({type:'blast',from:id,position:eye,end:{x:eye.x+d.x*13,y:eye.y+d.y*13,z:eye.z+d.z*13},color:0xeaaa78});
    for(const target of this.players.values()){
     if(target.id===id||target.hp<=0)continue;const v={x:target.x-eye.x,y:target.y+1-eye.y,z:target.z-eye.z};const length=Math.hypot(v.x,v.y,v.z);
     if(length<14&&length>0&&(v.x*d.x+v.y*d.y+v.z*d.z)/length>.63&&rayWorld(eye,{x:v.x/length,y:v.y/length,z:v.z/length},this.arena.colliders,length+.2)>=length-.4){
      this.damage(target,999,p,false);const shifted=safeBlink(target,{x:v.x/length,y:.22,z:v.z/length},this.arena.colliders,3.5);Object.assign(target,shifted);target.warp++;
     }
    }
    this.consumeAotd(p);
   }return;
  }
  if(a.type==='grapple'&&p.grappleUntil<=this.time&&p.mana>=10){
   const o={x:p.x,y:p.y+1.5,z:p.z},d=direction(p.yaw,p.pitch);const t=rayWorld(o,d,this.arena.colliders,28);
   if(t>=28||t<2){this.event({type:'grapple',from:id,text:'Aim the hook at a wall or tower within 28m.'});return;}
   const length=Math.hypot(d.x*t,d.y*t+.5,d.z*t);this.push(p,{x:d.x*t/length*21,y:Math.max(7,(d.y*t+.5)/length*21+4),z:d.z*t/length*21});
   this.spendMana(p,10);p.grappleUntil=this.time+1.5*this.modifiers.cooldownScale;this.event({type:'grapple',from:id,position:o,end:{x:o.x+d.x*t,y:o.y+d.y*t,z:o.z+d.z*t}});return;
  }
  if(a.type==='grenade'&&p.grenadeUntil<=this.time){
   const d=direction(p.yaw,p.pitch);p.grenadeUntil=this.time+3.5*this.modifiers.cooldownScale;p.protectedUntil=0;
   const g={id:++this.seq,owner:id,x:p.x+d.x*.6,y:p.y+1.5,z:p.z+d.z*.6,vx:d.x*20,vy:d.y*20+5,vz:d.z*20,expires:this.time+1.5};this.grenades.push(g);this.event({type:'grenade',from:id,position:g});
  }
 }
 private equipStage(p:Player){
  const index=this.gunOrder[stageIndexForKills(p.kills)],stage=GUN_GAME_STAGES[index];p.gunGameStage=index;p.weapon=stage.weapon;
  p.ammo={rifle:0,shotgun:0,sniper:0,aote:0,aotd:0};p.ammo[stage.weapon]=stage.stats.mag;p.aoteOwned=stage.weapon==='aote';p.aotdCharges=0;p.gadget=null;p.gadgetCharges=0;p.reloading=null;p.reloadUntil=0;p.reloadDuration=0;p.abilityUntil=0;
 }
 private grantPartyRelic(p:Player){const choices=GADGET_IDS.filter(id=>id!=='nuke');p.gadget=choices[Math.floor(Math.random()*choices.length)];p.gadgetCharges=GADGETS[p.gadget].charges*2;p.gadgetUntil=0;}
 private sight(from:Vec3,to:Vec3){const length=dist(from,to);if(length<.01)return true;return rayWorld(from,{x:(to.x-from.x)/length,y:(to.y-from.y)/length,z:(to.z-from.z)/length},this.arena.colliders,length+.1)>=length-.25;}
 private push(p:Player,velocity:Vec3){
  if(p.hp<=0)return;
  this.event({type:'push',to:p.id,end:velocity,position:{x:p.x,y:p.y,z:p.z}});
  if(p.motion){p.motion.impulse.x=clamp(p.motion.impulse.x+velocity.x,-22,22);p.motion.impulse.z=clamp(p.motion.impulse.z+velocity.z,-22,22);if(velocity.y>0){p.motion.body.vy=Math.max(p.motion.body.vy,velocity.y);p.motion.body.grounded=false;p.motion.body.jumps=Math.max(1,p.motion.body.jumps);}}
  const brain=this.brains.get(p.id);if(brain){brain.impulse??={x:0,y:0,z:0};brain.impulse.x=clamp(brain.impulse.x+velocity.x,-22,22);brain.impulse.z=clamp(brain.impulse.z+velocity.z,-22,22);if(velocity.y>0){brain.body.vy=Math.max(brain.body.vy,velocity.y);brain.body.grounded=false;}}
 }
 private pushAway(p:Player,from:Vec3,power:number,up:number){const length=Math.max(.1,Math.hypot(p.x-from.x,p.z-from.z));this.push(p,{x:(p.x-from.x)/length*power,y:up,z:(p.z-from.z)/length*power});}
 private useGadget(p:Player){
  const kind=p.gadget;if(!kind||!isGadget(kind)||p.gadgetCharges<1||p.gadgetUntil>this.time||p.reloading)return;
  const eye={x:p.x,y:p.y+1.4,z:p.z},d=direction(p.yaw,p.pitch);const color=GADGETS[kind].color;
  if(kind==='nuke'){
   if(!this.nukeUnlocked)return;
   const g:Grenade={id:++this.seq,owner:p.id,kind:'nuke',x:eye.x+d.x*.8,y:eye.y,z:eye.z+d.z*.8,vx:d.x*13,vy:d.y*13+3,vz:d.z*13,expires:this.time+3};this.grenades.push(g);this.event({type:'gadget',from:p.id,text:kind,position:eye,color});
  }else if(kind==='swap_pearl'){
   const target=[...this.players.values()].filter(t=>t.id!==p.id&&t.hp>0&&t.protectedUntil<=this.time).filter(t=>{const center={x:t.x,y:t.y+1.1,z:t.z},length=dist(eye,center);return length<28&&length>.5&&((center.x-eye.x)*d.x+(center.y-eye.y)*d.y+(center.z-eye.z)*d.z)/length>.985&&this.sight(eye,center);}).sort((a,b)=>dist(a,p)-dist(b,p))[0];
   if(!target){this.event({type:'gadget',from:p.id,text:'Aim the pearl at a visible rival within 28m.'});return;}
   const previous={x:p.x,y:p.y,z:p.z};Object.assign(p,{x:target.x,y:target.y,z:target.z});Object.assign(target,previous);p.warp++;target.warp++;
   this.event({type:'teleport',from:p.id,position:previous,end:{x:p.x,y:p.y,z:p.z},color});this.event({type:'gadget',from:p.id,text:kind,position:previous,color});
  }else if(kind==='ice_wand'){
   this.event({type:'gadget',from:p.id,text:kind,position:eye,end:{x:eye.x+d.x*12,y:eye.y+d.y*12,z:eye.z+d.z*12},color});
   for(const t of this.players.values()){if(t.id===p.id||t.hp<=0||t.protectedUntil>this.time)continue;const center={x:t.x,y:t.y+1,z:t.z},length=dist(eye,center);if(length<12&&length>0&&((center.x-eye.x)*d.x+(center.y-eye.y)*d.y+(center.z-eye.z)*d.z)/length>.72&&this.sight(eye,center)){t.chilledUntil=this.time+3;this.damage(t,10,p);}}
  }else if(kind==='bonzo_staff'){
   const g:Grenade={id:++this.seq,owner:p.id,kind:'bonzo',x:eye.x+d.x*.6,y:eye.y,z:eye.z+d.z*.6,vx:d.x*18,vy:d.y*18+3,vz:d.z*18,expires:this.time+1.1};this.grenades.push(g);
   this.event({type:'gadget',from:p.id,text:kind,position:eye,color});
  }else if(kind==='rocket_boots'){
   this.push(p,{x:d.x*9,y:16,z:d.z*9});
   for(const t of this.players.values())if(t.id!==p.id&&t.hp>0&&t.protectedUntil<=this.time&&dist(p,t)<6&&this.sight(eye,{x:t.x,y:t.y+1,z:t.z}))this.pushAway(t,p,15,8);
   this.event({type:'gadget',from:p.id,text:kind,position:{x:p.x,y:p.y+.2,z:p.z},color});
  }else{
   const pos=kind==='gravity_orb'?safeBlink(p,{x:d.x,y:0,z:d.z},this.arena.colliders,8):{x:p.x,y:p.y,z:p.z};
   const field:Field={id:++this.seq,owner:p.id,kind,x:pos.x,y:pos.y+.15,z:pos.z,radius:kind==='gravity_orb'?7:6,expires:this.time+(kind==='gravity_orb'?5:8),nextPulse:this.time};
   this.fields.push(field);if(this.fields.length>16)this.fields.shift();this.event({type:'gadget',from:p.id,text:kind,position:field,color});
  }
  p.protectedUntil=0;p.gadgetCharges--;p.gadgetUntil=this.time+.65*this.modifiers.cooldownScale;if(p.gadgetCharges<=0)p.gadget=null;
 }
 private updateFields(dt:number){
  this.fields=this.fields.filter(f=>f.expires>this.time);
  for(const field of this.fields){
   const pulse=field.nextPulse<=this.time;if(pulse)field.nextPulse=this.time+.2;
   for(const p of this.players.values()){
    if(p.hp<=0||dist(p,field)>field.radius||!this.sight({...field,y:field.y+1},{x:p.x,y:p.y+1,z:p.z}))continue;
    if(field.kind==='healing_totem')p.hp=Math.min(100,p.hp+12*dt);
    else if(pulse&&p.id!==field.owner&&p.protectedUntil<=this.time){const length=Math.max(1,Math.hypot(field.x-p.x,field.z-p.z));this.push(p,{x:(field.x-p.x)/length*3.2,y:0,z:(field.z-p.z)/length*3.2});}
   }
  }
 }
 private startLunge(p:Player){
  if(weaponStats(p).mag||p.lungeUntil>this.time||p.nextFire>this.time||p.reloading)return;
  if(p.weapon==='aote'&&!p.aoteOwned||p.weapon==='aotd'&&p.aotdCharges<1)return;
  const target=swordTarget(p,this.players.values(),this.arena.colliders);
  if(!target){this.event({type:'lunge',from:p.id,text:'Aim at a visible opponent within 24m.'});return;}
  const length=Math.max(.01,dist(p,target)),speed=32;
  const body:Body={x:p.x,y:p.y,z:p.z,vx:(target.x-p.x)/length*speed,vy:(target.y-p.y)/length*speed,vz:(target.z-p.z)/length*speed,grounded:p.grounded,jumps:0};
  this.lunges.set(p.id,{body,target:target.id,life:p.life,targetLife:target.life,expires:this.time+Math.min(.85,length/speed+.12),weapon:p.weapon,stage:p.gunGameStage,damage:weaponStats(p).damage,source:gunStage(p)?.id??p.weapon});
  p.lunging=true;p.lungeUntil=this.time+1.2;p.nextFire=p.lungeUntil;p.protectedUntil=0;
  this.event({type:'lunge',from:p.id,to:target.id,position:{x:p.x,y:p.y+1,z:p.z},end:{x:target.x,y:target.y+1,z:target.z}});
 }
 private updateLunges(dt:number){
  for(const [id,launch] of this.lunges){
   const p=this.players.get(id),target=this.players.get(launch.target);
   const valid=p&&p.hp>0&&p.life===launch.life&&p.weapon===launch.weapon&&p.gunGameStage===launch.stage&&target&&target.hp>0&&target.life===launch.targetLife;
   let strike=false,stopped=!valid||this.time>=launch.expires;
   if(valid&&!stopped){
    // Small slices prevent both wall tunnelling and skipping past an opponent.
    for(let elapsed=0;elapsed<dt&&!stopped;elapsed+=.005){
     const length=dist(launch.body,target),origin={x:launch.body.x,y:launch.body.y+1,z:launch.body.z};
     const aim={x:(target.x-launch.body.x)/Math.max(.01,length),y:(target.y-launch.body.y)/Math.max(.01,length),z:(target.z-launch.body.z)/Math.max(.01,length)};
     if(length<2&&rayWorld(origin,aim,this.arena.colliders,length)>=length-.05){strike=true;stopped=true;break;}
     const before={x:launch.body.x,y:launch.body.y,z:launch.body.z};
     stepBody(launch.body,Math.min(.005,dt-elapsed),this.arena.colliders,1.8,0);
     if(dist(before,launch.body)<.001)stopped=true;
    }
    Object.assign(p,{x:launch.body.x,y:launch.body.y,z:launch.body.z,grounded:launch.body.grounded});
   }
   if(stopped){
    this.lunges.delete(id);
    if(!p||p.life!==launch.life)continue;
    p.lunging=false;p.warp++;
    this.event({type:'lunge',from:id,position:{x:p.x,y:p.y+1,z:p.z},text:'finished'});
    if(strike&&target)this.damage(target,launch.damage,p,false,{source:launch.source});
    if(launch.weapon==='aotd'&&p.hp>0)this.consumeAotd(p);
   }
  }
 }
 private consumeAotd(p:Player){p.aotdCharges=0;p.weapon=p.aoteOwned?'aote':'rifle';this.event({type:'consume',from:p.id,text:'AOTD spent. Find another drop.'});}
 fire(p:Player){
  if(p.weapon==='aote'&&!p.aoteOwned)return;
  if(p.weapon==='aotd'&&p.aotdCharges<1)return;const firedWeapon=p.weapon;const firedStage=gunStage(p),firedIndex=p.gunGameStage;
  const w=weaponStats(p);if(p.nextFire>this.time||p.reloading)return;
  if(w.mag&&p.ammo[p.weapon]<=0){this.action(p.id,{type:'reload'});return;}
  if(w.mag)p.ammo[p.weapon]--;p.nextFire=this.time+w.interval;p.protectedUntil=0;
  const origin={x:p.x,y:p.y+1.55,z:p.z};
  const isSword=!w.mag;
  for(let pellet=0;pellet<w.pellets;pellet++){
   const angle=(pellet/Math.max(1,w.pellets))*Math.PI*2;const spread=w.pellets>1?w.spread*(pellet===0?0:1):w.spread;
   const accuracy=p.focused?(p.weapon==='shotgun'?.62:.16):1;const d=direction(p.yaw+Math.cos(angle)*spread*accuracy,p.pitch+Math.sin(angle)*spread*accuracy);
   let closest=rayWorld(origin,d,this.arena.colliders,w.range);let hit:Player|undefined;let headshot=false;
   for(const target of this.players.values()){
    if(target.id===p.id||target.hp<=0)continue;
    if(isSword){
     const dx=target.x-p.x,dz=target.z-p.z,length=Math.hypot(dx,dz);const dot=(dx*d.x+dz*d.z)/Math.max(.001,length);
     const toward={x:dx/Math.max(.01,length),y:0,z:dz/Math.max(.01,length)};
     if(length<w.range&&Math.abs(target.y-p.y)<2&&dot>.42&&length<closest&&rayWorld(origin,toward,this.arena.colliders,length+.2)>=length-.35){closest=length;hit=target;headshot=raySphere(origin,d,{x:target.x,y:target.y+1.55,z:target.z},.35)<w.range;}
    }else{
     const position=this.shotTime===null?target:historicalPosition(this.hitHistory,target,this.shotTime);if(!position)continue;
     const head=raySphere(origin,d,{x:position.x,y:position.y+1.55,z:position.z},.29);
     const chest=raySphere(origin,d,{x:position.x,y:position.y+.98,z:position.z},.47);
     const legs=raySphere(origin,d,{x:position.x,y:position.y+.4,z:position.z},.37);
     const t=Math.min(head,chest,legs);if(t<closest){closest=t;hit=target;headshot=head<=chest&&head<=legs;}
    }
   }
   const end={x:origin.x+d.x*closest,y:origin.y+d.y*closest,z:origin.z+d.z*closest};
   this.event({type:'shot',from:p.id,position:origin,end,color:w.color,text:firedWeapon,pellet,variant:firedIndex??undefined});
   if(hit)this.damage(hit,headshot?(firedStage?.headshotDamage??(firedWeapon==='rifle'?100:999)):w.damage,p,headshot,{source:firedStage?.id??firedWeapon});
   if(firedIndex!==p.gunGameStage)break;
  }
  if(firedWeapon==='aotd')this.consumeAotd(p);
 }
 damage(target:Player,amount:number,attacker?:Player,headshot=false,options:{source?:string;credit?:boolean;record?:boolean;deferWin?:boolean}={}){
  if(this.gameMode==='parkour')return;
  if(target.hp<=0||target.protectedUntil>this.time||this.winner)return;
  if(attacker?.bot&&!this.modifiers.oneTap&&options.source!=='nuke')amount=Math.min(amount*.5,12);
  const damage=Math.min(this.modifiers.oneTap&&amount>0?999:Math.round(amount),target.hp+target.shield);const absorbed=Math.min(target.shield,damage);target.shield-=absorbed;target.hp=Math.max(0,target.hp-(damage-absorbed));if(damage>0)target.lastHitAt=this.time;
  if(attacker&&attacker.id!==target.id&&damage>0&&options.record!==false){let entries=this.recentDamage.get(target.id);if(!entries){entries=new Map();this.recentDamage.set(target.id,entries);}entries.set(attacker.id,{at:this.time,attackerLife:attacker.life,targetLife:target.life});}
  if(attacker&&attacker.id!==target.id&&damage>0&&options.credit!==false){if(this.modifiers.vampiric&&attacker.hp>0)attacker.hp=Math.min(100,attacker.hp+damage*.25);if(this.modifiers.knockback&&target.hp>0)this.pushAway(target,attacker,10,5);}
  this.event({type:'hit',from:attacker?.id,to:target.id,value:Math.max(0,Math.floor(damage+1e-6)),headshot,position:{x:target.x,y:target.y+1.3,z:target.z}});
  if(target.hp<=0){
   this.clearDamageHistory(target.id);target.deaths++;target.deadUntil=this.time+(this.modifiers.instantRespawn?.05:3);target.reloading=null;
   if(attacker&&attacker.id!==target.id&&options.credit!==false){attacker.kills++;attacker.mana=Math.min(100,attacker.mana+20);}
   this.event({type:'kill',from:options.credit===false?undefined:attacker?.id,to:target.id,text:options.source||attacker?.weapon,headshot,position:{x:target.x,y:target.y+1,z:target.z}});
   if(this.gameMode==='gun-game'&&attacker&&attacker.id!==target.id&&options.credit!==false&&attacker.kills<TARGET_KILLS){this.equipStage(attacker);attacker.nextFire=this.time+.32;}
   this.checkNukeUnlock();
   if(attacker&&options.credit!==false&&!options.deferWin&&attacker.kills>=TARGET_KILLS){this.winner=attacker.id;this.event({type:'end',from:attacker.id});}
  }
 }
 private clearDamageHistory(id:string){this.recentDamage.delete(id);for(const entries of this.recentDamage.values())entries.delete(id);}
 private checkNukeUnlock(){if(this.gameMode==='ffa'&&!this.nukeUnlocked&&[...this.players.values()].some(p=>p.kills>=10)){this.nukeUnlocked=true;this.event({type:'announcement',text:'NUKE DROP UNLOCKED',color:0xffc247});}}
 private detonateNuke(g:Grenade){
  this.event({type:'explode',from:g.owner,position:{x:g.x,y:g.y,z:g.z},text:'nuke',color:0xffc247,value:26});
  const owner=this.players.get(g.owner);const victims=[...this.players.values()].filter(p=>p.hp>0&&dist(p,g)<=26);
  // Snapshot eligibility before the simultaneous blast. The blast never tags its own victims.
  const eligible=new Set(victims.filter(target=>{const hit=this.recentDamage.get(target.id)?.get(g.owner);return owner&&owner.hp>0&&owner.id!==target.id&&hit&&this.time-hit.at<=15&&hit.attackerLife===owner.life&&hit.targetLife===target.life;}).map(p=>p.id));
  for(const target of victims)this.damage(target,999,owner,false,{source:'nuke',credit:eligible.has(target.id),record:false,deferWin:true});
  if(owner&&owner.kills>=TARGET_KILLS&&!this.winner){this.winner=owner.id;this.event({type:'end',from:owner.id});}
 }
 tick(dt:number){
  this.hitHistory.push({time:this.time,players:[...this.players.values()].map(p=>({...p}))});this.hitHistory=this.hitHistory.filter(f=>f.time>=this.time-MAX_REWIND-.05);
  this.time+=dt;if(this.winner)return;if(this.gameMode==='parkour'){const bounds=courseColliders(this.arenaId,this.courseSeed,this.time);bounds.forEach((b,i)=>Object.assign(this.arena.colliders[i],b));}this.updateLunges(dt);this.moveHumans(dt);for(const id of this.pendingCommands.keys())this.flushCommands(id);this.checkNukeUnlock();
  for(const p of this.players.values()){
   if(p.hp<=0){if(this.time>=p.deadUntil)this.spawn(p);continue;}
   p.mana=this.modifiers.infiniteMana?100:Math.min(100,p.mana+16*dt);
   if(this.modifiers.shieldRegen&&this.time-p.lastHitAt>=5)p.shield=Math.min(100,p.shield+8*dt);
   if(p.reloading&&p.reloadUntil<=this.time){p.ammo[p.reloading]=weaponStats(p).mag;p.reloading=null;p.reloadUntil=0;}
   if(this.gameMode==='parkour'){this.updateParkour(p);continue;}
   if(p.y < -22)this.damage(p,999);
   for(const item of this.arena.pickups){
    if((this.pickups[item.id]||0)>this.time||dist({x:p.x,y:p.y+.8,z:p.z},item)>1.7)continue;
    if(item.kind==='health'){if(p.hp>=100)continue;p.hp=Math.min(100,p.hp+45);}
    if(item.kind==='shield'){if(p.shield>=100)continue;p.shield=Math.min(100,p.shield+50);}
    if(item.kind==='mana'){if(p.mana>=100)continue;p.mana=Math.min(100,p.mana+60);}
    if(item.kind==='haste')p.hasteUntil=this.time+10;
    this.pickups[item.id]=this.time+16;this.event({type:'pickup',from:p.id,position:item,color:PICKUP_COLORS[item.kind],text:item.kind});
   }
  }
  this.updateFields(dt);
  this.updateBots(dt);
  for(let i=this.grenades.length-1;i>=0;i--){
   const g=this.grenades[i];g.vy-=18*dt;
   for(const axis of ['x','y','z'] as const){const v=axis==='x'?'vx':axis==='y'?'vy':'vz';g[axis]+=g[v]*dt;
    for(const c of this.arena.colliders){if(g.x+.12>c.minX&&g.x-.12<c.maxX&&g.z+.12>c.minZ&&g.z-.12<c.maxZ&&g.y+.12>c.minY&&g.y-.12<c.maxY){g[axis]-=g[v]*dt;g[v]*=-.42;break;}}
   }
   if(g.expires<=this.time){
    if(g.kind==='nuke'){this.detonateNuke(g);this.grenades.splice(i,1);continue;}
    this.event({type:'explode',from:g.owner,position:{...g},color:g.kind==='bonzo'?0xff8dc4:0xf1be85,text:g.kind});
    for(const p of this.players.values()){const center={x:p.x,y:p.y+.8,z:p.z};const r=dist(g,center);if(r<6){const d={x:(center.x-g.x)/Math.max(.01,r),y:(center.y-g.y)/Math.max(.01,r),z:(center.z-g.z)/Math.max(.01,r)};if(rayWorld(g,d,this.arena.colliders,r+.1)>=r-.3){if(g.kind==='bonzo'){this.damage(p,32*(1-r/7),this.players.get(g.owner),false,{source:'bonzo_staff'});if(p.hp>0&&p.protectedUntil<=this.time)this.pushAway(p,g,13,9);}else this.damage(p,40*(1-r/7),this.players.get(g.owner));}}}
    this.grenades.splice(i,1);
   }
  }
 }
 updateBots(dt:number){
  for(const [id,brain] of this.brains){
   const p=this.players.get(id)!;if(p.hp<=0||p.lunging)continue;const b=brain.body;
   if(dist(b,p)>1.5)Object.assign(b,{x:p.x,y:p.y,z:p.z,vx:0,vy:0,vz:0});
   if(this.gameMode==='parkour'){
    const route=courseFor(this.arenaId,this.courseSeed),standing=route[p.parkourStep??0];if(b.grounded)b.x+=platformAt(standing,this.time).x-platformAt(standing,this.time-dt).x;
    const target=platformAt(route[Math.min(PARKOUR_LENGTH,(p.parkourStep??0)+1)],this.time),dx=target.x-b.x,dz=target.z-b.z,len=Math.hypot(dx,dz);
    p.yaw=Math.atan2(-dx,-dz);
    if(b.grounded&&this.time>=brain.nextThink){b.vy=9;b.jumps=1;b.grounded=false;brain.nextThink=this.time+1.5+Math.random()*2;brain.phase=Math.random()*2-1;}
    if(!b.grounded&&b.jumps===1&&b.vy<1){b.jumps=2;if(Math.random()<.3)b.vy=10;}
    b.vx=dx/Math.max(.1,len)*6+brain.phase*1.6;b.vz=dz/Math.max(.1,len)*6;
    if(b.grounded&&this.time<brain.nextThink){b.vx=0;b.vz=0;}
    stepBody(b,dt,this.arena.colliders);Object.assign(p,{x:b.x,y:b.y,z:b.z,grounded:b.grounded});this.updateParkour(p);continue;
   }
   const eye={x:p.x,y:p.y+1.5,z:p.z};
   const targets=[...this.players.values()].filter(t=>t.id!==id&&t.hp>0&&t.protectedUntil<=this.time).sort((a,c)=>dist(p,a)-dist(p,c));
   let target=targets.find(t=>{const len=dist(eye,{x:t.x,y:t.y+1.1,z:t.z});const d={x:(t.x-eye.x)/len,y:(t.y+1.1-eye.y)/len,z:(t.z-eye.z)/len};return rayWorld(eye,d,this.arena.colliders,len+.1)>len-.3;});
   const sees=!!target;target??=targets[0];
   if(target){
    const dx=target.x-p.x,dz=target.z-p.z,r=Math.hypot(dx,dz);
    p.yaw=Math.atan2(-dx,-dz);p.pitch=Math.atan2(target.y+1.15-(p.y+1.55),r);
    const wander=Math.sin(this.time*.8+brain.phase);
    const range=weaponStats(p).range,melee=!weaponStats(p).mag;const toward=melee?(r>range*.7?1:.08):r>13?1:r<7?-.5:.15;let vx=dx/Math.max(1,r)*toward,dvz=dz/Math.max(1,r)*toward;
    if(sees){vx+=dz/Math.max(1,r)*wander*.6;dvz-=dx/Math.max(1,r)*wander*.6;}
    else {const lane=Math.sin(this.time*.45+brain.phase);vx+=lane*.7;dvz+=Math.cos(this.time*.45+brain.phase)*.7;}
    const speed=(sees?4.5:6)*this.modifiers.speed*(p.chilledUntil>this.time?.35:1);const l=Math.max(1,Math.hypot(vx,dvz));b.vx=vx/l*speed;b.vz=dvz/l*speed;
    const ahead={x:b.x+b.vx*.2,y:b.y,z:b.z+b.vz*.2};
    if(blocked(ahead,this.arena.colliders)&&b.grounded){b.vy=9*this.modifiers.jump;b.grounded=false;b.jumps=1;}
    if(Math.abs(b.x)>39)b.vx=-Math.sign(b.x)*6;if(Math.abs(b.z)>39)b.vz=-Math.sign(b.z)*6;
    if(sees&&r<65&&this.time>=brain.nextThink){if(this.gameMode==='ffa')p.weapon=r<7?'shotgun':'rifle';p.yaw+=Math.sin(this.time*3+brain.phase)*.075;p.pitch+=Math.cos(this.time*2+brain.phase)*.035;this.action(id,{type:'fire'});brain.nextThink=this.time+.3+Math.random()*.3;}
    if(p.ammo[p.weapon]===0)this.action(id,{type:'reload'});
   }else {b.vx=0;b.vz=0;}
   for(const pad of this.arena.jumpPads){if(b.grounded&&Math.hypot(b.x-pad.x,b.z-pad.z)<pad.radius&&Math.abs(b.y-pad.y)<.5){b.vy=pad.power*Math.sqrt(this.modifiers.jump);b.grounded=false;}}
   if(brain.impulse){b.vx+=brain.impulse.x;b.vz+=brain.impulse.z;brain.impulse.x*=Math.exp(-dt*2.5);brain.impulse.z*=Math.exp(-dt*2.5);}
   stepBody(b,dt,this.arena.colliders,1.8,this.modifiers.lowGravity?9:22);Object.assign(p,{x:b.x,y:b.y,z:b.z,grounded:b.grounded});
  }
 }
 private updateParkour(p:Player){
  if(this.winner)return;
  const course=courseFor(this.arenaId,this.courseSeed),step=p.parkourStep??0,next=course[step+1]?platformAt(course[step+1],this.time):null;
  if(next&&p.grounded&&Math.abs(p.y-next.y)<.15&&Math.abs(p.x-next.x)<next.width/2&&Math.abs(p.z-next.z)<next.depth/2){
   p.parkourStep=step+1;
   if(next.isCheckpoint){p.checkpoint=step+1;this.event({type:'announcement',from:p.id,text:`${p.name}: checkpoint ${(step+1)/CHECKPOINT_INTERVAL} / ${PARKOUR_LENGTH/CHECKPOINT_INTERVAL}`});}
   if(step+1===PARKOUR_LENGTH){this.winner=p.id;this.event({type:'end',from:p.id});return;}
  }
  if(p.y<course[p.checkpoint??0].y-5){p.falls=(p.falls??0)+1;p.parkourStep=p.checkpoint??0;this.spawn(p);}
 }
 snapshot():Snapshot{for(const [id,c] of this.controls){const p=this.players.get(id);if(p&&c.warp!==p.warp){p.motion=motionAt(p);c.queue=[];c.credit=0;c.warp=p.warp;}}return {time:this.time,arenaId:this.arenaId,gameMode:this.gameMode,gunOrder:[...this.gunOrder],courseSeed:this.courseSeed,nukeUnlocked:this.nukeUnlocked,players:[...this.players.values()].map(p=>({...p,motion:p.motion?structuredClone(p.motion):undefined,appearance:{...p.appearance},ammo:{...p.ammo}})),pickups:{...this.pickups},loot:{...this.loot},modifiers:{...this.modifiers},grenades:this.grenades.map(g=>({...g})),fields:this.fields.map(f=>({...f})),winner:this.winner,round:this.round,events:[...this.events]};}
 restart(){this.hitHistory=[];for(const [id,queue] of this.pendingCommands)for(const c of queue)this.result(id,c,'rejected','round restarted',c.receivedAt);this.pendingCommands.clear();this.courseSeed=(this.courseSeed+1)>>>0;if(this.gameMode==='parkour')this.arena.colliders=courseColliders(this.arenaId,this.courseSeed);this.gunOrder=shuffledGunOrder();this.winner=null;this.nukeUnlocked=false;this.recentDamage.clear();this.round++;this.grenades=[];this.fields=[];this.events=[];this.pickups={};this.loot={};for(const p of this.players.values()){p.kills=0;p.deaths=0;p.parkourStep=0;p.checkpoint=0;p.falls=0;this.spawn(p);}}
}
