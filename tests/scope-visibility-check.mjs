import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const output='/tmp/riftfall-all-sights';await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
try{
 const page=await browser.newPage();await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.__riftfall);
 await page.evaluate(()=>{const e=window.__riftfall;e.startPractice('Sight audit',0);e.running=false;cancelAnimationFrame(e.raf);e.locked=true;e.time=10;e.stepTime=0;e.yaw=0;e.pitch=0;e.keys.clear();});
 const guns=await page.evaluate(async()=>{const {GUN_GAME_STAGES}=await import('/src/gun-game.ts');return [...['rifle','shotgun','sniper'].map(weapon=>({id:'base-'+weapon,weapon,index:null})),...GUN_GAME_STAGES.map((s,index)=>({id:s.id,weapon:s.weapon,index})).filter(s=>!['aote','aotd'].includes(s.weapon))];});
 for(const viewport of [{width:1440,height:900},{width:800,height:600}]){
  await page.setViewportSize(viewport);const images=[];
  for(const gun of guns){
   const rows=await page.evaluate(async({gun,viewport})=>{
    const THREE=await import('/node_modules/.vite/deps/three.js');const {createGunGameWeapon}=await import('/src/assets/gun-game-weapons.ts');const e=window.__riftfall;
    if(gun.index!==null&&!e.variantMeshes.has(gun.index)){const mesh=createGunGameWeapon(gun.index);e.variantMeshes.set(gun.index,mesh);e.weaponRoot.add(mesh);}
    e.equippedStage=gun.index;e.equip(gun.weapon);e.player.weapon=gun.weapon;e.swapStart=-10;e.swapUntil=-1;e.player.reloading=null;e.swingUntil=0;e.keys.clear();e.stepTime=0;
    const model=gun.index===null?e.weaponMeshes.get(gun.weapon):e.variantMeshes.get(gun.index),rows=[];
    for(const ads of [false,true])for(const recoil of [0,.5,1])for(const sway of [-1,0,1]){
     e.reducedMotion=false;e.stepTime=sway*Math.PI/2/1.7;e.rightDown=ads;e.recoil=recoil;e.render(0);e.weaponRoot.updateMatrixWorld(true);let top=-Infinity,centerTop=-Infinity;
     model.traverse(object=>{if(!object.isMesh)return;const position=object.geometry.attributes.position;for(let i=0;i<position.count;i++){const v=new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(object.matrixWorld).project(e.viewCamera);if(v.z< -1||v.z>1)continue;top=Math.max(top,v.y);if(Math.abs(v.x)<.15)centerTop=Math.max(centerTop,v.y);}});
     rows.push({gun:gun.id,weapon:gun.weapon,viewport:viewport.width,ads,recoil,sway,visible:e.weaponRoot.visible,top,centerTop});
    }
    return rows;
   },{gun,viewport});results.push(...rows);
   const screenshot=await page.locator('canvas').first().screenshot();await writeFile(`${output}/${viewport.width}-${gun.id}.png`,screenshot);images.push({id:gun.id,data:screenshot.toString('base64')});
  }
  const gallery=await browser.newPage({viewport:{width:1600,height:Math.ceil(images.length/4)*270}});await gallery.setContent(`<body style="margin:0;background:#111;color:white;font:18px Arial;display:grid;grid-template-columns:repeat(4,1fr)">${images.map(i=>`<div style="padding:8px">${i.id} · aimed / full recoil<img style="width:100%;height:230px;object-fit:contain" src="data:image/png;base64,${i.data}"></div>`).join('')}</body>`);await gallery.screenshot({path:`${output}/overview-${viewport.width}.png`,fullPage:true});await gallery.close();
 }
 await writeFile(`${output}/measurements.json`,JSON.stringify(results,null,2));
 const failures=results.filter(r=>r.weapon==='sniper'?r.ads&&r.visible:r.top>-.08);
 console.log(JSON.stringify({guns:guns.length,poses:results.length,failures,output},null,2));
 assert.equal(failures.length,0,'Every non-sniper model must stay at least 4% of screen height below the reticle, including full recoil; sniper ADS remains hidden');
}finally{await browser.close();}
