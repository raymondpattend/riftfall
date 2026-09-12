import {WEAPONS,clamp} from './rules';
import type {Player} from './rules';
import type {WeaponId} from './world-types';

export type GameMode='ffa'|'gun-game';
type WeaponStats=(typeof WEAPONS)[WeaponId];
export interface GunStage {
 id:string; weapon:WeaponId; category:string; stats:WeaponStats;
 headshotDamage:number; recoil:number; teleport:boolean;
}
function stage(id:string,weapon:WeaponId,name:string,category:string,stats:Partial<WeaponStats>,recoil:number,headshotDamage=999,teleport=false):GunStage {
 return {id,weapon,category,recoil,headshotDamage,teleport,stats:{...WEAPONS[weapon],name,short:category,ability:weapon==='sniper'?'Ctrl: scope · click: fire':weapon==='aote'?(teleport?'V / right click: teleport · 15 mana':'Left click: swing'):'Shift: focus · R: reload',...stats}};
}

// Every stage changes the handling as well as the model. Kills, not deaths, move this ladder.
export const GUN_GAME_STAGES:readonly GunStage[]=[
 stage('sidekick','rifle','Sidekick','Pistol',{damage:16,interval:.32,mag:12,reload:1.15,range:65,spread:.012,color:0x7bdbdd,description:'A light sidearm with a quick reload.'},.022),
 stage('wayfinder','rifle','Wayfinder AR','Rifle',{},.017,100),
 stage('short-fuse','shotgun','Short Fuse','Double barrel',{damage:7,interval:.55,mag:2,reload:1.3,range:19,spread:.085,pellets:8,color:0xeaab73,description:'Two shells. A wide close-range burst.'},.055),
 stage('needle','rifle','Needle','SMG',{damage:6,interval:.075,mag:40,reload:1.5,range:46,spread:.027,color:0xe4cf68,description:'Fast fire and a deep magazine. Focus to tame the spread.'},.009,100),
 stage('copperhead','rifle','Copperhead','Revolver',{damage:30,interval:.48,mag:6,reload:1.7,range:80,spread:.009,color:0xc58e64,description:'Six deliberate shots with a heavy kick.'},.039),
 stage('scout','sniper','Scout','Light sniper',{interval:.95,mag:3,reload:1.85,color:0x9dcda6,description:'A compact one-tap rifle. Hold Ctrl to scope.'},.041),
 stage('breachcaster','shotgun','Breachcaster','Pump shotgun',{},.042),
 stage('ranger','rifle','Ranger Carbine','Carbine',{damage:14,interval:.24,mag:18,reload:1.4,range:110,spread:.006,color:0xaac8ad,description:'A steady midrange rifle with precise single rounds.'},.023,100),
 stage('pocket-auto','rifle','Pocket Auto','Auto pistol',{damage:9,interval:.11,mag:24,reload:1.2,range:48,spread:.025,color:0xf1ad91,description:'A tiny automatic sidearm for moving fights.'},.013),
 stage('street-sweeper','shotgun','Street Sweeper','Auto shotgun',{damage:3,interval:.36,mag:12,reload:2.2,range:22,spread:.075,pellets:6,color:0x81cbbd,description:'Six pellets per shell with rapid follow-up fire.'},.03),
 stage('longshot','sniper','Longshot','Heavy sniper',{},.055),
 stage('heavy-hand','rifle','Heavy Hand','Hand cannon',{damage:38,interval:.64,mag:5,reload:1.6,range:75,spread:.01,color:0xe8b666,description:'Five heavy rounds. Land your shot before the next kick.'},.048),
 stage('drumrunner','rifle','Drumrunner','Drum rifle',{damage:7,interval:.105,mag:60,reload:2.8,range:85,spread:.021,color:0xc9cdaa,description:'A huge drum magazine for sustained pressure.'},.014,100),
 stage('quad-barrel','shotgun','Quad Barrel','Four barrel',{damage:5,interval:1.05,mag:4,reload:2.1,range:25,spread:.075,pellets:12,color:0xd8a476,description:'Twelve pellets leave four barrels in one wide blast.'},.062),
 stage('frostbite','sniper','Frostbite','Ice sniper',{interval:1.4,mag:2,reload:1.8,range:150,color:0xb5f1f3,description:'Two one-tap rounds in a crystalline precision rifle.'},.06),
 stage('pulse-carbine','rifle','Pulse Carbine','Pulse rifle',{damage:12,interval:.18,mag:22,reload:1.25,range:100,spread:.008,color:0x78ddd0,description:'A precise energy carbine before the melee finale.'},.02,100),
 stage('scrap-saber','aote','Scrap Saber','Saber',{damage:40,interval:.32,range:4.2,color:0xc9d1cd,description:'Close the distance. A quick, repeatable slash.'},0),
 stage('dragon-cleaver','aote','Dragon Cleaver','Heavy sword',{damage:75,interval:.7,range:4.8,color:0xf1a476,description:'A broad, slow blade with a longer reach.'},0),
 stage('end-sword','aote','Aspect of the End','Teleport sword',{damage:35,interval:.3,range:4.2,description:'Blink into melee range, then finish the fight.'},0,999,true),
 stage('crown-blade','aote','Crown Blade','Final sword',{damage:999,interval:.48,range:3.6,color:0xffdd79,description:'The final stage. One melee elimination wins the match.'},0),
];

export const stageIndexForKills=(kills:number)=>clamp(Math.floor(Number.isFinite(kills)?kills:0),0,GUN_GAME_STAGES.length-1);
export function gunStage(player:Pick<Player,'gunGameStage'>|null|undefined){
 const index=player?.gunGameStage;
 return typeof index==='number'&&Number.isInteger(index)&&index>=0&&index<GUN_GAME_STAGES.length?GUN_GAME_STAGES[index]:null;
}
export const weaponStats=(player:Player)=>gunStage(player)?.stats??WEAPONS[player.weapon];
export const gunGameIcon=(stage:GunStage)=>`/weapons/gun-game/${stage.id}.svg`;
