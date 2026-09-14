import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {Network} from '../src/network';
class Socket {
 static OPEN=1;static instances:Socket[]=[];readyState=1;bufferedAmount=0;sent:any[]=[];
 onopen:Function=()=>{};onmessage:Function=()=>{};onclose:Function=()=>{};onerror:Function=()=>{};
 constructor(public url:URL){Socket.instances.push(this);}
 send(raw:string){this.sent.push(JSON.parse(raw));}close(){this.readyState=3;this.onclose();}
 receive(packet:unknown){this.onmessage({data:JSON.stringify(packet)});}
}
const handlers=()=>({message:vi.fn(),leave:vi.fn(),error:vi.fn()});
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('location',{href:'https://riftfall.example/'});vi.stubGlobal('WebSocket',Socket);Socket.instances=[];});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('Cloudflare room transport',()=>{
 it('uses only the same-origin secure WebSocket and waits for server admission',async()=>{const n=new Network(handlers());let ready=false;const joining=n.join('ABC234','Guest').then(()=>ready=true);const s=Socket.instances[0];expect(s.url.origin).toBe('wss://riftfall.example');expect(s.url.pathname).toBe('/api/game/ABC234');s.onopen();expect(s.sent[0]).toEqual({type:'hello',name:'Guest'});s.receive({type:'snapshot',snapshot:{players:[{id:'other'}]}});await Promise.resolve();expect(ready).toBe(false);s.receive({type:'snapshot',snapshot:{players:[{id:n.localId}]}});await joining;expect(ready).toBe(true);n.close();});
 it('rejects missing and full rooms promptly',async()=>{for(const message of ['Room not found','This arena is full']){const n=new Network(handlers()),joining=n.join('ABC234','Guest');const rejected=expect(joining).rejects.toThrow(message);Socket.instances.at(-1)!.receive({type:'error',message});await rejected;n.close();}expect(vi.getTimerCount()).toBe(0);});
 it('settles cancellation and timeout without hanging',async()=>{const n=new Network(handlers()),joining=n.join('ABC234','Guest');const rejected=expect(joining).rejects.toThrow('cancelled');n.close();await rejected;expect(vi.getTimerCount()).toBe(0);const other=new Network(handlers()),opening=other.join('ABC234','Guest');const timed=expect(opening).rejects.toThrow('did not respond');await vi.advanceTimersByTimeAsync(25000);await timed;});
 it('deduplicates close/error and retains actions during congestion',async()=>{const h=handlers(),n=new Network(h),joining=n.join('ABC234','Guest'),s=Socket.instances[0];s.receive({type:'snapshot',snapshot:{players:[{id:n.localId}]}});await joining;s.bufferedAmount=600000;n.send({type:'move',movement:{} as never});n.send({type:'action',action:{type:'fire'}});expect(s.sent).toEqual([{type:'action',action:{type:'fire'}}]);s.onerror();s.onclose();expect(h.leave).toHaveBeenCalledOnce();n.close();});
 it('accepts server ownership transfer',async()=>{const n=new Network(handlers()),joining=n.join('ABC234','Guest'),s=Socket.instances[0];s.receive({type:'owner',id:n.localId});s.receive({type:'snapshot',snapshot:{players:[{id:n.localId}]}});await joining;expect(n.host).toBe(true);n.close();});
});
