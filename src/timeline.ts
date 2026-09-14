import type {Player,Snapshot,Vec3} from './rules';
export const INTERPOLATION_DELAY=.1;
export const MAX_REWIND=.5;
export function historicalPosition(history:Pick<Snapshot,'time'|'players'>[],p:Player,at:number):Vec3|null {
 let before:Player|undefined,after:Player|undefined,lo=0,hi=0;
 for(const frame of history){const candidate=frame.players.find(v=>v.id===p.id);if(!candidate)continue;
  if(frame.time<=at){before=candidate;lo=frame.time;}else{after=candidate;hi=frame.time;break;}}
 if(!before)return null;
 if(before.life!==p.life||before.warp!==p.warp||before.hp<=0)return null;
 if(!after)return {x:before.x,y:before.y,z:before.z};
 if(after.life!==p.life||after.warp!==p.warp||after.hp<=0)return null;
 const t=Math.max(0,Math.min(1,(at-lo)/Math.max(.00001,hi-lo)));
 return {x:before.x+(after.x-before.x)*t,y:before.y+(after.y-before.y)*t,z:before.z+(after.z-before.z)*t};
}
