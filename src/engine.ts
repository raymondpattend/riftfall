import * as THREE from 'three';
import {createArenaFor,ARENAS} from './assets/arena-variants';
import type {ArenaId} from './world-types';
import {DEFAULT_APPEARANCE,sanitizeAppearance} from './cosmetics';
import type {Appearance} from './cosmetics';
import {createAvatar,createPickup} from './assets/characters';
import {GUN_GAME_STAGES,gunStage,weaponStats} from './gun-game';
import type {GameMode} from './gun-game';
import {createGunGameWeapon} from './assets/gun-game-weapons';
import {createWeapon,createHands} from './assets/weapons';
import {createGadget} from './assets/gadgets';
import {GADGETS,isGadget} from './gadgets';
import type {GadgetId} from './gadgets';
import {createGroundLoot} from './assets/loot';
import {GROUND_LOOT,LOOT_LABELS,LOOT_DESCRIPTIONS} from './loot-rules';
import {DEFAULT_MODIFIERS} from './modifiers';
import type {Modifiers} from './modifiers';
import {CombatEffects} from './assets/effects';
import {GameAudio} from './audio';
import {Simulation} from './simulation';
import {Network,roomCode} from './network';
import type {Packet} from './network';
import {WEAPONS,WEAPON_IDS,clamp,direction,dist} from './rules';
import type {Player,Snapshot,Action,GameEvent,Vec3} from './rules';
import type {WeaponId} from './world-types';
import {stepBody} from './physics';
import type {Body} from './physics';

