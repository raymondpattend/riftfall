import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(process.env.BASE_URL||'http://localhost:5178');
 await page.getByLabel('Game mode',{exact:true}).selectOption('parkour');
 assert.equal(await page.getByLabel('Arena',{exact:true}).locator('option').count(),2);
 await page.getByLabel('Arena',{exact:true}).selectOption('switchback');await page.getByLabel('Bot count').selectOption('3');
 await page.screenshot({path:'/tmp/parkour-lobby.png'});
 await page.getByRole('button',{name:'ENTER THE ARENA'}).click();
 await page.waitForFunction(()=>window.__riftfall?.snapshot?.gameMode==='parkour');
 await page.keyboard.press('KeyQ');await page.keyboard.press('KeyF');await page.keyboard.press('KeyE');await page.mouse.down();await page.mouse.up();
 assert.equal(await page.evaluate(()=>window.__riftfall.sim.grenades.length),0);
 await page.keyboard.down('KeyW');await page.keyboard.press('Space');await page.waitForTimeout(550);await page.keyboard.up('KeyW');
 assert.ok(await page.evaluate(()=>window.__riftfall.body.z<34));
 await page.screenshot({path:'/tmp/parkour-game.png'});
 await page.evaluate(()=>{const e=window.__riftfall;Object.assign(e.body,{x:15,y:-10,z:30,vx:0,vy:0,vz:0});Object.assign(e.sim.players.get('host'),{x:15,y:-10,z:30});});
 await page.waitForFunction(()=>(window.__riftfall.player.falls??0)>0);assert.equal(await page.evaluate(()=>window.__riftfall.player.hp),100);

 const carried=await page.evaluate(async()=>{const {courseFor}=await import('/src/parkour.ts');const e=window.__riftfall,i=courseFor(e.arenaId,e.snapshot.courseSeed).findIndex(p=>p.travel>0),b=e.arena.colliders[i],p=e.sim.players.get('host');Object.assign(p,{x:(b.minX+b.maxX)/2,y:b.maxY,z:(b.minZ+b.maxZ)/2,parkourStep:i,grounded:true});p.warp++;e.receiveSnapshot(e.sim.snapshot());return {i,x:p.x};});
 await page.waitForTimeout(1400);
 const riding=await page.evaluate(i=>{const e=window.__riftfall,b=e.arena.colliders[i];return {x:e.body.x,center:(b.minX+b.maxX)/2,grounded:e.body.grounded};},carried.i);
 assert.ok(riding.grounded);assert.ok(Math.abs(riding.x-riding.center)<.2);assert.ok(Math.abs(riding.x-carried.x)>.02);
 await page.evaluate(()=>{const e=window.__riftfall,p=e.sim.players.get('host');p.parkourStep=0;p.checkpoint=0;});
 // Walk authoritative landing sequence, keeping client and host in sync.
 for(let i=1;i<=64;i++)await page.evaluate(async i=>{const e=window.__riftfall,box=e.arena.colliders[i],c={x:(box.minX+box.maxX)/2,y:box.maxY,z:(box.minZ+box.maxZ)/2},p=e.sim.players.get('host');Object.assign(p,c,{grounded:true});Object.assign(e.body,c,{grounded:true,vx:0,vy:0,vz:0});e.sim.tick(0);e.receiveSnapshot(e.sim.snapshot());},i);
 await page.getByRole('heading',{name:'VICTORY.'}).waitFor();await page.screenshot({path:'/tmp/parkour-victory.png'});
 await page.getByRole('button',{name:'Run it back'}).click();assert.equal(await page.evaluate(()=>window.__riftfall.player.parkourStep),0);
 await page.evaluate(()=>document.exitPointerLock());await page.getByRole('button',{name:'Leave match'}).click();
 await page.getByLabel('Game mode',{exact:true}).selectOption('gun-game');await page.getByLabel('Bot count').selectOption('1');await page.getByRole('button',{name:'ENTER THE ARENA'}).click();
 const state=await page.evaluate(()=>({stage:window.__riftfall.player.gunGameStage,order:window.__riftfall.snapshot.gunOrder}));assert.equal(state.stage,state.order[0]);assert.deepEqual(state.order.slice(16),[16,17,18,19]);
 assert.match(await page.locator('.stage-progress').innerText(),/1 \/ 20/);
 await page.evaluate(()=>window.__riftfall.sim.players.get('host').hp=40);await page.keyboard.press('KeyF');await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.__riftfall.player.hp),40);
 assert.equal(await page.locator('.utilities').getByText('Mend').count(),0);assert.deepEqual(errors,[]);console.log('PASS mode/course controls, jumping, checkpoint reset, victory/rematch, shuffled HUD and disabled F; no browser errors');
}finally{await browser.close();}
