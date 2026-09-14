import {it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {GameEngine} from '../src/engine';
import {Simulation} from '../src/simulation';
import {CombatEffects} from '../src/assets/effects';
const fixture=()=>({colliders:[],spawns:[{x:0,y:0,z:0,yaw:0}],pickups:[],jumpPads:[],loot:[]});
function client(){
 const sim=new Simulation(fixture());const p=sim.addPlayer('p','P')!;
 const e:any=Object.create(GameEngine.prototype),tracer=vi.fn(),cancelShot=vi.fn(),send=vi.fn(()=>true);
 Object.assign(e,{snapshot:sim.snapshot(),localId:'p',mode:'join',sim:null,network:{send,serverTime:()=>1},arena:fixture(),body:{x:0,y:0,z:0},camera:new THREE.PerspectiveCamera(),cameraKick:0,cameraSideKick:0,weapon:'rifle',warp:p.warp,time:1,swapUntil:0,unsentInputs:[],submittedInput:0,commandSeq:0,renderedAt:0,yaw:0,pitch:0,predictedShots:new Map(),predictedIds:new Set(),predictedNext:0,pendingReload:0,awaitingFrame:new Set(),shotDiagnostics:[],effects:{tracer,cancelShot},notify:vi.fn(),audio:{play:vi.fn()},recoil:0,spreadMarks:[],keys:new Set()});
 Object.defineProperty(e,'focused',{value:false});return {e,p,send,tracer,cancelShot};
}
for(const [weapon,pellets] of [['rifle',1],['shotgun',8],['sniper',1]] as const)it(`draws ${weapon} immediately with no speculative hit feedback or duplicate authoritative tracer`,()=>{
 const {e,send,tracer}=client();e.weapon=weapon;e.snapshot.players[0].weapon=weapon;e.action({type:'fire'});
 expect(send).toHaveBeenCalledOnce();expect(tracer).toHaveBeenCalledTimes(pellets);expect(e.audio.play).not.toHaveBeenCalled();expect(e.recoil).toBe(0);expect(e.snapshot.players[0].ammo[weapon]).toBe(weapon==='rifle'?30:weapon==='shotgun'?8:5);
 for(let pellet=0;pellet<pellets;pellet++)e.handleEvent({type:'shot',id:pellet+1,commandSeq:1,from:'p',text:weapon,pellet,end:{x:0,y:1,z:-10}});
 expect(tracer).toHaveBeenCalledTimes(pellets);expect(e.audio.play).toHaveBeenCalledOnce();
 e.commandResult({id:'p',seq:1,status:'accepted'});expect(e.predictedShots.size).toBe(0);
});
it('does not predict unsent shots, reloads, empty ammo, or cooldown-blocked clicks',()=>{
 for(const reason of ['unsent','reload','empty','cooldown','dead','swap']){
  const {e,send,tracer}=client();if(reason==='unsent')send.mockReturnValue(false);if(reason==='reload')e.snapshot.players[0].reloading='rifle';if(reason==='empty')e.snapshot.players[0].ammo.rifle=0;if(reason==='cooldown')e.predictedNext=2;if(reason==='dead')e.snapshot.players[0].hp=0;if(reason==='swap')e.swapUntil=2;e.action({type:'fire'});expect(tracer).not.toHaveBeenCalled();
 }
});
it('reserves pending ammunition and removes a rejected provisional shot',()=>{
 const {e,tracer,cancelShot}=client();e.snapshot.players[0].ammo.rifle=1;e.action({type:'fire'});e.network.serverTime=()=>2;e.action({type:'fire'});expect(tracer).toHaveBeenCalledOnce();
 e.commandResult({id:'p',seq:1,status:'rejected',reason:'state changed'});expect(cancelShot).toHaveBeenCalledWith(1);expect(e.predictedShots.size).toBe(0);expect(e.notify).toHaveBeenCalled();e.action({type:'fire'});expect(tracer).toHaveBeenCalledTimes(2);
});
it('keeps a newly-created tracer alive for its first update even after a long frame',()=>{
 const scene=new THREE.Scene(),effects=new CombatEffects(scene);effects.tracer(new THREE.Vector3(),new THREE.Vector3(0,1,-10),0xffffff,1);effects.update(.5);expect((scene.getObjectByName('Shot tracers') as THREE.InstancedMesh).count).toBe(1);effects.update(.5);effects.update(.5);expect((scene.getObjectByName('Shot tracers') as THREE.InstancedMesh).count).toBe(0);effects.dispose();
});

it('releases the speculative cooldown when a sniper shot is rejected',()=>{const {e}=client();e.weapon='sniper';e.snapshot.players[0].weapon='sniper';e.action({type:'fire'});expect(e.predictedNext).toBeGreaterThan(2);e.commandResult({id:'p',seq:1,status:'rejected',reason:'state changed'});expect(e.predictedNext).toBe(0);expect(e.awaitingFrame.size).toBe(0);});