type Mode='menu'|'practice'|'host'|'join';
export interface Settings {sensitivity:number;volume:number;quality:'high'|'low';fov:number;}
export interface Feed {id:number;attacker:string;victim:string;weapon:string;own:boolean;at:number;}
export interface ViewState {mode:Mode;locked:boolean;scoreboard:boolean;player:Player|null;snapshot:Snapshot|null;room:string;fps:number;ping:number;notice:string;error:string;hitUntil:number;hurtUntil:number;lastDamage:number;damageHeadshot:boolean;accolade:{id:number;title:string;detail:string}|null;spreadMarks:{id:number;x:number;y:number}[];arenaId:ArenaId;feed:Feed[];localId:string;aiming:boolean;focused:boolean;slide:boolean;jumps:number;lootNearby:{name:string;description:string}|null;}
type Avatar=ReturnType<typeof createAvatar>;
const v3=(v:Vec3)=>new THREE.Vector3(v.x,v.y,v.z);
export class GameEngine {
 readonly renderer:THREE.WebGLRenderer;readonly scene=new THREE.Scene();readonly camera=new THREE.PerspectiveCamera(85,1,.1,400);
 gameMode:GameMode='ffa';arenaId:ArenaId='crown';arena=createArenaFor('crown');appearance:Appearance={...DEFAULT_APPEARANCE};readonly audio=new GameAudio();readonly effects:CombatEffects;
 readonly body:Body={x:0,y:0,z:0,vx:0,vy:0,vz:0,grounded:true,jumps:0};
 sim:Simulation|null=null;network:Network|null=null;snapshot:Snapshot|null=null;mode:Mode='menu';localId='host';room='';
 settings:Settings={sensitivity:1,volume:.3,quality:'high',fov:85};
 modifiers:Modifiers={...DEFAULT_MODIFIERS};private swapStart=-10;private swapUntil=-10;private pendingWeapon:WeaponId|null=null;private hands=new THREE.Group();private fieldMeshes=new Map<number,THREE.Group>();private gadgetMeshes=new Map<GadgetId,THREE.Group>();private gadgetRoot=new THREE.Group();private gadgetUseUntil=0;
 private previewingAppearance=false;private previewAngle=0;private equippedStage:number|null=null;private variantMeshes=new Map<number,THREE.Group>();private lobbyScene=new THREE.Scene();private lobbyCamera=new THREE.PerspectiveCamera(50,1,.1,30);private lootMeshes=new Map<string,THREE.Group>();private swingUntil=0;private trackpadFiring=false;private fireBufferedUntil=0;private lastAbility=-10;
 private viewScene=new THREE.Scene();private viewCamera=new THREE.PerspectiveCamera(60,1,.01,10);private weaponRoot=new THREE.Group();private weaponMeshes=new Map<WeaponId,THREE.Group>();
 private avatars=new Map<string,{asset:Avatar;previous:THREE.Vector3}>();private items=new Map<string,THREE.Group>();private grenadeMeshes=new Map<number,THREE.Object3D>();private hero:Avatar;
 private keys=new Set<string>();private locked=false;private mouseDown=false;private rightDown=false;private scoreboard=false;private yaw=0;private pitch=0;private weapon:WeaponId='rifle';
 private time=0;private lastTime=0;private networkTime=0;private uiTime=0;private pingTime=0;private eventId=0;private warp=-1;private recoil=0;private stepTime=0;private slideUntil=0;private slideDirection=new THREE.Vector2();private launchUntil=0;private impulse=new THREE.Vector3();
 private damageHeadshot=false;private accolade:{id:number;title:string;detail:string}|null=null;private accoladeUntil=0;private lastKillTime=-20;private killChain=0;private spreadMarks:{id:number;x:number;y:number;until:number}[]=[];private cameraKick=0;private cameraSideKick=0;
 private hitUntil=0;private hurtUntil=0;private lastDamage=0;private feed:Feed[]=[];private notice='';private noticeUntil=0;private error='';private fps=60;private running=true;private raf=0;private lastFire=0;private lastStateAt=0;private resizeObserver:ResizeObserver;private abort=new AbortController();
 private onView:(view:ViewState)=>void;private reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 constructor(private container:HTMLElement,onView:(view:ViewState)=>void){
  this.onView=onView;
  this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.18;
  this.renderer.domElement.setAttribute('aria-label','Riftfall 3D arena');this.renderer.domElement.tabIndex=0;container.appendChild(this.renderer.domElement);
  this.scene.background=new THREE.Color(0x65bdff);this.scene.fog=new THREE.Fog(0x9cd8ff,120,285);
  this.scene.add(new THREE.HemisphereLight(0xffffff,0x6387b4,2.3));
  const sun=new THREE.DirectionalLight(0xffffff,2.5);sun.position.set(-28,65,32);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-60,right:60,top:60,bottom:-60,near:1,far:150});sun.shadow.bias=-.00035;sun.shadow.normalBias=.06;this.scene.add(sun);
  this.scene.add(this.arena.group);
  const sunDisc=new THREE.Mesh(new THREE.SphereGeometry(22,32,16),new THREE.MeshBasicMaterial({color:0xfff9df,fog:false}));sunDisc.position.set(-120,24,-165);this.scene.add(sunDisc);
  const cloudMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,flatShading:true});const cloudGeo=new THREE.IcosahedronGeometry(1,1);
  for(let i=0;i<24;i++){const a=i*2.399,r=105+(i%4)*20;const mesh=new THREE.Mesh(cloudGeo,cloudMat);mesh.position.set(Math.cos(a)*r,-12+(i%5)*5,Math.sin(a)*r);mesh.scale.set(12+(i%3)*7,2+(i%4),8+(i%4)*3);this.scene.add(mesh);}
  this.effects=new CombatEffects(this.scene);
  for(const item of this.arena.pickups){const mesh=createPickup(item.kind);mesh.position.set(item.x,item.y-.35,item.z);this.scene.add(mesh);this.items.set(item.id,mesh);}
  this.hero=createAvatar(0x4599ff);this.hero.setName('');this.hero.group.traverse(child=>{if(child instanceof THREE.Sprite)child.visible=false;});this.hero.group.position.set(1.8,-1.6,-6.8);this.hero.group.scale.setScalar(2.1);this.hero.group.rotation.y=Math.PI+.25;this.lobbyScene.add(this.hero.group);
  this.lobbyScene.add(new THREE.HemisphereLight(0xffffff,0x487dd0,3));const heroLight=new THREE.DirectionalLight(0xffffff,3);heroLight.position.set(-2,5,4);this.lobbyScene.add(heroLight);const pedestal=new THREE.Mesh(new THREE.CylinderGeometry(1.45,1.7,.14,48),new THREE.MeshStandardMaterial({color:0x88dfff,metalness:.2,roughness:.5}));pedestal.name='Lobby platform';pedestal.position.set(1.8,-1.7,-6.8);this.lobbyScene.add(pedestal);
  for(const item of this.groundLoot){const mesh=createGroundLoot(item.kind);mesh.position.set(item.x,item.y,item.z);this.scene.add(mesh);this.lootMeshes.set(item.id,mesh);}
  this.viewScene.add(new THREE.HemisphereLight(0xfff4e5,0x768e8b,3));const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(-3,4,3);this.viewScene.add(key);this.viewScene.add(this.weaponRoot);this.viewScene.add(this.gadgetRoot);this.gadgetRoot.visible=false;
  this.hands=createHands();this.weaponRoot.add(this.hands);
  for(const id of WEAPON_IDS){const mesh=createWeapon(id);mesh.visible=id==='rifle';this.weaponRoot.add(mesh);this.weaponMeshes.set(id,mesh);}
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();this.bindInput();
  this.raf=requestAnimationFrame(this.frame);
  if(import.meta.env.DEV)(window as unknown as {__riftfall:GameEngine}).__riftfall=this;
 }
 private resize(){const w=this.container.clientWidth,h=this.container.clientHeight;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.viewCamera.aspect=w/h;this.viewCamera.updateProjectionMatrix();this.lobbyCamera.aspect=w/h;this.lobbyCamera.updateProjectionMatrix();if(this.hero){const small=w<600,locker=small&&this.previewingAppearance;this.hero.group.position.set(locker?0:small?.6:1.8,locker?1.4:small?-.7:-1.6,-6.8);this.hero.group.scale.setScalar(locker?.7:small?.9:2.1);const stage=this.lobbyScene.getObjectByName('Lobby platform');if(stage){stage.position.set(locker?0:small?.6:1.8,locker?1.35:small?-.76:-1.7,-6.8);stage.scale.setScalar(locker?.34:small?.45:1);}}}
 get groundLoot(){return this.arena.loot??GROUND_LOOT;}
 setGameMode(mode:GameMode){if(this.mode!=='menu'||!['ffa','gun-game'].includes(mode))return;this.gameMode=mode;this.emit();}
 get activeGameMode(){return this.snapshot?.gameMode??this.gameMode;}
 setArena(id:ArenaId){if(id===this.arenaId||this.mode!=='menu'||!ARENAS.some(a=>a.id===id))return;this.loadArena(id);this.emit();}
 private loadArena(id:ArenaId){
  if(!ARENAS.some(a=>a.id===id))return;
  this.disposeObject(this.arena.group);for(const mesh of this.items.values())this.disposeObject(mesh);for(const mesh of this.lootMeshes.values())this.disposeObject(mesh);this.items.clear();this.lootMeshes.clear();
  this.arena=createArenaFor(id);this.arenaId=id;this.scene.add(this.arena.group);this.scene.background=new THREE.Color(this.arena.background??0x65bdff);this.scene.fog=new THREE.Fog(this.arena.fog??0x9cd8ff,120,285);
  for(const item of this.arena.pickups){const mesh=createPickup(item.kind);mesh.position.set(item.x,item.y-.35,item.z);this.scene.add(mesh);this.items.set(item.id,mesh);}
  for(const item of this.groundLoot){const mesh=createGroundLoot(item.kind);mesh.position.set(item.x,item.y,item.z);this.scene.add(mesh);this.lootMeshes.set(item.id,mesh);}
 }
 previewAppearance(show:boolean){this.previewingAppearance=show;if(!show)this.previewAngle=0;this.resize();}
 turnPreview(){this.previewAngle+=Math.PI;}
 setAppearance(value:unknown){this.appearance=sanitizeAppearance(value);this.hero.setAppearance(this.appearance);if(this.sim){this.sim.setAppearance(this.localId,this.appearance);this.receiveSnapshot(this.sim.snapshot());this.network?.send({type:'snapshot',snapshot:this.sim.snapshot()});}else if(this.network)this.network.send({type:'appearance',appearance:this.appearance});}
 setSettings(settings:Settings){this.settings=settings;this.audio.volume=settings.volume;this.renderer.setPixelRatio(Math.min(devicePixelRatio,settings.quality==='low'?1:1.7));this.renderer.shadowMap.enabled=settings.quality==='high';this.resize();}
 private bindInput(){
  const opts={signal:this.abort.signal};
  document.addEventListener('pointerlockchange',()=>{this.locked=document.pointerLockElement===this.renderer.domElement;this.mouseDown=false;this.rightDown=false;this.trackpadFiring=false;this.fireBufferedUntil=0;this.keys.clear();this.emit();},opts);
  document.addEventListener('mousemove',e=>{if(!this.locked)return;const zoom=this.aiming?.45:this.focused?.6:1;this.yaw-=e.movementX*.002*this.settings.sensitivity*zoom;this.pitch=clamp(this.pitch-e.movementY*.002*this.settings.sensitivity*zoom,-1.5,1.5);},opts);
  document.addEventListener('keydown',e=>{
   if(this.mode==='menu'||!this.locked)return;
   if(e.code!=='Escape')e.preventDefault();
   this.keys.add(e.code);if(e.repeat)return;
   if(e.code==='Tab')this.scoreboard=true;
   if(e.code==='KeyR')this.action({type:'reload'});
   if(e.code==='KeyQ')this.action({type:'grenade'});
   if(e.code==='KeyE')this.action({type:'grapple'});
   if(e.code==='KeyF')this.action({type:'heal'});
   if(e.code==='KeyX')this.action({type:'gadget'});
   if(e.code==='KeyG')this.action({type:'pickup'});
   if(e.code==='KeyV')this.action({type:'ability'});
   if(e.code==='Space')this.jump();
   if(e.code==='KeyC'&&this.body.grounded&&Math.hypot(this.body.vx,this.body.vz)>5){this.slideUntil=this.time+.75;this.slideDirection.set(this.body.vx,this.body.vz).normalize();}
   if(/^Digit[1-5]$/.test(e.code))this.select(WEAPON_IDS[Number(e.code.slice(-1))-1]);
  },opts);
  document.addEventListener('keyup',e=>{this.keys.delete(e.code);if(e.code==='Tab')this.scoreboard=false;},opts);
  this.renderer.domElement.addEventListener('mousedown',e=>{if(this.mode==='menu')return;if(!this.locked)return;if(this.controlScope&&e.ctrlKey){this.mouseDown=true;this.trackpadFiring=true;this.fireBufferedUntil=this.time+.25;}else {if(e.button===0){this.mouseDown=true;this.fireBufferedUntil=this.time+.25;}if(e.button===2){this.rightDown=true;if(!WEAPONS[this.weapon].mag)this.action({type:'ability'});}}},opts);
  document.addEventListener('mouseup',e=>{if(e.button===0||this.trackpadFiring){this.mouseDown=false;this.trackpadFiring=false;}if(e.button===2)this.rightDown=false;},opts);
  this.renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault(),opts);
  this.renderer.domElement.addEventListener('wheel',e=>{if(!this.locked)return;e.preventDefault();const index=WEAPON_IDS.indexOf(this.weapon);this.select(WEAPON_IDS[(index+(e.deltaY>0?1:4))%5]);},{...opts,passive:false});
  window.addEventListener('blur',()=>{this.keys.clear();this.mouseDown=false;this.rightDown=false;this.trackpadFiring=false;this.fireBufferedUntil=0;},opts);
 }
 select(id:WeaponId){if(this.activeGameMode==='gun-game'&&this.player){this.notify('One weapon at a time. Eliminate a rival to advance.');return;}if(id==='aote'&&this.player&&!this.player.aoteOwned){this.notify('AOTE is ground loot. Find an End sword and press G.');return;}if(id==='aotd'&&this.player&&this.player.aotdCharges<1){this.notify('AOTD is drop only. Find a legendary sword on the map.');return;}if(this.pendingWeapon===id)return;if(id===this.weapon&&!this.pendingWeapon)return;if(this.mode==='menu'||!this.player){this.equip(id);return;}this.pendingWeapon=id;this.swapStart=this.time;this.swapUntil=this.time+.32;this.audio.play('swap');}
 private equip(id:WeaponId){this.weapon=id;for(const [weapon,mesh] of this.weaponMeshes)mesh.visible=this.equippedStage===null&&weapon===id;for(const [index,mesh] of this.variantMeshes)mesh.visible=index===this.equippedStage;this.recoil=0;if(this.player)this.sendMovement();this.emit();}
 setModifiers(modifiers:Partial<Modifiers>){if(this.mode==='join')return;const check=this.sim??new Simulation(this.arena,this.arenaId,this.gameMode);check.setModifiers({...this.modifiers,...modifiers});this.modifiers={...check.modifiers};if(this.sim){this.receiveSnapshot(this.sim.snapshot());this.network?.send({type:'snapshot',snapshot:this.sim.snapshot()});this.notify('GAME MASTER UPDATED THE RULES');}this.emit();}
 private get currentModifiers(){return this.snapshot?.modifiers??this.modifiers;}
 private get controlScope(){return this.locked&&this.weapon==='sniper'&&(this.keys.has('ControlLeft')||this.keys.has('ControlRight'));}
 private get aiming(){return (this.rightDown||this.controlScope)&&WEAPONS[this.weapon].mag>0;}
 private get focused(){return this.locked&&(this.keys.has('ShiftLeft')||this.keys.has('ShiftRight'));}
 jump(){if(this.body.jumps>=(this.currentModifiers.extraJumps?4:2)||!this.player||this.player.hp<=0)return;this.body.vy=(this.body.jumps===0?10:10.8)*this.currentModifiers.jump;this.body.jumps++;this.body.grounded=false;this.audio.play('jump');if(this.body.jumps>=2){this.effects.ring(new THREE.Vector3(this.body.x,this.body.y+.1,this.body.z),0x8bdfff,1.6);this.effects.burst(new THREE.Vector3(this.body.x,this.body.y,this.body.z),0xb5eaff,12);this.notify(this.body.jumps===2?'DOUBLE JUMP':this.body.jumps===3?'TRIPLE JUMP':'QUAD JUMP');}}
 requestLock(){if(this.mode==='menu')return;this.audio.unlock();this.error='';try{const result=this.renderer.domElement.requestPointerLock();if(result)void result.catch(()=>{this.error='Click Resume to capture the mouse. If your browser blocks it, open the game in its own tab.';this.emit();});}catch{this.error='Open the game in its own browser tab to enable mouse controls.';this.emit();}}
 get player(){return this.snapshot?.players.find(p=>p.id===this.localId)??null;}
 private begin(mode:Mode){this.mode=mode;this.eventId=0;this.warp=-1;this.killChain=0;this.lastKillTime=-20;this.accolade=null;this.spreadMarks=[];this.cameraKick=0;this.cameraSideKick=0;this.feed=[];this.error='';this.notice='';this.hero.group.visible=false;this.equippedStage=null;this.pendingWeapon=null;this.swapUntil=-10;this.equip('rifle');this.lastStateAt=performance.now();}
 startPractice(name:string,bots=5){this.leave(false);this.sim=new Simulation(this.arena,this.arenaId,this.gameMode);this.sim.setModifiers(this.modifiers);this.sim.addPlayer('host',name);this.sim.setAppearance('host',this.appearance);this.sim.fillBots(bots+1);this.localId='host';this.begin('practice');this.receiveSnapshot(this.sim.snapshot());this.requestLock();this.emit();}
 private makeNetwork(){return new Network({message:(id,p)=>this.packet(id,p),leave:id=>{
  if(this.mode==='host'){const name=this.sim?.players.get(id)?.name;this.sim?.removePlayer(id);if(name)this.notify(`${name} left the arena.`);}
  else if(this.mode==='join'){this.error='The host closed the room. Return to the lobby to start another match.';document.exitPointerLock();this.emit();}
 },error:message=>{this.error=message;this.emit();}});}
 async startHost(name:string,bots=3){
  this.leave(false);const network=this.makeNetwork();this.network=network;const code=roomCode();
  try{await network.openHost(code);if(this.network!==network)return;this.sim=new Simulation(this.arena,this.arenaId,this.gameMode);this.sim.setModifiers(this.modifiers);this.sim.addPlayer('host',name);this.sim.setAppearance('host',this.appearance);this.sim.fillBots(bots+1);this.localId='host';this.room=code;this.begin('host');this.receiveSnapshot(this.sim.snapshot());this.notify('Room is live. Share the invite link to bring friends in.');this.emit();}
  catch(error){network.close();if(this.network===network)this.network=null;throw error;}
 }
 async joinRoom(code:string,name:string){
  this.leave(false);code=code.trim().toUpperCase();if(!/^[A-Z2-9]{6}$/.test(code))throw new Error('Enter a six-character room code.');
  const network=this.makeNetwork();this.network=network;this.localId='';this.room=code;this.begin('join');
  try{await network.join(code,name,this.appearance);if(this.network!==network)return;this.localId=network.localId;this.lastStateAt=performance.now();this.emit();}
  catch(error){network.close();if(this.network===network){this.network=null;this.mode='menu';this.hero.group.visible=true;}throw error;}
 }
 private packet(id:string,packet:Packet){
  if(this.mode==='host'&&this.sim){
   if(packet.type==='hello'){
    if(typeof packet.name!=='string')return;this.sim.makeRoom();const p=this.sim.addPlayer(id,packet.name);
    if(!p){this.network?.sendTo(id,{type:'error',message:'This arena is full. Try another room.'});return;}
    this.sim.setAppearance(id,packet.appearance);
    this.network?.sendTo(id,{type:'snapshot',snapshot:this.sim.snapshot()});this.notify(`${p.name} joined the arena.`);
   }
   if(packet.type==='appearance'){this.sim.setAppearance(id,packet.appearance);this.network?.send({type:'snapshot',snapshot:this.sim.snapshot()});}
   if(packet.type==='move'&&packet.movement&&typeof packet.movement==='object')this.sim.movement(id,packet.movement);
   if(packet.type==='action'&&packet.action&&typeof packet.action.type==='string'){this.sim.action(id,packet.action);this.network?.send({type:'snapshot',snapshot:this.sim.snapshot()});}
  }else if(this.mode==='join'){
   if(packet.type==='snapshot'&&packet.snapshot&&Array.isArray(packet.snapshot.players))this.receiveSnapshot(packet.snapshot);
   if(packet.type==='error'){this.error=packet.message;this.emit();}
  }
 }
 leave(emit=true){
  this.network?.close();this.network=null;this.sim=null;this.snapshot=null;this.mode='menu';this.localId='host';this.room='';this.keys.clear();this.mouseDown=false;this.rightDown=false;this.scoreboard=false;this.impulse.set(0,0,0);this.error='';this.feed=[];this.hero.group.visible=true;
  if(document.pointerLockElement)document.exitPointerLock();for(const [,entry] of this.avatars)this.disposeObject(entry.asset.group);this.avatars.clear();for(const [,mesh] of this.grenadeMeshes)this.disposeObject(mesh);this.grenadeMeshes.clear();for(const mesh of this.fieldMeshes.values())this.disposeObject(mesh);this.fieldMeshes.clear();this.gadgetUseUntil=0;if(emit)this.emit();
 }
 restart(){if(!this.sim)return;this.sim.restart();this.eventId=0;this.feed=[];this.receiveSnapshot(this.sim.snapshot());this.requestLock();this.emit();}
 action(action:Action){if(this.activeGameMode==='gun-game'&&['pickup','gadget','grenade'].includes(action.type)){this.notify('Gun Game: your stage weapon is your only weapon.');return;}if((action.type==='fire'||action.type==='ability'||action.type==='gadget')&&this.time<this.swapUntil)return;if(this.mode==='menu'||!this.player||this.player.hp<=0||this.snapshot?.winner)return;this.sendMovement();if(this.sim){this.sim.action(this.localId,action);this.receiveSnapshot(this.sim.snapshot());}else this.network?.send({type:'action',action});}
 private sendMovement(){const movement={x:this.body.x,y:this.body.y,z:this.body.z,yaw:this.yaw+this.cameraSideKick,pitch:clamp(this.pitch+this.cameraKick,-1.5,1.5),weapon:this.weapon,grounded:this.body.grounded,warp:this.warp,focused:this.focused||this.aiming};if(this.sim)this.sim.movement(this.localId,movement);else if(this.network)this.network.send({type:'move',movement});}
 private receiveSnapshot(s:Snapshot){
  if(s.arenaId&&s.arenaId!==this.arenaId)this.loadArena(s.arenaId);
  this.lastStateAt=performance.now();const previous=this.snapshot;this.snapshot=s;
  if(previous&&previous.round!==s.round){this.eventId=0;this.feed=[];this.warp=-1;}
  const p=this.player;
  const stage=gunStage(p);
  if(p&&stage&&this.equippedStage!==p.gunGameStage){
   const wasEquipped=this.equippedStage!==null;this.equippedStage=p.gunGameStage;this.pendingWeapon=null;
   if(!this.variantMeshes.has(p.gunGameStage!)){const mesh=createGunGameWeapon(p.gunGameStage!);this.variantMeshes.set(p.gunGameStage!,mesh);this.weaponRoot.add(mesh);}
   this.equip(p.weapon);this.cameraKick=0;this.cameraSideKick=0;this.lastFire=-10;
   if(wasEquipped&&previous?.round===s.round){this.swapStart=this.time;this.swapUntil=this.time+.32;this.audio.play('swap');this.notify(`${p.gunGameStage!+1} / 20 · ${stage.stats.name.toUpperCase()}`);}
  }else if(p&&!stage&&this.equippedStage!==null){this.equippedStage=null;this.equip(p.weapon);}
  if(p?.reloading&&!previous?.players.find(v=>v.id===p.id)?.reloading)this.audio.play('reload');
  if(p&&p.warp!==this.warp){
   const firstSpawn=this.warp===-1;
   Object.assign(this.body,{x:p.x,y:p.y,z:p.z,vx:0,vy:0,vz:0,grounded:false,jumps:0});this.impulse.set(0,0,0);this.warp=p.warp;
   if(firstSpawn||!previous||previous.players.find(v=>v.id===p.id)?.hp===0){this.yaw=p.yaw;this.pitch=0;}
  }
  if(p&&p.hp>0&&((this.weapon==='aotd'&&p.aotdCharges<1)||(this.weapon==='aote'&&!p.aoteOwned)))this.select(p.aoteOwned?'aote':'rifle');
  for(const e of s.events){if(e.id>this.eventId){this.handleEvent(e);this.eventId=e.id;}}
  if(s.winner&&!previous?.winner){this.mouseDown=false;document.exitPointerLock();}
 }
 private handleEvent(e:GameEvent){
  const own=e.from===this.localId;const position=e.position?v3(e.position):new THREE.Vector3();const near=own||position.distanceTo(this.camera.position)<40;
  if(e.type==='announcement'&&e.text)this.notify(e.text);
  if(e.type==='push'&&e.to===this.localId&&e.end){this.impulse.x=clamp(this.impulse.x+e.end.x,-22,22);this.impulse.z=clamp(this.impulse.z+e.end.z,-22,22);if(e.end.y>0){this.body.vy=Math.max(this.body.vy,e.end.y);this.body.grounded=false;this.body.jumps=Math.max(1,this.body.jumps);}}
  if(e.type==='gadget'){
   if(e.text&&isGadget(e.text)){
    const kind=e.text;const color=GADGETS[kind].color;
    if(own){this.gadgetUseUntil=this.time+.55;let mesh=this.gadgetMeshes.get(kind);if(!mesh){mesh=createGadget(kind);this.gadgetRoot.add(mesh);this.gadgetMeshes.set(kind,mesh);}for(const [id,model] of this.gadgetMeshes)model.visible=id===kind;this.notify(GADGETS[kind].name.toUpperCase());}
    if(near)this.audio.play(({ice_wand:'ice',bonzo_staff:'bonzo',swap_pearl:'swap_pearl',gravity_orb:'gravity',healing_totem:'totem',rocket_boots:'rocket',nuke:'nuke_arm'} as const)[kind]);
    this.effects.burst(position,color,18);this.effects.ring(position,color,kind==='rocket_boots'?6:2);
    if(kind==='ice_wand'&&e.end)for(let i=1;i<=6;i++){const point=position.clone().lerp(v3(e.end),i/6);this.effects.burst(point,color,7);this.effects.ring(point,color,i*.4);}
   }else if(own&&e.text)this.notify(e.text);
  }
  if(e.type==='consume'&&own){this.mouseDown=false;this.rightDown=false;this.keys.delete('KeyV');this.select(this.player?.aoteOwned?'aote':'rifle');this.notify(e.text||'Relic consumed.');}
  if(e.type==='shot'){
   if(e.end){const from=own?new THREE.Vector3(.3,-.18,-.8).applyMatrix4(this.camera.matrixWorld):position;this.effects.tracer(from,v3(e.end),e.color);}
   if(e.pellet===undefined||e.pellet===0){if(near)this.audio.play(e.text||'rifle',own?1:Math.max(.05,1-position.distanceTo(this.camera.position)/55)*.45);if(own){this.recoil=1;if(e.text==='aote'||e.text==='aotd')this.swingUntil=this.time+.36;else{const kick=(e.variant===undefined?null:GUN_GAME_STAGES[e.variant]?.recoil)??(e.text==='sniper'?.055:e.text==='shotgun'?.042:.017);this.cameraKick=Math.min(.14,this.cameraKick+kick*(this.focused||this.aiming?.55:1));this.cameraSideKick+=Math.sin(e.id*1.7)*kick*.2;}}}
   if(own&&e.text==='shotgun'&&e.end){const point=v3(e.end).project(this.camera);if(Math.abs(point.x)<=1&&Math.abs(point.y)<=1)this.spreadMarks.push({id:e.id,x:(point.x+1)*50,y:(1-point.y)*50,until:this.time+.55});} 
  }
  if(e.type==='hit'){
   this.effects.burst(position,e.headshot?0xf9d69a:0xc8ede1,6);
   if(own){this.hitUntil=this.time+.35;this.lastDamage=Math.max(0,Math.floor((e.value||0)+1e-6));this.damageHeadshot=!!e.headshot;this.audio.play('hit');if(e.headshot){this.accolade={id:e.id,title:'HEADSHOT',detail:'PRECISION HIT'};this.accoladeUntil=this.time+1.5;this.audio.play('headshot');}}
   if(e.to===this.localId){this.hurtUntil=this.time+.3;this.audio.play('hurt');}
  }
  if(e.type==='kill'){
   this.effects.burst(position,0xc1dcce,22);
   const attacker=this.snapshot?.players.find(p=>p.id===e.from)?.name||(e.text==='nuke'?'Rift Nuke':'The void'),victim=this.snapshot?.players.find(p=>p.id===e.to)?.name||'Ranger';
   this.feed.unshift({id:e.id,attacker,victim,weapon:e.text||'void',own,at:this.time});this.feed=this.feed.slice(0,5);
   if(e.to===this.localId){this.killChain=0;this.lastKillTime=-20;}
   if(own){this.killChain=this.time-this.lastKillTime<=5?this.killChain+1:1;this.lastKillTime=this.time;const title=this.killChain>=4?'QUAD KILL':this.killChain===3?'TRIPLE KILL':this.killChain===2?'DOUBLE KILL':e.headshot?'HEADSHOT':'ELIMINATION';this.accolade={id:e.id,title,detail:`${e.headshot?'HEADSHOT · ':''}${victim} · +1`};this.accoladeUntil=this.time+2.4;this.audio.play(this.killChain>=2?'multikill':'kill');}
  }
  if(e.type==='teleport'){
   if(e.text){if(own)this.notify(e.text);return;}
   this.effects.burst(position,0x9edcca,24);this.effects.ring(position,0x9edcca,2);if(e.end)this.effects.burst(v3(e.end),0x9edcca,24);if(near)this.audio.play('teleport');
  }
  if(e.type==='blast'){
   if(e.end){const end=v3(e.end);for(let i=0;i<8;i++){const point=position.clone().lerp(end,i/7);this.effects.burst(point,0xf0b587,6);this.effects.ring(point,0xf0b587,1+i*.45);}}if(near)this.audio.play('blast');
  }
  if(e.type==='explode'&&e.text==='nuke'){this.effects.nuke(position,26);this.audio.play('nuke_explode',near?1:.4);this.notify('RIFT DETONATION');}
  if(e.type==='explode'&&e.text!=='nuke'){this.effects.burst(position,e.color||0xf1be85,40);this.effects.ring(position,e.color||0xf1be85,6);if(e.text==='bonzo'){this.effects.burst(position,0xffdf68,15);this.effects.burst(position,0x78e8ff,15);}if(near)this.audio.play(e.text==='bonzo'?'bonzo':'explode');}
  if(e.type==='pickup'||e.type==='heal'){this.effects.burst(position,e.color||0xa1dcc2,12);if(own){this.audio.play(e.type);if(this.player&&WEAPON_IDS.includes(this.player.weapon)&&this.player.weapon!==this.weapon)this.select(this.player.weapon);this.notify(e.type==='heal'?'Florid mend  +45 health':`${Object.values(LOOT_LABELS).includes(e.text||'')?`PICKED UP: ${e.text}`:e.text==='haste'?'Speed boost · 10 seconds':`${e.text} restored`}`);}}
  if(e.type==='grapple'){
   if(e.end){this.effects.tracer(position,v3(e.end),0xf0dbc1);if(own){const delta=v3(e.end).sub(new THREE.Vector3(this.body.x,this.body.y+1,this.body.z)).normalize().multiplyScalar(21);this.impulse.copy(delta);this.body.vy=Math.max(7,delta.y+4);this.body.grounded=false;this.launchUntil=this.time+.7;this.audio.play('teleport');}}
   else if(own&&e.text)this.notify(e.text);
  }
 }
 notify(text:string){this.notice=text;this.noticeUntil=this.time+3.3;this.emit();}
 clearError(){this.error='';this.emit();}
 private move(dt:number){
  const p=this.player;if(!p||p.hp<=0||this.snapshot?.winner)return;
  const active=this.locked;
  let forward=(active&&this.keys.has('KeyW')?1:0)-(active&&this.keys.has('KeyS')?1:0);
  let strafe=(active&&this.keys.has('KeyD')?1:0)-(active&&this.keys.has('KeyA')?1:0);const length=Math.hypot(forward,strafe);if(length){forward/=length;strafe/=length;}
  const sprint=active&&this.weapon!=='sniper'&&(this.keys.has('ControlLeft')||this.keys.has('ControlRight'));const crouch=this.focused;const sliding=this.slideUntil>this.time;
  const speed=(sliding?13:sprint?10:crouch?3.5:6.5)*(p.hasteUntil>(this.snapshot?.time||0)?1.35:1)*(this.aiming?.6:1)*this.currentModifiers.speed*(p.chilledUntil>(this.snapshot?.time||0)?.35:1);
  let vx=(-Math.sin(this.yaw)*forward+Math.cos(this.yaw)*strafe)*speed,vz=(-Math.cos(this.yaw)*forward-Math.sin(this.yaw)*strafe)*speed;
  if(sliding){vx=this.slideDirection.x*speed;vz=this.slideDirection.y*speed;}
  const t=1-Math.exp(-dt*(this.body.grounded?16:7));this.body.vx=THREE.MathUtils.lerp(this.body.vx,vx,t);this.body.vz=THREE.MathUtils.lerp(this.body.vz,vz,t);
  const bx=this.body.vx,bz=this.body.vz;this.body.vx+=this.impulse.x;this.body.vz+=this.impulse.z;this.impulse.multiplyScalar(Math.exp(-dt*2.5));
  stepBody(this.body,dt,this.arena.colliders,1.8,this.currentModifiers.lowGravity?9:22);this.body.vx=bx;this.body.vz=bz;
  if(this.body.grounded&&this.launchUntil<this.time){for(const pad of this.arena.jumpPads){if(Math.hypot(this.body.x-pad.x,this.body.z-pad.z)<pad.radius&&Math.abs(this.body.y-pad.y)<.55){this.body.vy=pad.power*Math.sqrt(this.currentModifiers.jump);this.body.grounded=false;this.body.jumps=1;this.launchUntil=this.time+.8;this.audio.play('jump');this.effects.ring(new THREE.Vector3(pad.x,pad.y+.2,pad.z),0xeddb9e,2);break;}}}
  this.stepTime+=dt*Math.hypot(this.body.vx,this.body.vz);
  if(active&&(this.rightDown||this.keys.has('KeyV'))&&!WEAPONS[this.weapon].mag&&(this.activeGameMode!=='gun-game'||gunStage(p)?.teleport)&&this.time-this.lastAbility>.08&&p.abilityUntil<=(this.snapshot?.time||0)&&p.mana>=(this.weapon==='aote'?15:0)){this.action({type:'ability'});this.lastAbility=this.time;}
  if(active&&(this.mouseDown||this.time<this.fireBufferedUntil)&&this.time>=this.swapUntil&&!p.reloading&&p.nextFire<=(this.snapshot?.time||0)&&this.time-this.lastFire>=weaponStats(p).interval){this.action({type:'fire'});this.lastFire=this.time;this.fireBufferedUntil=0;}
 }
 private visuals(dt:number){
  const state=this.snapshot;this.arena.update(this.time,dt);this.effects.update(dt);
  this.hero.group.visible=this.mode==='menu'||this.previewingAppearance;this.hero.update(this.time,0,true,'aote');this.hero.group.rotation.y=Math.PI+.25+this.previewAngle+(this.reducedMotion?0:Math.sin(this.time*.4)*.1);
  for(const point of this.arena.pickups){const mesh=this.items.get(point.id)!;mesh.visible=!state||(state.pickups[point.id]||0)<=state.time;mesh.rotation.y=this.time*.7;mesh.position.y=point.y-.35+Math.sin(this.time*2+point.x)*.12;}
  for(const item of this.groundLoot){const mesh=this.lootMeshes.get(item.id)!;mesh.visible=this.activeGameMode!=='gun-game'&&(item.kind!=='nuke'||!!state?.nukeUnlocked)&&(!state||(state.loot?.[item.id]||0)<=state.time);const display=mesh.getObjectByName('display');if(display){display.position.y=.78+Math.sin(this.time*2+item.x)*.07;display.rotation.y=this.time*.5;}}
  if(!state)return;
  const present=new Set(state.players.map(p=>p.id));
  for(const [id,entry] of this.avatars){if(!present.has(id)){this.disposeObject(entry.asset.group);this.avatars.delete(id);}}
  for(const p of state.players){
   if(p.id===this.localId)continue;let entry=this.avatars.get(p.id);
   if(!entry){const asset=createAvatar(p.color,p.appearance);asset.setName(p.name+(p.bot?' · BOT':''));asset.group.position.set(p.x,p.y,p.z);entry={asset,previous:new THREE.Vector3(p.x,p.y,p.z)};this.avatars.set(p.id,entry);this.scene.add(asset.group);}
   entry.asset.setAppearance(p.appearance);entry.asset.group.visible=p.hp>0;
   const target=new THREE.Vector3(p.x,p.y,p.z),speed=target.distanceTo(entry.previous)/Math.max(dt,.001);
   if(entry.asset.group.position.distanceTo(target)>8)entry.asset.group.position.copy(target);else entry.asset.group.position.lerp(target,1-Math.exp(-dt*16));
   entry.asset.group.rotation.y=p.yaw;entry.asset.update(this.time,Math.min(10,speed),p.grounded,p.weapon,p.gunGameStage);entry.previous.copy(target);
  }
  const fieldIds=new Set((state.fields||[]).map(f=>f.id));for(const [id,mesh] of this.fieldMeshes)if(!fieldIds.has(id)){this.disposeObject(mesh);this.fieldMeshes.delete(id);}
  for(const field of state.fields||[]){
   let mesh=this.fieldMeshes.get(field.id);if(!mesh){mesh=new THREE.Group();const core=createGadget(field.kind);core.name='core';core.scale.setScalar(2.1);core.position.y=.65;mesh.add(core);const ring=new THREE.Mesh(new THREE.TorusGeometry(field.radius,.055,5,72),new THREE.MeshBasicMaterial({color:GADGETS[field.kind].color,transparent:true,opacity:.7,depthWrite:false}));ring.rotation.x=Math.PI/2;ring.name='field-ring';mesh.add(ring);const inner=ring.clone();inner.material=new THREE.MeshBasicMaterial({color:GADGETS[field.kind].color,transparent:true,opacity:.3,depthWrite:false});inner.name='pulse';inner.position.y=.06;mesh.add(inner);this.scene.add(mesh);this.fieldMeshes.set(field.id,mesh);}
   mesh.position.set(field.x,field.y,field.z);const core=mesh.getObjectByName('core')!;core.rotation.y=this.time*(field.kind==='gravity_orb'?2:.35);core.position.y=.65+Math.sin(this.time*3)*.08;const phase=(this.time%1.2)/1.2;mesh.getObjectByName('pulse')!.scale.setScalar(field.kind==='gravity_orb'?1-phase:.25+phase*.75);
  }
  const ids=new Set(state.grenades.map(g=>g.id));for(const [id,mesh] of this.grenadeMeshes)if(!ids.has(id)){this.disposeObject(mesh);this.grenadeMeshes.delete(id);}
  for(const g of state.grenades){let mesh=this.grenadeMeshes.get(g.id);if(!mesh){if(g.kind==='nuke'){mesh=createGadget('nuke');const warning=new THREE.Mesh(new THREE.TorusGeometry(26,.11,4,96),new THREE.MeshBasicMaterial({color:0xff5944,transparent:true,opacity:.8,depthWrite:false}));warning.name='blast-radius';warning.rotation.x=Math.PI/2;mesh.add(warning);}else mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(g.kind==='bonzo'?.3:.16,g.kind==='bonzo'?1:0),new THREE.MeshStandardMaterial({color:g.kind==='bonzo'?0xff8dc4:0xcda274,roughness:.4}));this.scene.add(mesh);this.grenadeMeshes.set(g.id,mesh);}mesh.position.set(g.x,g.y,g.z);if(g.kind==='nuke'){const ring=mesh.getObjectByName('blast-radius')!;ring.position.y=.13-g.y;}else{mesh.rotation.x+=dt*5;mesh.rotation.z+=dt*3;}}
 }
 private render(dt:number){
  if(this.mode==='menu'){
   const angle=this.reducedMotion?.62:.62+Math.sin(this.time*.025)*.13;this.camera.position.set(Math.sin(angle)*107,62,Math.cos(angle)*107);this.camera.lookAt(0,-1,0);this.camera.fov=47;this.camera.updateProjectionMatrix();
  }else if(this.player){
   const dead=this.player.hp<=0;const crouch=this.slideUntil>this.time;const bob=this.reducedMotion?0:Math.sin(this.stepTime*1.8)*.035*(this.body.grounded?1:0);
   this.camera.position.set(this.body.x,this.body.y+(dead?.55:crouch?1.14:1.55)+bob,this.body.z);this.camera.rotation.order='YXZ';this.camera.rotation.set(clamp(this.pitch+this.cameraKick,-1.5,1.5),this.yaw+this.cameraSideKick,0);
   const scoped=this.aiming;const targetFov=scoped?(this.weapon==='sniper'?32:60):this.focused?this.settings.fov-8:this.settings.fov;
   this.camera.fov=THREE.MathUtils.lerp(this.camera.fov,targetFov,1-Math.exp(-dt*15));this.camera.updateProjectionMatrix();
  }
  this.renderer.autoClear=true;this.renderer.render(this.scene,this.camera);
  if(this.mode==='menu'||this.previewingAppearance){this.renderer.autoClear=false;this.renderer.clearDepth();this.renderer.render(this.lobbyScene,this.lobbyCamera);this.renderer.autoClear=true;}
  if(this.mode!=='menu'&&this.player&&this.player.hp>0&&!this.snapshot?.winner&&!this.previewingAppearance){
   const sword=!WEAPONS[this.weapon].mag;const ads=this.aiming&&!sword;const reloading=!!this.player.reloading;const swing=sword&&this.swingUntil>this.time?Math.sin((1-(this.swingUntil-this.time)/.36)*Math.PI):0;
   const reloadProgress=reloading?clamp(1-(this.player.reloadUntil-(this.snapshot?.time||0))/Math.max(.01,this.player.reloadDuration),0,1):0;const reloadPose=reloading?Math.sin(Math.PI*clamp(reloadProgress/.85,0,1)):0;const swapPose=this.time<this.swapUntil?Math.sin(Math.PI*clamp((this.time-this.swapStart)/.32,0,1)):0;
   this.recoil=Math.max(0,this.recoil-dt*6);const sway=this.reducedMotion?0:Math.sin(this.stepTime*1.7)*.015;
   this.weaponRoot.position.set(ads?.025:.32,sword?-.57:ads?-.29:-.35,(sword?-.78:-.6)+this.recoil*(this.weapon==='sniper'?.2:this.weapon==='shotgun'?.17:.1));this.weaponRoot.position.y+=sway-swapPose*.8+reloadPose*.04;this.weaponRoot.position.x-=reloadPose*.13;
   this.weaponRoot.position.x-=swing*.62;this.weaponRoot.position.y+=swing*.18;this.weaponRoot.rotation.set((sword?-.16:0)-swing*1.3+this.recoil*(sword?0:this.weapon==='sniper'?.21:this.weapon==='shotgun'?.17:.11)+reloadPose*.18,sword?-.12+swing*.95:0,(sword?-.35:0)-swing*1.4+reloadPose*.65+swapPose*.3);this.weaponRoot.scale.setScalar(sword?.64:1);
   this.weaponRoot.visible=!(ads&&this.weapon==='sniper'&&!reloading);
   this.hands.position.set(-reloadPose*.06,-reloadPose*.13,reloadPose*.07);
   this.gadgetRoot.visible=this.gadgetUseUntil>this.time;const gadgetPose=Math.sin(Math.PI*clamp(1-(this.gadgetUseUntil-this.time)/.55,0,1));this.gadgetRoot.position.set(-.22,-.65+gadgetPose*.27,-1);this.gadgetRoot.rotation.set(-.18,Math.sin(this.time*2)*.15,-.2+gadgetPose*.3);this.gadgetRoot.scale.setScalar(.85);
   const held=this.equippedStage===null?this.weaponMeshes.get(this.weapon):this.variantMeshes.get(this.equippedStage);const magazine=held?.getObjectByName(this.weapon==='rifle'?'Curved magazine':'Box magazine');if(magazine){magazine.userData.restY??=magazine.position.y;magazine.position.y=magazine.userData.restY-(reloading?Math.sin(Math.PI*clamp((reloadProgress-.12)/.65,0,1))*.34:0);}
   this.renderer.autoClear=false;this.renderer.clearDepth();this.renderer.render(this.viewScene,this.viewCamera);this.renderer.autoClear=true;
  }
 }
 private frame=(now:number)=>{
  if(!this.running)return;const dt=Math.min(.04,Math.max(.001,(now-(this.lastTime||now-16))/1000));this.lastTime=now;this.time+=dt;this.cameraKick*=Math.exp(-dt*5);this.cameraSideKick*=Math.exp(-dt*7);this.spreadMarks=this.spreadMarks.filter(m=>m.until>this.time);this.fps=THREE.MathUtils.lerp(this.fps,1/dt,.04);
  if(this.pendingWeapon&&this.time>=this.swapStart+.15){const next=this.pendingWeapon;this.pendingWeapon=null;this.equip(next);}
  if(this.mode!=='menu'){
   if(!(this.mode==='practice'&&!this.locked)){
    this.move(dt);if(this.sim){this.sendMovement();this.sim.tick(dt);this.receiveSnapshot(this.sim.snapshot());}
   }
   this.networkTime+=dt;if(this.networkTime>.05){this.networkTime=0;if(this.sim&&this.network)this.network.send({type:'snapshot',snapshot:this.sim.snapshot()});else if(this.network)this.sendMovement();}
   this.pingTime+=dt;if(this.pingTime>2){this.pingTime=0;this.network?.ping();}
   if(this.mode==='join'&&performance.now()-this.lastStateAt>12000&&!this.error){this.error='The host stopped responding. Return to the lobby and reconnect.';document.exitPointerLock();}
  }
  this.visuals(dt);this.render(dt);
  this.uiTime+=dt;if(this.uiTime>.065){this.uiTime=0;this.emit();}
  this.raf=requestAnimationFrame(this.frame);
 };
 private emit(){this.onView({mode:this.mode,locked:this.locked,scoreboard:this.scoreboard,player:this.player,snapshot:this.snapshot,room:this.room,fps:Math.round(this.fps),ping:this.network?.latency||0,notice:this.time<this.noticeUntil?this.notice:'',error:this.error,hitUntil:this.hitUntil>this.time?1:0,hurtUntil:this.hurtUntil>this.time?1:0,lastDamage:this.lastDamage,damageHeadshot:this.damageHeadshot,accolade:this.accoladeUntil>this.time?this.accolade:null,spreadMarks:this.spreadMarks,arenaId:this.arenaId,feed:this.feed.filter(f=>this.time-f.at<7),localId:this.localId,aiming:this.aiming,focused:this.focused,slide:this.slideUntil>this.time,jumps:this.body.jumps,lootNearby:this.nearbyLoot()});}
 private nearbyLoot(){const p=this.player;if(!p||this.activeGameMode==='gun-game')return null;const item=this.groundLoot.find(item=>(item.kind!=='nuke'||this.snapshot?.nukeUnlocked)&&(this.snapshot?.loot?.[item.id]||0)<=(this.snapshot?.time||0)&&dist(p,item)<2.9);return item?{name:LOOT_LABELS[item.kind],description:LOOT_DESCRIPTIONS[item.kind]}:null;}
 private disposeObject(object:THREE.Object3D){object.removeFromParent();object.traverse(child=>{if(child instanceof THREE.Mesh||child instanceof THREE.Sprite){if(child instanceof THREE.Mesh)child.geometry.dispose();const materials=Array.isArray(child.material)?child.material:[child.material];for(const m of materials){if('map'in m)(m as THREE.MeshBasicMaterial).map?.dispose();m.dispose();}}});}
 dispose(){this.running=false;cancelAnimationFrame(this.raf);this.abort.abort();this.resizeObserver.disconnect();this.network?.close();this.audio.dispose();this.effects.dispose();this.disposeObject(this.scene);this.disposeObject(this.viewScene);this.disposeObject(this.lobbyScene);this.renderer.dispose();this.renderer.domElement.remove();}
}
