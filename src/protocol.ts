import type {Appearance} from './cosmetics';
import type {Action,Movement,Snapshot} from './rules';
import type {Modifiers} from './modifiers';
import type {ArenaId} from './world-types';
import type {GameMode} from './gun-game';
export interface ChatEntry {id:string;name:string;text:string;system:boolean;}
export interface RoomOptions {name:string;appearance?:Appearance;arena:ArenaId;gameMode:GameMode;bots:number;modifiers:Partial<Modifiers>;}
export type Packet={type:'owner';id:string}|{type:'modifiers';modifiers:Partial<Modifiers>}|{type:'restart'}|{type:'chat';text:string}|{type:'room-message';entry:ChatEntry}|{type:'hello';name:string;appearance?:Appearance}|{type:'appearance';appearance:Appearance}|{type:'move';movement:Movement}|{type:'action';action:Action}|{type:'snapshot';snapshot:Snapshot}|{type:'error';message:string}|{type:'ping';at:number}|{type:'pong';at:number};
