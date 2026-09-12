import type { Collider } from './world-types';
import type { Vec3 } from './rules';
export const RADIUS=.34;
export const HEIGHT=1.8;
export interface Body extends Vec3 {vx:number;vy:number;vz:number;grounded:boolean;jumps:number;}
export function blocked(p:Vec3,colliders:Collider[],height=HEIGHT):boolean {
 return colliders.some(c=>p.x+RADIUS>c.minX&&p.x-RADIUS<c.maxX&&p.z+RADIUS>c.minZ&&p.z-RADIUS<c.maxZ&&p.y+height>c.minY+.015&&p.y<c.maxY-.015);
}
export function stepBody(b:Body,dt:number,colliders:Collider[],height=HEIGHT,gravity=22):void {
 const steps=Math.max(1,Math.ceil(Math.max(Math.abs(b.vx),Math.abs(b.vy)+gravity*dt,Math.abs(b.vz))*dt/.2));
 for(let i=0;i<steps;i++)stepBodySlice(b,dt/steps,colliders,height,gravity);
}
function stepBodySlice(b:Body,dt:number,colliders:Collider[],height:number,gravity:number):void {
 const previousGrounded=b.grounded;
 for(const axis of ['x','z'] as const){
  const velocity=axis==='x'?b.vx:b.vz;
  const before=b[axis];b[axis]+=velocity*dt;
  for(const c of colliders){
   if(b.x+RADIUS<=c.minX||b.x-RADIUS>=c.maxX||b.z+RADIUS<=c.minZ||b.z-RADIUS>=c.maxZ||b.y+height<=c.minY+.015||b.y>=c.maxY-.015)continue;
   if(previousGrounded && c.maxY-b.y>0 && c.maxY-b.y<=.43){
    const stepped={x:b.x,y:c.maxY+.01,z:b.z};
    if(!blocked(stepped,colliders,height)){b.y=stepped.y;continue;}
   }
   b[axis]=before;
  }
 }
 b.vy-=gravity*dt;
 const oldY=b.y;b.y+=b.vy*dt;b.grounded=false;
 for(const c of colliders){
  if(b.x+RADIUS<=c.minX||b.x-RADIUS>=c.maxX||b.z+RADIUS<=c.minZ||b.z-RADIUS>=c.maxZ)continue;
  if(b.vy<=0&&oldY>=c.maxY-.03&&b.y<=c.maxY){b.y=c.maxY;b.vy=0;b.grounded=true;b.jumps=0;}
  else if(b.vy>0&&oldY+height<=c.minY+.03&&b.y+height>=c.minY){b.y=c.minY-height;b.vy=0;}
 }
}
export function rayBox(origin:Vec3,d:Vec3,c:Collider):number {
 let lo=0,hi=Infinity;
 for(const axis of ['x','y','z'] as const){
  const min=axis==='x'?c.minX:axis==='y'?c.minY:c.minZ;
  const max=axis==='x'?c.maxX:axis==='y'?c.maxY:c.maxZ;
  if(Math.abs(d[axis])<1e-8){if(origin[axis]<min||origin[axis]>max)return Infinity;continue;}
  let a=(min-origin[axis])/d[axis],b=(max-origin[axis])/d[axis];if(a>b)[a,b]=[b,a];
  lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return Infinity;
 }
 return hi>=0?lo:Infinity;
}
export function rayWorld(o:Vec3,d:Vec3,colliders:Collider[],max=200):number {
 let hit=max;for(const c of colliders)hit=Math.min(hit,rayBox(o,d,c));return hit;
}
export function raySphere(o:Vec3,d:Vec3,center:Vec3,r:number):number {
 const x=o.x-center.x,y=o.y-center.y,z=o.z-center.z;
 const b=x*d.x+y*d.y+z*d.z,c=x*x+y*y+z*z-r*r,disc=b*b-c;
 if(disc<0)return Infinity;const t=-b-Math.sqrt(disc);return t>=0?t:Infinity;
}
export function safeBlink(p:Vec3,d:Vec3,colliders:Collider[],distance=9):Vec3 {
 let safe={...p};
 for(let t=.2;t<=distance;t+=.2){const next={x:p.x+d.x*t,y:p.y+d.y*t,z:p.z+d.z*t};if(blocked(next,colliders))break;safe=next;}
 return safe;
}
