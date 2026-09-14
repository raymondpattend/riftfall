import {stepBody,type Body} from './physics';
import type {Player,Vec3} from './rules';
import type {Modifiers} from './modifiers';
import type {Collider,ArenaAsset} from './world-types';
export const INPUT_STEP=1/60;
export interface MoveInput {seq:number;warp:number;forward:number;strafe:number;yaw:number;pitch:number;weapon:Player['weapon'];sprint:boolean;focused:boolean;jump:boolean;slide:boolean;}
export interface Motion {body:Body;impulse:Vec3;slide:number;slideX:number;slideZ:number;pad:number;}
export function motionAt(p:Vec3):Motion {return {body:{x:p.x,y:p.y,z:p.z,vx:0,vy:0,vz:0,grounded:true,jumps:0},impulse:{x:0,y:0,z:0},slide:0,slideX:0,slideZ:0,pad:0};}
export function advanceMotion(m:Motion,i:MoveInput,p:Player,mods:Modifiers,colliders:Collider[],pads:ArenaAsset['jumpPads'],at:number,dt=INPUT_STEP){
 const b=m.body;m.slide=Math.max(0,m.slide-dt);m.pad=Math.max(0,m.pad-dt);
 if(i.jump&&b.jumps<(mods.extraJumps?4:2)){b.vy=(b.jumps===0?10:10.8)*mods.jump;b.jumps++;b.grounded=false;}
 if(i.slide&&m.slide===0&&b.grounded&&Math.hypot(b.vx,b.vz)>5){m.slide=.75;const len=Math.hypot(b.vx,b.vz);m.slideX=b.vx/len;m.slideZ=b.vz/len;}
 const len=Math.max(1,Math.hypot(i.forward,i.strafe)),f=i.forward/len,s=i.strafe/len;
 const speed=(m.slide>0?13:i.focused?3.5:i.sprint?10:6.5)*(p.hasteUntil>at?1.35:1)*(i.focused?.6:1)*mods.speed*(p.chilledUntil>at?.35:1);
 const vx=(m.slide>0?m.slideX:-Math.sin(i.yaw)*f+Math.cos(i.yaw)*s)*speed,vz=(m.slide>0?m.slideZ:-Math.cos(i.yaw)*f-Math.sin(i.yaw)*s)*speed;
 const blend=1-Math.exp(-dt*(b.grounded?16:7));b.vx+=(vx-b.vx)*blend;b.vz+=(vz-b.vz)*blend;
 const bx=b.vx,bz=b.vz;b.vx+=m.impulse.x;b.vz+=m.impulse.z;m.impulse.x*=Math.exp(-dt*2.5);m.impulse.z*=Math.exp(-dt*2.5);
 stepBody(b,dt,colliders,1.8,mods.lowGravity?9:22);b.vx=bx;b.vz=bz;
 if(b.grounded&&m.pad===0)for(const pad of pads)if(Math.hypot(b.x-pad.x,b.z-pad.z)<pad.radius&&Math.abs(b.y-pad.y)<.55){b.vy=pad.power*Math.sqrt(mods.jump);b.grounded=false;b.jumps=1;m.pad=.8;break;}
}
export function validInput(i:MoveInput){return i&&Number.isSafeInteger(i.seq)&&i.seq>0&&Number.isSafeInteger(i.warp)&&[i.forward,i.strafe,i.yaw,i.pitch].every(Number.isFinite)&&Math.abs(i.forward)<=1&&Math.abs(i.strafe)<=1&&Math.abs(i.yaw)<=1e6&&Math.abs(i.pitch)<=1.5&&['sprint','focused','jump','slide'].every(k=>typeof i[k as keyof MoveInput]==='boolean');}
