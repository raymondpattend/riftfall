import type {ArenaId,Collider} from './world-types';
export const PARKOUR_LENGTH=64;
export const CHECKPOINT_INTERVAL=8;
export const isParkourArena=(id:ArenaId)=>id==='sky-steps'||id==='switchback';
export interface ParkourPlatform {x:number;y:number;z:number;width:number;depth:number;isCheckpoint:boolean;kind:string;travel:number;phase:number;}
const cache=new Map<string,ParkourPlatform[]>();
export function courseFor(id:ArenaId,seed=1):ParkourPlatform[]{
 const key=`${id}:${seed}`;const existing=cache.get(key);if(existing)return existing;
 let state=seed>>>0;const random=()=>{state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
 let x=0,y=0,z=34;
 const platforms=Array.from({length:PARKOUR_LENGTH+1},(_,i)=>{
  const isCheckpoint=i%CHECKPOINT_INTERVAL===0;
  const kinds=['island','precision','beam','side-step','long-jump','moving','stair'];
  const kind=isCheckpoint?'checkpoint':kinds[Math.floor(random()*kinds.length)];
  if(i){x=Math.max(-22,Math.min(22,x+(kind==='side-step'?(random()<.5?-1:1)*3.8:(random()-.5)*(id==='switchback'?5:3))));z-=kind==='long-jump'?6.5:3.8+random()*1.2;y=Math.max(0,y+(kind==='stair'?1.1:random()*.9-.35));}
  const width=isCheckpoint?5:kind==='precision'?1.4:kind==='beam'?1.1:kind==='moving'?3:2.3+random();
  const depth=isCheckpoint?4.5:kind==='beam'?3.6:kind==='precision'?1.6:2.4;
  return {x,y,z,width,depth,isCheckpoint,kind,travel:kind==='moving'?.75:0,phase:random()*Math.PI*2};
 });
 if(cache.size>24)cache.clear();cache.set(key,platforms);return platforms;
}
export function platformAt(p:ParkourPlatform,time:number){return {...p,x:p.x+Math.sin(time*.8+p.phase)*p.travel};}
export function courseColliders(id:ArenaId,seed:number,time=0):Collider[]{return courseFor(id,seed).map(base=>{const p=platformAt(base,time);return {minX:p.x-p.width/2,maxX:p.x+p.width/2,minY:p.y-1.2,maxY:p.y,minZ:p.z-p.depth/2,maxZ:p.z+p.depth/2};});}
