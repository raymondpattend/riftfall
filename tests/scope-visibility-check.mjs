import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.__riftfall);
 await page.evaluate(()=>{const e=window.__riftfall;e.startPractice('Sight check',0);});
 if(await page.getByRole('button',{name:'Resume game'}).count())await page.getByRole('button',{name:'Resume game'}).click();await page.keyboard.down('ControlLeft');await page.waitForTimeout(400);
 await page.screenshot({path:`/tmp/riftfall-sights-${process.env.BEFORE?'before':'after'}.png`});
 if(!process.env.BEFORE){
 const checked=await page.evaluate(async()=>{
  const {createGunGameWeapon}=await import('/src/assets/gun-game-weapons.ts');const {GUN_GAME_STAGES}=await import('/src/gun-game.ts');const THREE=await import('/node_modules/.vite/deps/three.js');const e=window.__riftfall;e.running=false;
  const results=[];
  for(let i=0;i<16;i++){const stage=GUN_GAME_STAGES[i];if(stage.weapon==='sniper')continue;const mesh=createGunGameWeapon(i);e.variantMeshes.set(i,mesh);e.weaponRoot.add(mesh);e.equippedStage=i;e.equip(stage.weapon);e.swapUntil=-1;e.swapStart=-10;e.player.reloading=null;e.recoil=0;
   for(const ads of [false,true]){e.rightDown=ads;e.keys.clear();e.render(1/60);e.weaponRoot.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(mesh);results.push({stage:stage.id,ads,top:bounds.max.y});}
  }
  e.equippedStage=null;e.equip('sniper');e.rightDown=true;e.render(1/60);results.push({stage:'sniper',hidden:!e.weaponRoot.visible});return results;
 });
 for(const row of checked)if(row.stage==='sniper')assert.equal(row.hidden,true);else assert.ok(row.top<-.035,`${row.stage} ${row.ads?'aimed':'hip'} sight obstructs center: ${row.top}`);
 console.log(JSON.stringify({pass:true,checked},null,2));
 }
}finally{await browser.close();}
