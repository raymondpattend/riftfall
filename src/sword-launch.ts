import {direction, dist} from './rules';
import type {Player} from './rules';
import {raySphere, rayWorld} from './physics';
import type {Collider} from './world-types';

/** The crosshair and host use the same visible-target selection. */
export function swordTarget(player:Player, players:Iterable<Player>, colliders:Collider[]):Player|null {
 const origin={x:player.x,y:player.y+1.55,z:player.z}, aim=direction(player.yaw,player.pitch);
 let nearest=rayWorld(origin,aim,colliders,24), selected:Player|null=null;
 for(const target of players){
  if(target.id===player.id||target.hp<=0||dist(player,target)>24)continue;
  const hit=Math.min(...[.4,1,1.55].map(y=>raySphere(origin,aim,{x:target.x,y:target.y+y,z:target.z},.58)));
  const center={x:target.x,y:target.y+1,z:target.z}, length=dist(origin,center);
  const toward={x:(center.x-origin.x)/length,y:(center.y-origin.y)/length,z:(center.z-origin.z)/length};
  if(hit<nearest&&rayWorld(origin,toward,colliders,length)>=length-.05){selected=target;nearest=hit;}
 }
 return selected;
}

/** A short right-shift tap latches; either Shift can be held for momentary sprint. */
export class SprintInput {
 toggled=false;
 private rightAt:number|null=null;
 private left=false;
 down(code:string,time:number){if(code==='ShiftRight'&&this.rightAt===null)this.rightAt=time;if(code==='ShiftLeft')this.left=true;}
 up(code:string,time:number){if(code==='ShiftRight'&&this.rightAt!==null){if(time-this.rightAt<=.25)this.toggled=!this.toggled;this.rightAt=null;}if(code==='ShiftLeft')this.left=false;}
 get active(){return this.toggled||this.rightAt!==null||this.left;}
 reset(){this.toggled=false;this.rightAt=null;this.left=false;}
}
