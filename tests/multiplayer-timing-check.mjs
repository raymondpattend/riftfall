import {chromium} from '@playwright/test';
const base=process.env.TEST_URL||'http://localhost:8787';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Timing checks must run against a local Worker');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();await page.goto(base);
 const results=await page.evaluate(async()=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const until=async(check)=>{for(let n=0;n<100;n++){if(check())return;await sleep(25);}throw Error('Timed out');};
  const reports=[];
  for(const mode of ['ffa','gun-game','parkour'])for(const rtt of [0,50,150,250]){
   const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',room=Array.from(crypto.getRandomValues(new Uint8Array(6)),n=>alphabet[n%alphabet.length]).join('');
   const connect=async(greeting)=>{
    const id=crypto.randomUUID(),url=new URL('/api/game/'+room,location.href);url.protocol='ws:';url.search=new URLSearchParams({id,token:crypto.randomUUID()});
    const ws=new WebSocket(url),c={id,ws,snapshot:null,lastIn:0,lastOut:0,n:0};
    ws.onmessage=e=>{const message=JSON.parse(e.data);if(message.type!=='snapshot')return;const now=performance.now(),at=Math.max(c.lastIn,now+rtt/2+(c.n++%3)*5);c.lastIn=at;setTimeout(()=>{c.snapshot=message.snapshot;if(message.delivery!==undefined&&ws.readyState===1)ws.send(JSON.stringify({type:'snapshot-ack',delivery:message.delivery}));},at-now);};
    await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});ws.send(JSON.stringify(greeting));await until(()=>c.snapshot?.players.some(p=>p.id===id));return c;
   };
   const a=await connect({type:'create',options:{name:'Timing host',bots:0,arena:mode==='parkour'?'sky-steps':'crown',gameMode:mode,modifiers:{}}}),b=await connect({type:'hello',name:'Timing guest'});
   const send=(c,p,stall=0)=>{const now=performance.now(),at=Math.max(c.lastOut,now+rtt/2+(c.n++%3)*5+stall);c.lastOut=at;setTimeout(()=>{if(c.ws.readyState===1)c.ws.send(JSON.stringify(p));},at-now);};
   let seq=0;const me=()=>b.snapshot.players.find(p=>p.id===b.id),start={...me()};
   for(let frame=0;frame<12;frame++){const inputs=Array.from({length:3},()=>({seq:++seq,warp:me().warp,forward:0,strafe:1,yaw:0,pitch:0,weapon:me().weapon,sprint:false,focused:false,jump:false,slide:false}));send(b,{type:'inputs',inputs});await sleep(50);}
   await until(()=>me().ack===seq);const moved=Math.hypot(me().x-start.x,me().z-start.z);if(moved<.1)throw Error('No movement: '+mode+'/'+rtt);
   // A TCP head-of-line stall delays this entire command. It must expire rather than fire on recovery.
   const shots=()=>b.snapshot.events.filter(e=>e.type==='shot'&&e.from===b.id).length;
   const before=shots();send(b,{type:'command',command:{inputSeq:seq,seq:1,warp:me().warp,at:b.snapshot.time,viewAt:Math.max(0,b.snapshot.time-.1),yaw:1,pitch:0,weapon:me().weapon,focused:false,action:{type:'fire'}}},600);
   await sleep(950+rtt);if(shots()!==before)throw Error('Expired command fired');
   reports.push({mode,rtt,movement:+moved.toFixed(3),ack:me().ack,expiredShotRejected:true});a.ws.close();b.ws.close();
  }
  return reports;
 });console.log(JSON.stringify({pass:true,results},null,2));
}finally{await browser.close();}
