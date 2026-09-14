import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const pages=[],errors=[];
const open=async()=>{const context=await browser.newContext({viewport:{width:1280,height:800}});if(process.env.FORCE_RELAY==='1')await context.addInitScript(()=>{const Original=window.RTCPeerConnection;window.RTCPeerConnection=class extends Original{constructor(config,...args){super({...config,iceTransportPolicy:'relay'},...args);}};});const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));pages.push(page);await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.__riftfall);await page.evaluate(()=>{const e=window.__riftfall;e.setSettings({...e.settings,quality:'low'});});return page;};
try{
 const host=await open();await host.getByRole('button',{name:'Host a room',exact:true}).click();await host.getByLabel('Bot count',{exact:true}).selectOption('0');await host.getByRole('button',{name:'CREATE ROOM',exact:true}).click();await host.waitForFunction(()=>window.__riftfall.room&&window.__riftfall.sim,{},{timeout:30000});const code=await host.evaluate(()=>window.__riftfall.room);
 const join=async name=>{const p=await open();await p.getByRole('button',{name:'Join friends',exact:true}).click();await p.getByLabel('Your callsign').fill(name);await p.getByLabel('Room code',{exact:true}).fill(code);await p.getByRole('button',{name:'JOIN ROOM',exact:true}).click();await p.waitForFunction(()=>window.__riftfall.player,{},{timeout:30000});return p;};
 const shooter=await join('Shooter'),observer=await join('Observer');
 const shooterId=await shooter.evaluate(()=>window.__riftfall.localId),observerId=await observer.evaluate(()=>window.__riftfall.localId);
 const arrange=async()=>{await host.evaluate(({shooterId,observerId})=>{const e=window.__riftfall;for(const [id,pos] of [['host',{x:0,y:0,z:28}],[shooterId,{x:0,y:0,z:40}],[observerId,{x:-8,y:0,z:36}]]){const p=e.sim.players.get(id);Object.assign(p,pos,{hp:100,shield:100,protectedUntil:0,nextFire:0,lungeUntil:0,yaw:id===observerId?-Math.PI/4:0,pitch:0});p.warp++;}e.receiveSnapshot(e.sim.snapshot());},{shooterId,observerId});await shooter.waitForFunction(()=>Math.abs(window.__riftfall.body.z-40)<.1);await shooter.evaluate(()=>{const e=window.__riftfall;e.yaw=0;e.pitch=0;e.cameraKick=0;e.cameraSideKick=0;});};
 await arrange();await shooter.getByRole('button',{name:'Resume game'}).click();
 await shooter.keyboard.press('ShiftRight');await shooter.waitForFunction(()=>window.__riftfall.sprinting);await shooter.keyboard.down('KeyW');await shooter.waitForTimeout(350);await shooter.keyboard.up('KeyW');assert.ok(await shooter.evaluate(()=>window.__riftfall.body.z<37.8));await shooter.keyboard.press('ShiftRight');assert.equal(await shooter.evaluate(()=>window.__riftfall.sprinting),false);
 await shooter.keyboard.down('ShiftRight');await shooter.waitForTimeout(350);await shooter.keyboard.up('ShiftRight');assert.equal(await shooter.evaluate(()=>window.__riftfall.sprinting),false);
 await shooter.keyboard.down('ShiftLeft');assert.equal(await shooter.evaluate(()=>window.__riftfall.sprinting),true);await shooter.keyboard.up('ShiftLeft');
 for(const key of ['Digit1','Digit2','Digit3']){await shooter.keyboard.press(key);await shooter.waitForTimeout(380);await shooter.keyboard.down('ControlLeft');await shooter.waitForFunction(()=>window.__riftfall.aiming&&window.__riftfall.player.focused);await shooter.keyboard.up('ControlLeft');await shooter.mouse.down({button:'right'});assert.equal(await shooter.evaluate(()=>window.__riftfall.aiming),true);await shooter.mouse.up({button:'right'});}
 console.log('PASS real Right Shift toggle, long hold release, Left Shift hold, Ctrl and right-click focus on all gun types');
 await shooter.keyboard.press('Digit1');await shooter.waitForTimeout(700);await arrange();
 await shooter.evaluate(()=>{const e=window.__riftfall;e.pitch=-.047;e.cameraKick=0;e.cameraSideKick=0;});
 await shooter.mouse.down();await shooter.waitForFunction(()=>window.__riftfall.hitTargets.get('host')>window.__riftfall.time);await shooter.mouse.up();
 assert.equal(await observer.evaluate(()=>window.__riftfall.hitTargets.size),0);assert.equal(await host.evaluate(()=>window.__riftfall.hitTargets.size),0);
 const traces=await shooter.evaluate(()=>({count:window.__riftfall.effects.lines.count,type:window.__riftfall.effects.lines.type}));assert.ok(traces.count>0);assert.equal(traces.type,'Mesh');
 // Freeze just the shooter's frame loop long enough to inspect the confirmed hit image.
 await shooter.evaluate(()=>{window.__riftfall.running=false;});await shooter.screenshot({path:'/tmp/riftfall-red-outline.png'});
 await shooter.evaluate(()=>{const e=window.__riftfall;e.running=true;e.lastTime=performance.now();e.frame(performance.now());});
 console.log('PASS confirmed hit outline is private to the shooter; thick bullet tracers render');
 await shooter.waitForFunction(()=>!window.__riftfall.hitTargets.has('host'));
 await shooter.keyboard.press('Digit2');await observer.waitForFunction(id=>window.__riftfall.avatars.get(id)?.asset.group.userData.swapMotion>.3,shooterId);
 assert.equal(await observer.evaluate(id=>window.__riftfall.snapshot.players.find(p=>p.id===id).weapon,shooterId),'shotgun');
 console.log('PASS remote weapon swap animates on an independent observer');
 // A real opaque arena block in front of the target must not erase the silhouette.
 await shooter.evaluate(async()=>{const e=window.__riftfall;const THREE=await import('/node_modules/.vite/deps/three.js');const wall=new THREE.Mesh(new THREE.BoxGeometry(7,4,1),new THREE.MeshStandardMaterial({color:0x726f5a}));wall.name='Outline test wall';wall.position.set(0,2,33);e.scene.add(wall);});await shooter.waitForTimeout(150);await shooter.screenshot({path:'/tmp/riftfall-wall-outline.png'});
 const pixels=await shooter.evaluate(()=>{const e=window.__riftfall,t=e.outlines.target,p=new Uint8Array(t.width*t.height*4);e.renderer.readRenderTargetPixels(t,0,0,t.width,t.height,p);let white=0;for(let i=0;i<p.length;i+=4)if(p[i+3]>0&&p[i]>200&&p[i+1]>200)white++;return white;});assert.ok(pixels>100,'visible silhouette mask must survive wall occlusion');
 await shooter.evaluate(()=>window.__riftfall.scene.getObjectByName('Outline test wall').removeFromParent());
 console.log('PASS through-wall silhouette mask and screenshot');
 await host.evaluate(id=>{const p=window.__riftfall.sim.players.get(id);p.aoteOwned=true;},shooterId);await shooter.waitForFunction(()=>window.__riftfall.player.aoteOwned);await shooter.keyboard.press('Digit4');await shooter.waitForTimeout(700);await arrange();
 await shooter.mouse.down({button:'right'});await shooter.waitForFunction(()=>window.__riftfall.swordAim==='Wanderer');await shooter.screenshot({path:'/tmp/riftfall-sword-launch-aim.png'});const start=await shooter.evaluate(()=>window.__riftfall.body.z);await shooter.mouse.down();await shooter.mouse.up();await shooter.waitForFunction(()=>window.__riftfall.player.lungeUntil>window.__riftfall.snapshot.time);await shooter.mouse.up({button:'right'});await shooter.waitForFunction(()=>!window.__riftfall.player.lunging&&window.__riftfall.body.z<31);
 assert.ok(start-await shooter.evaluate(()=>window.__riftfall.body.z)>9);assert.equal(await host.evaluate(()=>window.__riftfall.player.shield),85);
 await host.waitForFunction(id=>Math.abs(window.__riftfall.sim.players.get(id).z-30)<.3,shooterId);
 console.log('PASS guest sword launch moves toward target, hits on arrival, agrees with host');
 await shooter.waitForTimeout(1400);await arrange();await shooter.keyboard.down('ControlLeft');await shooter.mouse.down({button:'right'});await shooter.mouse.up({button:'right'});await shooter.keyboard.up('ControlLeft');await shooter.waitForFunction(()=>!window.__riftfall.player.lunging&&window.__riftfall.body.z<31);assert.equal(await host.evaluate(()=>window.__riftfall.player.shield),85);
 console.log('PASS Mac Control-click sword launch');
 await shooter.keyboard.press('ShiftRight');await shooter.evaluate(()=>document.exitPointerLock());await shooter.waitForFunction(()=>!window.__riftfall.locked);assert.equal(await shooter.evaluate(()=>window.__riftfall.sprintInput.active),false);
 assert.deepEqual(errors,[]);console.log('PASS no browser errors and pause clears sprint latch');
}finally{await browser.close();}
