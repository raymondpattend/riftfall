import type { WeaponId, PickupKind, ArenaId } from './world-types';
import {DEFAULT_APPEARANCE} from './cosmetics';
import type {Appearance} from './cosmetics';
import type {GameMode} from './gun-game';
import type {GadgetId} from './gadgets';
import type {Modifiers} from './modifiers';
export const TARGET_KILLS = 20;
export const MAX_PLAYERS = 8;
export const WEAPONS:Record<WeaponId,{name:string;short:string;damage:number;interval:number;mag:number;reload:number;range:number;spread:number;pellets:number;color:number;description:string;ability:string}> = {
 rifle:{name:'Wayfinder AR',short:'Rifle',damage:8,interval:.13,mag:30,reload:1.7,range:100,spread:.014,pellets:1,color:0xd4e4da,description:'A softer-hitting automatic rifle. Hold Left Ctrl or right click to focus and tighten your shots.',ability:'Left Ctrl / right click: focus · Shift: sprint'},
 shotgun:{name:'Breachcaster',short:'Shotgun',damage:4,interval:.78,mag:8,reload:2.2,range:28,spread:.065,pellets:8,color:0xd8a586,description:'Eight pellets and room to counterplay. Get close or focus to narrow the spread.',ability:'Left Ctrl / right click: focus · Shift: sprint'},
 sniper:{name:'Longshot',short:'Sniper',damage:999,interval:1.2,mag:5,reload:2.6,range:140,spread:.001,pellets:1,color:0xe1c68f,description:'One shot. One elimination. Any hit is lethal, even through full shields.',ability:'Left Ctrl / right click: scope · click: fire · one-shot elimination'},
 aote:{name:'Aspect of the End',short:'AOTE',damage:15,interval:.36,mag:0,reload:0,range:3.8,spread:0,pellets:1,color:0x74c8c5,description:'Find this sword on the ground. Chain quick teleports across the arena. Instant Transmission blinks through open space.',ability:'Aim + click: launch · V: teleport · 15 mana · 0.22s'},
 aotd:{name:'Aspect of the Dragons',short:'AOTD',damage:999,interval:.5,mag:0,reload:0,range:4.2,spread:0,pellets:1,color:0xdd9a78,description:'Drop only. One devastating use. Any hit eliminates; the sword is consumed even if you miss.',ability:'ONE USE · aim + click: launch · V: Dragon Rage · no mana cost'},
};
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
export const PICKUP_COLORS:Record<PickupKind,number> = {health:0xe89080,shield:0xa4d5df,mana:0x7bd6bd,haste:0xf5d388};
export interface Vec3 {x:number;y:number;z:number;}
export interface Player extends Vec3 {
 id:string;name:string;yaw:number;pitch:number;hp:number;shield:number;mana:number;kills:number;deaths:number;
 parkourStep?:number;checkpoint?:number;falls?:number;weapon:WeaponId;gunGameStage:number|null;aoteOwned:boolean;aotdCharges:number;appearance:Appearance;life:number;gadget:GadgetId|null;gadgetCharges:number;gadgetUntil:number;chilledUntil:number;lastHitAt:number;reloadDuration:number;grounded:boolean;focused:boolean;bot:boolean;color:number;deadUntil:number;protectedUntil:number;warp:number;
 ammo:Record<WeaponId,number>;reloadUntil:number;reloading:WeaponId|null;nextFire:number;abilityUntil:number;lungeUntil:number;lunging:boolean;grenadeUntil:number;healUntil:number;grappleUntil:number;hasteUntil:number;
}
export type Action = {type:'fire'} | {type:'lunge'} | {type:'reload'} | {type:'ability'} | {type:'grenade'} | {type:'heal'} | {type:'grapple'} | {type:'pickup'} | {type:'gadget'};
export interface Movement extends Vec3 {yaw:number;pitch:number;weapon:WeaponId;grounded:boolean;focused?:boolean;warp?:number;}
export interface GameEvent {id:number;type:'lunge'|'shot'|'hit'|'kill'|'teleport'|'blast'|'heal'|'pickup'|'grenade'|'explode'|'grapple'|'jump'|'consume'|'push'|'gadget'|'announcement'|'end';from?:string;to?:string;position?:Vec3;end?:Vec3;color?:number;value?:number;text?:string;headshot?:boolean;pellet?:number;variant?:number;}
export interface Grenade extends Vec3 {id:number;owner:string;vx:number;vy:number;vz:number;expires:number;kind?:'bonzo'|'nuke';}
export interface Field extends Vec3 {id:number;owner:string;kind:'gravity_orb'|'healing_totem';expires:number;nextPulse:number;radius:number;}
export interface Snapshot {time:number;arenaId?:ArenaId;gameMode?:GameMode;gunOrder?:number[];courseSeed?:number;nukeUnlocked?:boolean;players:Player[];pickups:Record<string,number>;loot?:Record<string,number>;modifiers?:Modifiers;grenades:Grenade[];fields?:Field[];winner:string|null;round:number;events:GameEvent[];}
export const COLORS=[0x72aaa2,0xd28e77,0xb6c678,0xc6b4d5,0xe0b879,0x8cbad4,0xd296a6,0xc8cabe];
export const BOT_NAMES=['Juniper','Cinder','Moss','Kestrel','Flint','Echo'];
export const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
export const dist=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export const direction=(yaw:number,pitch:number):Vec3=>({x:-Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)});
export function newPlayer(id:string,name:string,color:number,bot=false):Player {
 return {id,name:name.trim().slice(0,18)||'Wanderer',x:0,y:0,z:0,yaw:0,pitch:0,hp:100,shield:50,mana:100,kills:0,deaths:0,weapon:'rifle',gunGameStage:null,aoteOwned:false,aotdCharges:0,appearance:{...DEFAULT_APPEARANCE,accent:color},life:0,gadget:null,gadgetCharges:0,gadgetUntil:0,chilledUntil:0,lastHitAt:0,reloadDuration:0,grounded:true,focused:false,bot,color,deadUntil:0,protectedUntil:0,warp:0,ammo:{rifle:30,shotgun:8,sniper:5,aote:0,aotd:0},reloadUntil:0,reloading:null,nextFire:0,abilityUntil:0,lungeUntil:0,lunging:false,grenadeUntil:0,healUntil:0,grappleUntil:0,hasteUntil:0};
}
