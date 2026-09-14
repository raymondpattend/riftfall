import type {Appearance} from './cosmetics';
import type {Packet,RoomOptions} from './protocol';
export type {Packet,RoomOptions,ChatEntry} from './protocol';
interface Handlers {message:(id:string,p:Packet)=>void;leave:(id:string)=>void;error:(message:string)=>void;}
export function roomCode(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return [...crypto.getRandomValues(new Uint8Array(6))].map(v=>alphabet[v%alphabet.length]).join('');}
export class Network {
 host=false;localId='';code='';latency=0;
 readonly signalToken=crypto.randomUUID();
 private heartbeat:ReturnType<typeof setInterval>|undefined;private lastSnapshot=0;
 private socket:WebSocket|null=null;private cancel:((error:Error)=>void)|null=null;private closed=false;
 constructor(private handlers:Handlers){}
 openHost(code:string,options:RoomOptions){this.host=true;return this.open(code,{type:'create',options});}
 join(code:string,name:string,appearance?:Appearance){this.host=false;return this.open(code,{type:'hello',name,appearance});}
 private open(code:string,greeting:unknown){
  this.closed=false;this.code=code;this.localId=crypto.randomUUID();
  const url=new URL('/api/game/'+code,location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('id',this.localId);url.searchParams.set('token',this.signalToken);
  return new Promise<void>((resolve,reject)=>{
   let settled=false,admitted=false,departed=false;
   const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);this.cancel=null;if(error)reject(error);else{admitted=true;this.lastSnapshot=performance.now();this.heartbeat=setInterval(()=>{if(performance.now()-this.lastSnapshot>=12000){this.close();this.handlers.leave('server');}else this.ping();},2000);resolve();}};
   const timer=setTimeout(()=>{finish(new Error('The Cloudflare room did not respond. Try again.'));this.close();},25000);
   this.cancel=error=>finish(error);
   const socket=new WebSocket(url);this.socket=socket;
   socket.onopen=()=>{if(!this.closed)socket.send(JSON.stringify(greeting));};
   socket.onmessage=event=>{
    if(this.closed)return;
    let p:Packet;try{p=JSON.parse(event.data);}catch{return;}
    if(!p||typeof p!=='object')return;
    if(p.type==='snapshot')this.lastSnapshot=performance.now();
    if(p.type==='pong'){this.latency=Math.max(0,Math.round(performance.now()-p.at));return;}
    if(p.type==='error'&&!admitted){finish(new Error(p.message));socket.close();return;}
    if(p.type==='owner')this.host=p.id===this.localId;
    this.handlers.message('server',p);
    if(p.type==='snapshot'&&p.snapshot?.players?.some(player=>player.id===this.localId))finish();
   };
   const leave=()=>{if(this.closed||departed)return;departed=true;if(!admitted)finish(new Error('The Cloudflare room connection closed. Try again.'));else this.handlers.leave('server');};
   socket.onclose=leave;socket.onerror=leave;
  });
 }
 send(packet:Packet):boolean{const s=this.socket;if(this.closed||s?.readyState!==WebSocket.OPEN||s.bufferedAmount>=16384)return false;s.send(JSON.stringify(packet));return true;}
 ping(){this.send({type:'ping',at:performance.now()});}
 close(){clearInterval(this.heartbeat);this.heartbeat=undefined;this.closed=true;this.cancel?.(new Error('Connection cancelled.'));this.socket?.close();this.socket=null;}
}
