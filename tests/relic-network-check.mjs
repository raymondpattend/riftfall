import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const hostContext=await browser.newContext({viewport:{width:1440,height:900}});
const guestContext=await browser.newContext({viewport:{width:1280,height:800}});
const host=await hostContext.newPage(),guest=await guestContext.newPage(),errors=[];
for(const page of [host,guest]){page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));}
const report=s=>process.stdout.write(s+'\n');
try{
 await host.goto('http://localhost:5173/');await host.getByRole('button',{name:'Host a room',exact:true}).click();await host.getByLabel('Bot count').selectOption('0');await host.getByRole('button',{name:'CREATE ROOM',exact:true}).click();await host.waitForFunction(()=>window.__riftfall.mode==='host'&&window.__riftfall.room,undefined,{timeout:30000});
 const room=await host.evaluate(()=>window.__riftfall.room);await guest.goto('http://localhost:5173/?room='+room);await guest.getByLabel('Your callsign').fill('Relic Guest');await guest.getByRole('button',{name:'JOIN ROOM',exact:true}).click();await guest.getByRole('button',{name:'Resume game'}).waitFor({timeout:30000});await guest.getByRole('button',{name:'Resume game'}).click();await guest.waitForFunction(()=>document.pointerLockElement);
 await host.evaluate(()=>window.__riftfall.setModifiers({partyLoot:true,extraJumps:true,fastReload:true}));await guest.waitForFunction(()=>window.__riftfall.player.gadget&&window.__riftfall.snapshot.modifiers.extraJumps);
 assert.ok(await guest.evaluate(async()=>{const {GADGETS}=await import('/src/gadgets.ts');return window.__riftfall.player.gadgetCharges===GADGETS[window.__riftfall.player.gadget].charges*2;}));
 await guest.evaluate(()=>window.__riftfall.setModifiers({oneTap:true,speed:3}));await guest.waitForTimeout(150);assert.equal(await host.evaluate(()=>window.__riftfall.snapshot.modifiers.oneTap),false);assert.equal(await guest.evaluate(()=>window.__riftfall.snapshot.modifiers.speed),1);report('PASS network party-loot gifts, doubled charges, new modifiers and guest permission guard');
 await host.evaluate(()=>window.__riftfall.setModifiers({partyLoot:false,extraJumps:false,fastReload:false}));
 async function positionGuest(x,z){
  await host.evaluate(({x,z})=>{const e=window.__riftfall;const p=[...e.sim.players.values()].find(p=>p.name==='Relic Guest');Object.assign(p,{x,y:0,z,hp:100,shield:50,gadgetUntil:0,chilledUntil:0,protectedUntil:0});p.warp++;e.sim.fields=[];e.sim.grenades=[];},{x,z});
  await guest.waitForFunction(({x,z})=>Math.abs(window.__riftfall.body.x-x)<.2&&Math.abs(window.__riftfall.body.z-z)<.2,{x,z});
  await guest.evaluate(()=>{window.__riftfall.yaw=0;window.__riftfall.pitch=0;});
 }
 async function collect(kind){
  const item=await host.evaluate(async kind=>(await import('/src/loot-rules.ts')).GROUND_LOOT.find(i=>i.kind===kind),kind);
  await positionGuest(item.x,item.z);await guest.keyboard.press('KeyG');await guest.waitForFunction(kind=>window.__riftfall.player.gadget===kind,kind);await positionGuest(0,32);
  await host.evaluate(()=>{const e=window.__riftfall;e.impulse.set(0,0,0);Object.assign(e.body,{x:0,y:0,z:26,vx:0,vy:0,vz:0,grounded:true,jumps:0});Object.assign(e.sim.players.get('host'),{x:0,y:0,z:26,hp:100,shield:0,chilledUntil:0,protectedUntil:0});});
 }
 await collect('ice_wand');await guest.keyboard.press('KeyX');await host.waitForFunction(()=>window.__riftfall.player.chilledUntil>window.__riftfall.snapshot.time);await host.getByText('CHILLED',{exact:true}).waitFor();await guest.waitForFunction(()=>window.__riftfall.player.gadgetCharges===1);report('PASS guest Ice Spray slows host, displays chilled status and synchronizes charges');
 await collect('swap_pearl');await guest.keyboard.press('KeyX');await guest.waitForFunction(()=>Math.abs(window.__riftfall.body.z-26)<.2);await host.waitForFunction(()=>Math.abs(window.__riftfall.body.z-32)<.2);await guest.waitForTimeout(300);assert.ok(await guest.evaluate(()=>Math.abs(window.__riftfall.body.z-26)<.2));assert.equal(await guest.evaluate(()=>window.__riftfall.player.gadget),null);report('PASS live two-way Swap Pearl position exchange and consumed charge');
 await collect('gravity_orb');await host.evaluate(()=>{const e=window.__riftfall;e.body.z=20;e.sim.players.get('host').z=20;});await guest.keyboard.press('KeyX');await host.waitForFunction(()=>window.__riftfall.fieldMeshes.size===1);await guest.waitForFunction(()=>window.__riftfall.fieldMeshes.size===1);await host.waitForFunction(()=>window.__riftfall.body.z>20.4);report('PASS shared vortex graphics and actual gravity pull on remote host');
 await collect('healing_totem');await host.evaluate(()=>{const e=window.__riftfall;e.body.z=28;Object.assign(e.sim.players.get('host'),{z:28,hp:40});});await guest.keyboard.press('KeyX');await host.waitForFunction(()=>window.__riftfall.player.hp>=45);assert.ok(await guest.evaluate(()=>window.__riftfall.snapshot.fields.some(f=>f.kind==='healing_totem')));report('PASS shared healing field heals the opposing player');
 await collect('rocket_boots');await guest.keyboard.press('KeyX');await guest.waitForFunction(()=>window.__riftfall.body.y>3);await host.waitForFunction(()=>window.__riftfall.snapshot.players.find(p=>p.name==='Relic Guest').y>3);await guest.waitForFunction(()=>window.__riftfall.player.gadgetCharges===1);report('PASS rocket impulse moves guest and synchronizes airborne position to host');
 assert.deepEqual(errors,[]);report('PASS no browser runtime errors in online relic play');
}catch(error){await guest.screenshot({path:'/tmp/riftfall-relic-network-failure.png'});console.error(error);process.exitCode=1;}finally{await browser.close();}
