import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();await page.goto('http://localhost:5173');await page.getByLabel('Game mode',{exact:true}).selectOption('gun-game');await page.getByLabel('Bot count',{exact:true}).selectOption('1');await page.getByRole('button',{name:'ENTER THE ARENA'}).click();await page.waitForFunction(()=>window.__riftfall.locked);
 await page.evaluate(()=>{const e=window.__riftfall;e.setSettings({...e.settings,volume:0,quality:'low'});e.sim.brains.clear();e.sim.gunOrder=Array.from({length:20},(_,i)=>i);});
 const stages=[];
 for(let index=0;index<20;index++){
  await page.evaluate(index=>{const e=window.__riftfall,p=e.sim.players.get(e.localId);p.kills=index;e.sim.equipStage(p);p.nextFire=0;e.receiveSnapshot(e.sim.snapshot());e.pitch=.5;e.lastFire=-10;},index);await page.waitForTimeout(380);await page.evaluate(()=>{window.__riftfall.shotDiagnostics.length=0;});await page.mouse.down();await page.mouse.up();
  await page.waitForFunction(()=>window.__riftfall.shotDiagnostics.some(d=>d.phase==='authoritative result'));
  const data=await page.evaluate(()=>{const e=window.__riftfall;return {stage:e.equippedStage,weapon:e.weapon,result:e.shotDiagnostics.find(d=>d.phase==='authoritative result').detail,provisional:e.shotDiagnostics.filter(d=>d.phase==='provisional tracer').length};});assert.equal(data.stage,index);assert.equal(data.result.status,'accepted');if(index<16)assert.equal(data.provisional,1);stages.push(data);
 }
 console.log(JSON.stringify({pass:true,muted:true,stages},null,2));
}finally{await browser.close();}
