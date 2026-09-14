import type {Appearance} from './cosmetics';
import type {Action,Movement,Snapshot} from './rules';
import type {Modifiers} from './modifiers';
import type {ArenaId} from './world-types';
import type {GameMode} from './gun-game';
export interface ChatEntry {id:string;name:string;text:string;system:boolean;}
export interface RoomOptions {name:string;appearance?:Appearance;arena:ArenaId;gameMode:GameMode;bots:number;modifiers:Partial<Modifiers>;}
export interface CommandResult {id:string;seq:number;receivedAt:number;resolvedAt:number;status:'accepted'|'rejected'|'expired';reason:string;}
export interface Command {stage?:number|null;inputSeq:number;seq:number;warp:number;at:number;viewAt:number;yaw:number;pitch:number;weapon:Movement['weapon'];focused:boolean;action:Action;}
export type Packet={type:'inputs';inputs:import('./movement').MoveInput[]}|{type:'command';command:Command}|{type:'owner';id:string}|{type:'modifiers';modifiers:Partial<Modifiers>}|{type:'restart'}|{type:'chat';text:string}|{type:'room-message';entry:ChatEntry}|{type:'hello';name:string;appearance?:Appearance}|{type:'appearance';appearance:Appearance}|{type:'move';movement:Movement}|{type:'action';action:Action}|{type:'snapshot';snapshot:Snapshot;delivery?:number;results?:CommandResult[]}|{type:'snapshot-ack';delivery:number}|{type:'error';message:string}|{type:'ping';at:number}|{type:'pong';at:number;serverTime?:number};
