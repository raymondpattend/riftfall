import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.TEST_URL||'http://localhost:5173';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Run against a local Worker only');
const output=process.env.SHOT_OUTPUT||'/tmp/riftfall-shot-proof';await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const report={browser:browser.version(),base,muted:true,results:[]};
try{
 for(const rtt of [0,50,150,250]){
  const page=await browser.newPage({viewport:{width:960,height:640}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({rtt})=>{
   window.delay={up:rtt/2,down:rtt/2,stall:0,bandwidth:Infinity,bytes:0,snapshots:0};
   const Native=WebSocket;window.WebSocket=class extends Native {
    outAt=0;inAt=0;n=0;
    send(data){const now=performance.now(),at=Math.max(this.outAt,now+window.delay.up+(this.n++%3)*2);this.outAt=at;setTimeout(()=>{if(this.readyState===1)super.send(data);},at-now);}
    set onmessage(fn){super.addEventListener('message',event=>{const d=window.delay,now=performance.now(),bytes=new TextEncoder().encode(event.data).length;d.bytes+=bytes;if(JSON.parse(event.data).type==='snapshot')d.snapshots++;const at=Math.max(this.inAt,now+d.down+d.stall)+bytes/d.bandwidth*1000;this.inAt=at;setTimeout(()=>{if(this.readyState===1)fn.call(this,event);},at-now);});}
   };
  },{rtt});
  await page.goto(base);await page.waitForFunction(()=>window.__riftfall);
  await page.evaluate(()=>{const e=window.__riftfall;e.setSettings({...e.settings,quality:'low',volume:0});});
  await page.getByRole('button',{name:'Host a room',exact:true}).click();await page.getByLabel('Bot count',{exact:true}).selectOption('0');await page.getByRole('button',{name:'CREATE ROOM',exact:true}).click();await page.waitForFunction(()=>window.__riftfall.player&&window.__riftfall.network?.clockReady);
  if(!await page.evaluate(()=>window.__riftfall.locked))await page.getByRole('button',{name:'Resume game'}).click();
  await page.evaluate(()=>{
   const e=window.__riftfall;e.pitch=.2;
   const render=e.renderer.render.bind(e.renderer);window.frames=0;window.proof=[];
   e.renderer.render=(scene,camera)=>{
    render(scene,camera);if(scene!==e.scene)return;window.frames++;
    if(!e.awaitingFrame.size||window.skipPixelProof)return;
    const gl=e.renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,before=new Uint8Array(width*height*4),after=new Uint8Array(before.length);
    gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,before);const firstPixelAt=performance.now();
    const lines=e.scene.getObjectByName('Shot tracers'),cores=e.scene.getObjectByName('Bullet cores');lines.visible=cores.visible=false;render(scene,camera);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,after);lines.visible=cores.visible=true;render(scene,camera);
    let pixels=0;for(let i=0;i<before.length;i+=4)if(Math.abs(before[i]-after[i])+Math.abs(before[i+1]-after[i+1])+Math.abs(before[i+2]-after[i+2])>20)pixels++;
    window.proof.push({seq:[...e.awaitingFrame][0],pixels,frame:window.frames,inputFrame:window.inputFrame,at:firstPixelAt,image:e.renderer.domElement.toDataURL()});
   };
   e.renderer.domElement.addEventListener('mousedown',()=>{window.inputFrame=window.frames;},true);
  });
  for(const [weapon,key] of [['rifle','Digit1'],['shotgun','Digit2'],['sniper','Digit3']]){
   await page.keyboard.press(key);await page.waitForTimeout(1500);await page.evaluate(()=>{window.proof=[];window.__riftfall.shotDiagnostics.length=0;});
   await page.mouse.down();await page.mouse.up();await page.waitForFunction(()=>window.proof.length>0);await page.waitForFunction(()=>window.__riftfall.shotDiagnostics.some(d=>d.phase==='authoritative result'));
   const data=await page.evaluate(()=>({proof:window.proof[0],diagnostics:window.__riftfall.shotDiagnostics,network:{...window.delay}}));
   assert.ok(data.proof.pixels>10,`${weapon}/${rtt}: tracer must contribute rendered pixels`);assert.equal(data.proof.frame,data.proof.inputFrame+1,'tracer must appear on first frame after input');
   const input=data.diagnostics.find(d=>d.phase==='input'),result=data.diagnostics.find(d=>d.phase==='authoritative result'&&d.seq===data.proof.seq);assert.equal(result.detail.status,'accepted',JSON.stringify(data.diagnostics));
   await writeFile(`${output}/${weapon}-${rtt}.png`,Buffer.from(data.proof.image.split(',')[1],'base64'));
   report.results.push({weapon,rtt,clickToRenderedMs:+(data.proof.at-input.at).toFixed(2),clickToResultMs:+(result.at-input.at).toFixed(2),tracerPixels:data.proof.pixels,firstFrame:true,serverWaitMs:+((result.detail.resolvedAt-result.detail.receivedAt)*1000).toFixed(2),diagnostics:data.diagnostics});
   const count=await page.evaluate(()=>window.__riftfall.effects.traces.length);await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>window.__riftfall.effects.traces.length),0,'no late duplicate tracer');
  }
  // Held fire, then a failed send: no speculative trace may be created for an unsent command.
  await page.keyboard.press('Digit1');await page.waitForTimeout(1400);await page.evaluate(()=>{window.__riftfall.shotDiagnostics.length=0;window.skipPixelProof=true;});await page.mouse.down();await page.waitForTimeout(1000);await page.mouse.up();await page.waitForTimeout(800);
  const held=await page.evaluate(()=>window.__riftfall.shotDiagnostics);assert.ok(held.filter(d=>d.phase==='provisional tracer').length>=5,JSON.stringify(held));assert.ok(held.filter(d=>d.phase==='authoritative result'&&d.detail.status==='accepted').length>=5);
  await page.evaluate(()=>{const e=window.__riftfall;window.originalSend=e.network.send.bind(e.network);e.network.send=p=>p.type==='command'?false:window.originalSend(p);e.shotDiagnostics.length=0;});await page.mouse.down();await page.mouse.up();await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.__riftfall.shotDiagnostics.some(d=>d.phase==='provisional tracer')),false);await page.evaluate(()=>{window.__riftfall.network.send=window.originalSend;});
  if(rtt===250){
   for(const [up,down] of [[0,250],[250,0]]){
    await page.evaluate(({up,down})=>{Object.assign(window.delay,{up,down});window.__riftfall.network.ping();},{up,down});await page.waitForTimeout(1500);
    await page.evaluate(()=>{window.__riftfall.shotDiagnostics.length=0;});await page.mouse.down();await page.mouse.up();await page.waitForFunction(()=>window.__riftfall.shotDiagnostics.some(d=>d.phase==='authoritative result'));
    const result=await page.evaluate(()=>window.__riftfall.shotDiagnostics.find(d=>d.phase==='authoritative result'));assert.equal(result.detail.status,'accepted');report.results.push({up,down,freshShotAccepted:true});
   }
   await page.evaluate(()=>{Object.assign(window.delay,{up:600,down:0});window.__riftfall.shotDiagnostics.length=0;});await page.waitForTimeout(500);await page.mouse.down();await page.mouse.up();await page.waitForFunction(()=>window.__riftfall.shotDiagnostics.some(d=>d.phase==='authoritative result'));
   const rejected=await page.evaluate(()=>window.__riftfall.shotDiagnostics.find(d=>d.phase==='authoritative result'));assert.equal(rejected.detail.status,'expired');assert.equal(await page.evaluate(()=>window.__riftfall.predictedShots.size),0);report.results.push({up:600,expiredShotReconciled:true});
   await page.evaluate(()=>{Object.assign(window.delay,{up:125,down:125});window.__riftfall.network.ping();});await page.waitForTimeout(1800);
  }
  await page.keyboard.press('KeyR');await page.waitForFunction(()=>window.__riftfall.player.reloading);await page.evaluate(()=>{window.__riftfall.shotDiagnostics.length=0;});await page.mouse.down();await page.mouse.up();assert.equal(await page.evaluate(()=>window.__riftfall.shotDiagnostics.some(d=>d.phase==='provisional tracer')),false);await page.waitForFunction(()=>!window.__riftfall.player.reloading);
  // Ordered downlink stall: only one replaceable snapshot can be in flight.
  const initial=await page.evaluate(()=>{window.delay.stall=700;return {n:window.delay.snapshots,bytes:window.delay.bytes,time:window.__riftfall.snapshot.time};});await page.waitForTimeout(600);
  const queued=await page.evaluate(n=>window.delay.snapshots-n,initial.n);assert.ok(queued<=2,`snapshot backlog grew: ${queued}`);
  await page.evaluate(()=>{window.delay.stall=0;});await page.waitForTimeout(1600);assert.ok(await page.evaluate(t=>window.__riftfall.snapshot.time>t+1,initial.time));
  // Below-production bandwidth, followed by recovery: coalescing bounds state backlog.
  const bandwidthStart=await page.evaluate(()=>{window.delay.bandwidth=6000;return {bytes:window.delay.bytes,n:window.delay.snapshots,time:window.__riftfall.snapshot.time,at:performance.now()};});await page.waitForTimeout(1500);const bandwidthEnd=await page.evaluate(()=>({bytes:window.delay.bytes,n:window.delay.snapshots,time:window.__riftfall.snapshot.time,at:performance.now()}));report.results.push({rtt,downlinkBytesPerSecond:6000,receivedBytes:bandwidthEnd.bytes-bandwidthStart.bytes,receivedSnapshots:bandwidthEnd.n-bandwidthStart.n,elapsedMs:bandwidthEnd.at-bandwidthStart.at,serverProgress:bandwidthEnd.time-bandwidthStart.time});await page.evaluate(()=>{window.delay.bandwidth=Infinity;});await page.waitForTimeout(1600);assert.ok(await page.evaluate(()=>!!window.__riftfall.player));
  // A longer stall must explicitly leave the room, even though delayed packets exist.
  await page.evaluate(()=>{window.delay.stall=2500;});await page.waitForFunction(()=>window.__riftfall.mode==='menu',null,{timeout:9000});assert.match(await page.evaluate(()=>window.__riftfall.error),/reconnect|Join|closed/);
  if(rtt===0){
   await page.getByRole('button',{name:'Practice',exact:true}).click();await page.getByRole('button',{name:'ENTER THE ARENA',exact:true}).click();await page.waitForFunction(()=>window.__riftfall.locked);await page.evaluate(()=>{window.__riftfall.sim.brains.clear();window.skipPixelProof=false;window.__riftfall.pitch=.2;});
   for(const [weapon,key] of [['rifle','Digit1'],['shotgun','Digit2'],['sniper','Digit3']]){
    await page.keyboard.press(key);await page.waitForTimeout(1500);await page.evaluate(()=>{window.proof=[];window.__riftfall.shotDiagnostics.length=0;});await page.mouse.down();await page.mouse.up();await page.waitForFunction(()=>window.proof.length);
    const data=await page.evaluate(()=>({proof:window.proof[0],diagnostics:window.__riftfall.shotDiagnostics}));assert.ok(data.proof.pixels>10);assert.equal(data.proof.frame,data.proof.inputFrame+1);const input=data.diagnostics.find(d=>d.phase==='input'),result=data.diagnostics.find(d=>d.phase==='authoritative result');report.results.push({mode:'practice',weapon,clickToRenderedMs:data.proof.at-input.at,clickToResultMs:result.at-input.at,firstFrame:true});
   }
   // A respawn invalidates outstanding predictions and restores the magazine.
   await page.evaluate(()=>{const e=window.__riftfall;e.sim.spawn(e.sim.players.get(e.localId));e.receiveSnapshot(e.sim.snapshot());});assert.equal(await page.evaluate(()=>window.__riftfall.predictedShots.size),0);
  }
  assert.deepEqual(errors,[]);report.results.push({rtt,heldFire:true,failedSend:true,coalescedStall:true,bandwidthRecovery:true,longStallDisconnect:true});await page.close();
 }
 await writeFile(`${output}/results.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
