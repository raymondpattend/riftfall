import * as THREE from 'three';
import type {ArenaAsset,ArenaId} from '../world-types';
import {courseFor,courseColliders,platformAt,PARKOUR_LENGTH,CHECKPOINT_INTERVAL} from '../parkour';
export function createParkourArena(id:ArenaId,seed=1):ArenaAsset{
 const group=new THREE.Group(),course=courseFor(id,seed),objects:THREE.Group[]=[];
 const colliders=courseColliders(id,seed);
 course.forEach((p,i)=>{
  const platform=new THREE.Group();objects.push(platform);group.add(platform);
  const material=new THREE.MeshStandardMaterial({color:p.isCheckpoint?0xbddace:p.kind==='moving'?0x9ebdb4:id==='switchback'?0x8e7968:0x587d72,roughness:.8});
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(p.width,1.2,p.depth),material);mesh.position.y=-.6;mesh.castShadow=true;mesh.receiveShadow=true;platform.add(mesh);
  const rock=new THREE.Mesh(new THREE.ConeGeometry(Math.min(p.width,p.depth)*.65,3.5,5),new THREE.MeshStandardMaterial({color:0x3c574f,roughness:1,flatShading:true}));rock.rotation.z=Math.PI;rock.rotation.y=i*.8;rock.position.y=-2.8;platform.add(rock);
  if(p.isCheckpoint){const post=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,2.5,6),new THREE.MeshStandardMaterial({color:0x243f34}));post.position.set(-p.width/2+.2,1.25,0);platform.add(post);const flag=new THREE.Mesh(new THREE.PlaneGeometry(.85,.5),new THREE.MeshStandardMaterial({color:0xe1eee5,side:THREE.DoubleSide}));flag.position.set(post.position.x+.42,2.2,0);platform.add(flag);}
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#172c26';ctx.fillRect(0,0,512,128);ctx.fillStyle='#ffffff';ctx.font='bold 34px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(i===PARKOUR_LENGTH?'FINISH':i===0?'START':p.isCheckpoint?`CHECKPOINT ${i/CHECKPOINT_INTERVAL}`:`${i} · ${p.kind.replace('-',' ').toUpperCase()}`,256,64);
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(2.5,.625),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),side:THREE.DoubleSide}));sign.position.set(0,1.6,-p.depth/2);platform.add(sign);
 });
 const update=(time:number)=>{const bounds=courseColliders(id,seed,time);course.forEach((base,i)=>{const p=platformAt(base,time);objects[i].position.set(p.x,p.y,p.z);Object.assign(colliders[i],bounds[i]);});};update(0);
 return {group,colliders,courseSeed:seed,spawns:[{x:course[0].x,y:course[0].y,z:course[0].z,yaw:0}],pickups:[],jumpPads:[],loot:[],background:0x72988e,fog:0x94b5aa,update};
}
