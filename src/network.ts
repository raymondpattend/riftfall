import Peer from 'peerjs';
import type {DataConnection} from 'peerjs';
import type {Appearance} from './cosmetics';
import type {Action,Movement,Snapshot} from './rules';
export type Packet={type:'hello';name:string;appearance?:Appearance}|{type:'appearance';appearance:Appearance}|{type:'move';movement:Movement}|{type:'action';action:Action}|{type:'snapshot';snapshot:Snapshot}|{type:'error';message:string}|{type:'ping';at:number}|{type:'pong';at:number};
interface Handlers {message:(id:string,p:Packet)=>void;leave:(id:string)=>void;error:(message:string)=>void;}
export function roomCode(){const bytes=crypto.getRandomValues(new Uint8Array(6));return [...bytes].map(v=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[v%32]).join('');}
export class Network {
 peer:Peer|null=null;connections=new Map<string,DataConnection>();host=false;localId='';code='';latency=0;
 private pending=new Set<ReturnType<typeof setTimeout>>();private closed=false;
 constructor(private handlers:Handlers){}
 private createPeer(id:string){
  let iceServers:RTCIceServer[]=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun.cloudflare.com:3478'}];
  try{const custom=import.meta.env.VITE_ICE_SERVERS;if(custom){const parsed=JSON.parse(custom);if(Array.isArray(parsed))iceServers=parsed;}}catch{throw new Error('The relay configuration is invalid. Check VITE_ICE_SERVERS.');}
  return new Peer(id,{debug:0,config:{iceServers},...(import.meta.env.VITE_PEER_HOST?{host:import.meta.env.VITE_PEER_HOST,port:Number(import.meta.env.VITE_PEER_PORT||443),path:import.meta.env.VITE_PEER_PATH||'/',secure:import.meta.env.VITE_PEER_SECURE!=='false'}:{})});
 }
 async openHost(code:string){this.host=true;this.code=code;this.localId='host';await this.open(`riftfall-v1-${code}`);this.peer!.on('connection',c=>this.attach(c));}
 async join(code:string,name:string,appearance?:Appearance){
  this.code=code;this.localId=`r-${crypto.randomUUID()}`;await this.open(this.localId);
  await new Promise<void>((resolve,reject)=>{
   const c=this.peer!.connect(`riftfall-v1-${code}`,{reliable:false,serialization:'json',metadata:{game:'riftfall-v1'}});
   const timeout=setTimeout(()=>{c.close();reject(new Error('Could not reach that room. Check the code and keep the host’s game open. A restricted network may require a TURN relay.'));},18000);this.pending.add(timeout);
   c.on('open',()=>{clearTimeout(timeout);this.pending.delete(timeout);this.attach(c);c.send({type:'hello',name,appearance});resolve();});
   c.on('error',()=>{clearTimeout(timeout);this.pending.delete(timeout);reject(new Error('The room connection failed. Check the code and try again.'));});
  });
 }
 private open(id:string){
  return new Promise<void>((resolve,reject)=>{
   this.closed=false;this.peer=this.createPeer(id);
   let ready=false;const timer=setTimeout(()=>{reject(new Error('The multiplayer service did not respond. Check your internet connection, or play a practice match.'));this.close();},16000);this.pending.add(timer);
   this.peer.on('open',()=>{ready=true;clearTimeout(timer);this.pending.delete(timer);resolve();});
   this.peer.on('error',e=>{
    const message=e.type==='unavailable-id'?'That room code is already in use. Create a new room.':e.type==='peer-unavailable'?'Room not found. Check the code and make sure the host is still playing.':`Multiplayer connection failed (${e.type}). Try again or play practice.`;
    clearTimeout(timer);this.pending.delete(timer);if(!ready)reject(new Error(message));else if(!this.closed)this.handlers.error(message);
   });
   this.peer.on('disconnected',()=>{if(!this.closed&&!this.peer?.destroyed)this.peer?.reconnect();});
  });
 }
 private attach(c:DataConnection){
  this.connections.set(c.peer,c);
  c.on('data',raw=>{
   if(!raw||typeof raw!=='object')return;const p=raw as Packet;
   if(p.type==='ping'){c.send({type:'pong',at:p.at});return;}
   if(p.type==='pong'){this.latency=Math.round(performance.now()-p.at);return;}
   if(['hello','appearance','move','action','snapshot','error'].includes(p.type))this.handlers.message(c.peer,p);
  });
  c.on('close',()=>{this.connections.delete(c.peer);if(!this.closed)this.handlers.leave(c.peer);});
  c.on('error',()=>{this.connections.delete(c.peer);if(!this.closed)this.handlers.leave(c.peer);});
 }
 send(packet:Packet){for(const c of this.connections.values())if(c.open&&c.dataChannel?.bufferedAmount<512000)c.send(packet);}
 sendTo(id:string,packet:Packet){const c=this.connections.get(id);if(c?.open)c.send(packet);}
 ping(){this.send({type:'ping',at:performance.now()});}
 close(){this.closed=true;for(const timer of this.pending)clearTimeout(timer);this.pending.clear();for(const c of this.connections.values())c.close();this.connections.clear();this.peer?.destroy();this.peer=null;}
}
