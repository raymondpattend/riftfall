import type {GroundLootPoint} from './loot-rules';
import type * as THREE from 'three';
export interface Collider { minX:number; maxX:number; minY:number; maxY:number; minZ:number; maxZ:number; }
export interface SpawnPoint { x:number; y:number; z:number; yaw:number; }
export type PickupKind = 'health' | 'shield' | 'mana' | 'haste';
export interface PickupPoint { id:string; kind:PickupKind; x:number; y:number; z:number; }
export interface JumpPad { x:number; y:number; z:number; radius:number; power:number; }
export type ArenaId = 'crown' | 'foundry' | 'glacier' | 'dunes';
export interface ArenaAsset { loot?:GroundLootPoint[];name?:string;background?:number;fog?:number; group:THREE.Group; colliders:Collider[]; spawns:SpawnPoint[]; pickups:PickupPoint[]; jumpPads:JumpPad[]; update:(time:number,dt:number)=>void; }
export type WeaponId = 'rifle' | 'shotgun' | 'sniper' | 'aote' | 'aotd';
