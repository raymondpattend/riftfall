import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://localhost:8787';
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage();
try{
 await page.goto(base+'/api/health');const health=await (await page.request.get(base+'/api/health')).json();assert.equal(health.simulation,'cloudflare');
 assert.equal((await page.request.post(base+'/api/rooms',{headers:{Origin:'https://elsewhere.example'},data:{code:'ABC234'}})).status(),403);
 const result=await page.evaluate(async()=>{
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const code=()=>Array.from(crypto.getRandomValues(new Uint8Array(6)),v=>alphabet[v%alphabet.length]).join('');
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const until=async(check)=>{for(let i=0;i<100;i++){if(check())return;await wait(50);}throw Error('Timed out waiting for server state');};
  const connect=async(room,greeting)=>{
   const id=crypto.randomUUID(),token=crypto.randomUUID(),url=new URL('/api/game/'+room,location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';url.search=new URLSearchParams({id,token});
   const ws=new WebSocket(url),c={id,token,ws,messages:[],snapshot:null};
   ws.onmessage=e=>{const p=JSON.parse(e.data);c.messages.push(p);if(p.type==='snapshot'){c.snapshot=p.snapshot;if(p.delivery!==undefined)ws.send(JSON.stringify({type:'snapshot-ack',delivery:p.delivery}));}};
   await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});ws.send(JSON.stringify(greeting));return c;
  };
  const send=(c,p)=>c.ws.send(JSON.stringify(p));
  const check=(condition,message)=>{if(!condition)throw Error(message);};
  for(const [gameMode,arena] of [['ffa','crown'],['ffa','foundry'],['ffa','glacier'],['ffa','dunes'],['gun-game','crown'],['parkour','sky-steps'],['parkour','switchback']]){
   const room=code(),a=await connect(room,{type:'create',options:{name:'Creator',bots:1,arena,gameMode,modifiers:{}}});
   await until(()=>a.snapshot);const b=await connect(room,{type:'hello',name:'Guest'});await until(()=>b.snapshot?.players.some(p=>p.id===b.id));
   check(b.snapshot.arenaId===arena&&b.snapshot.gameMode===gameMode,'Server room configuration');
   const before=b.snapshot.time;await wait(200);check(b.snapshot.time>before,'Server ticks independently');
   send(b,{type:'modifiers',modifiers:{speed:3}});send(b,{type:'restart'});send(b,{type:'snapshot',snapshot:{winner:b.id}});await wait(150);
   check(b.snapshot.modifiers.speed===1&&b.snapshot.round===1&&!b.snapshot.winner,'Guest cannot forge authoritative state');
   send(a,{type:'modifiers',modifiers:{speed:2}});await until(()=>b.snapshot.modifiers.speed===2);
   const me=b.snapshot.players.find(p=>p.id===b.id);send(b,{type:'inputs',inputs:Array.from({length:12},(_,n)=>({seq:n+1,warp:me.warp,forward:0,strafe:1,yaw:0,pitch:0,weapon:me.weapon,sprint:false,focused:false,jump:false,slide:false}))});await until(()=>Math.abs(b.snapshot.players.find(p=>p.id===b.id).x-me.x)>.1);
   if(gameMode!=='parkour'){
    send(b,{type:'command',command:{inputSeq:12,seq:1,warp:me.warp,at:b.snapshot.time,viewAt:b.snapshot.time,yaw:0,pitch:0,weapon:me.weapon,focused:false,action:{type:'fire'}}});await until(()=>b.snapshot.players.find(p=>p.id===b.id).ammo.rifle<30||b.snapshot.events.some(e=>e.from===b.id));
   }
   send(b,{type:'chat',text:'Cloudflare server chat'});await until(()=>a.messages.some(p=>p.type==='room-message'&&p.entry.text==='Cloudflare server chat'));
   a.ws.close();await until(()=>b.messages.some(p=>p.type==='owner'&&p.id===b.id));const time=b.snapshot.time;await wait(200);check(b.snapshot.time>time,'Match survives creator disconnect');
   send(b,{type:'restart'});await until(()=>b.snapshot.round===2);b.ws.close();await wait(100);
  }
  const missing=await connect(code(),{type:'hello',name:'Missing'});await until(()=>missing.messages.some(p=>p.type==='error'));check(missing.messages.some(p=>p.message?.includes('not found')),'Missing rooms fail promptly');missing.ws.close();
  return ['seven arena/mode configurations','server ticking','movement and actions','guest authorization','chat','creator departure','ownership transfer','rematch','missing rooms','origin checks'];
 });console.log(JSON.stringify({pass:true,base,checks:result}));
}finally{await browser.close();}
