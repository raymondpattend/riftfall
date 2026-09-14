import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});const base=process.env.BASE_URL||'https://riftfall.narroorg.workers.dev';
const host=await browser.newPage({viewport:{width:1440,height:900}}),guest=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
for(const page of [host,guest])page.on('pageerror',e=>errors.push(e.message));
async function leave(page){await page.evaluate(()=>document.exitPointerLock());await page.getByRole('button',{name:'Leave match',exact:true}).click();}
try{
 for(const mode of ['parkour','gun-game']){
  await host.goto(base);await host.getByRole('button',{name:'Host a room',exact:true}).click();await host.getByLabel('Game mode',{exact:true}).selectOption(mode);if(mode==='parkour')await host.getByLabel('Arena',{exact:true}).selectOption('sky-steps');await host.getByLabel('Bot count').selectOption('0');await host.getByRole('button',{name:'CREATE ROOM'}).click();await host.locator('.match-score span b').waitFor();
  const code=await host.locator('.match-score span b').innerText();await guest.goto(base+'/?room='+code);await guest.getByRole('button',{name:'JOIN ROOM'}).click();await guest.getByRole('button',{name:'Resume game',exact:false}).waitFor();
  if(mode==='parkour'){
   assert.match(await guest.locator('.minimap').innerText(),/Sky Steps/);assert.match(await guest.locator('.parkour-progress').innerText(),/Checkpoint 0 \/ 8/);
   await guest.getByRole('button',{name:'Resume game',exact:false}).click();await guest.keyboard.down('s');await guest.waitForTimeout(1800);await guest.keyboard.up('s');await guest.waitForFunction(()=>document.querySelector('.parkour-progress')?.textContent.includes('Falls: 1'));
   await guest.keyboard.press('q');await guest.mouse.down();await guest.mouse.up();assert.match(await guest.locator('.match-score').innerText(),/0\s*\/\s*64/);await guest.screenshot({path:'/tmp/parkour-live.png'});
  }else{
   assert.equal(await guest.locator('.stage-progress strong').innerText(),await host.locator('.stage-progress strong').innerText());assert.match(await guest.locator('.stage-progress').innerText(),/1 \/ 20/);
   assert.equal(await guest.locator('.utilities').getByText('Mend').count(),0);
  }
  await leave(guest);await leave(host);
 }
 assert.deepEqual(errors,[]);console.log('PASS public two-browser PARKOUR join, course sync, real fall/reset, blocked combat, and shared shuffled Gun Game weapon');
}finally{await browser.close();}
