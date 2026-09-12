import {GADGETS,GADGET_IDS} from './gadgets';
import type {GadgetId} from './gadgets';
import type {WeaponId} from './world-types';
export type GroundLootKind=WeaponId|GadgetId|'rift_orb'|'dragon_heart';
export interface GroundLootPoint {id:string;kind:GroundLootKind;x:number;y:number;z:number;}
export const GROUND_LOOT:GroundLootPoint[]=[
 {id:'gadget-nuke',kind:'nuke',x:0,y:0,z:-35},
 {id:'gadget-ice',kind:'ice_wand',x:-12,y:0,z:0},
 {id:'gadget-bonzo',kind:'bonzo_staff',x:12,y:0,z:0},
 {id:'gadget-pearl',kind:'swap_pearl',x:0,y:0,z:16},
 {id:'gadget-gravity',kind:'gravity_orb',x:0,y:0,z:-16},
 {id:'gadget-totem',kind:'healing_totem',x:-35,y:0,z:0},
 {id:'gadget-rocket',kind:'rocket_boots',x:35,y:0,z:0},
 {id:'loot-aote',kind:'aote',x:0,y:0,z:26},
 {id:'loot-dragon',kind:'aotd',x:0,y:0,z:-26},
 {id:'loot-sniper',kind:'sniper',x:26,y:5.4,z:-24.5},
 {id:'loot-shotgun',kind:'shotgun',x:-27,y:2.4,z:23},
 {id:'loot-rifle',kind:'rifle',x:-26,y:0,z:0},
 {id:'loot-orb',kind:'rift_orb',x:26,y:0,z:0},
 {id:'loot-orb-west',kind:'rift_orb',x:-35.6,y:0,z:29},
 {id:'loot-heart',kind:'dragon_heart',x:24,y:1.2,z:27},
 {id:'loot-heart-north',kind:'dragon_heart',x:-27,y:3.6,z:-20.4},
];
export const LOOT_LABELS:Record<GroundLootKind,string>={...Object.fromEntries(GADGET_IDS.map(id=>[id,GADGETS[id].name])) as Record<GadgetId,string>,rifle:'Rare Wayfinder AR',shotgun:'Epic Breachcaster',sniper:'Legendary Longshot',aote:'Aspect of the End',aotd:'Aspect of the Dragons',rift_orb:'Rift Orb',dragon_heart:'Dragon Heart'};
export const LOOT_DESCRIPTIONS:Record<GroundLootKind,string>={...Object.fromEntries(GADGET_IDS.map(id=>[id,`${GADGETS[id].charges} use${GADGETS[id].charges>1?'s':''} · X to activate · replaces carried relic`])) as Record<GadgetId,string>,rifle:'Equip + full magazine',shotgun:'Equip + full magazine',sniper:'Equip + full magazine',aote:'Equip + restore mana',aotd:'One use · instant elimination · consumed on use',rift_orb:'Full mana + reset ability cooldowns',dragon_heart:'Full shield + 35 health'};
