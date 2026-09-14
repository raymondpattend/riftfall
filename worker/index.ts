export {GameRoom} from './game';
import {DurableObject} from 'cloudflare:workers';

export interface Env {
 GAMES:DurableObjectNamespace<import('./game').GameRoom>;
 ASSETS:Fetcher;
 SIGNALS:DurableObjectNamespace<RoomSignals>;
 DIRECTORY:DurableObjectNamespace<RoomDirectory>;
 SESSION_LIMIT:RateLimit;
 READ_LIMIT:RateLimit;
}
type Listing={code:string;name:string;arena:string;gameMode:string;players:number;updated:number};
const codePattern=/^[A-Z2-9]{6}$/;
const json=(body:unknown,status=200,headers:HeadersInit={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const failure=(message:string,status=400)=>json({error:message},status);
async function smallBody(request:Request){
 if(Number(request.headers.get('Content-Length'))>4096)throw Error('body');
 const reader=request.body?.getReader();if(!reader)throw Error('body');let size=0,text='';const decoder=new TextDecoder();
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();throw Error('body');}text+=decoder.decode(value,{stream:true});}
 const body=JSON.parse(text+decoder.decode());if(!body||typeof body!=='object'||Array.isArray(body))throw Error('body');return body;
}

export default {
 async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
  const url=new URL(request.url),path=url.pathname;
  if(!path.startsWith('/api/'))return env.ASSETS.fetch(request);
  if(path==='/api/health')return json({ok:true,platform:'cloudflare',version:2,transport:'websocket',simulation:'cloudflare'});
  const ip=request.headers.get('CF-Connecting-IP')||'local';
  if(path==='/api/rooms'&&request.method==='GET'){
   if(!(await env.READ_LIMIT.limit({key:ip})).success)return failure('Refresh again in a moment.',429);
   // A short edge cache coalesces home-page polls without hiding rooms for long.
   const cacheKey=new Request(url.origin+'/api/rooms');const cached=await caches.default.match(cacheKey);if(cached)return cached;
   const response=await env.DIRECTORY.getByName('public-v1').fetch('https://directory/rooms');
   if(response.ok){const cacheable=new Response(response.body,{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=5','X-Content-Type-Options':'nosniff'}});ctx.waitUntil(caches.default.put(cacheKey,cacheable.clone()));return cacheable;}return response;
  }
  if(request.headers.get('Origin')!==url.origin)return failure('Origin not allowed.',403);
  if(path.startsWith('/api/game/')){
   if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return failure('WebSocket required.',426);
   const code=path.slice('/api/game/'.length);if(!codePattern.test(code))return failure('Invalid room code.');
   if(!(await env.SESSION_LIMIT.limit({key:ip})).success)return failure('Too many connections. Try again in a minute.',429);
   return env.GAMES.getByName(code).fetch(request);
  }
  if(path==='/api/rooms'&&['POST','DELETE'].includes(request.method)){
   if(!(await env.READ_LIMIT.limit({key:ip})).success)return failure('Too many room updates.',429);
   let body;try{body=await smallBody(request);}catch{return failure('Invalid room request.');}
   if(typeof body.code!=='string'||!codePattern.test(body.code))return failure('Invalid room code.');
   return env.GAMES.getByName(body.code).fetch(new Request('https://room/listing',{method:request.method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
  }
  return failure('Not found.',404);
 }
} satisfies ExportedHandler<Env>;

// Retain the migrated class so existing namespaces remain valid. Legacy clients
// must refresh; the public Worker no longer routes signaling or TURN requests.
export class RoomSignals extends DurableObject<Env> {
 async fetch(){return failure('Refresh Riftfall to use Cloudflare-hosted rooms.',410);}
}

export class RoomDirectory extends DurableObject<Env> {
 constructor(ctx:DurableObjectState,env:Env){super(ctx,env);ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, arena TEXT NOT NULL, gameMode TEXT NOT NULL, players INTEGER NOT NULL, updated INTEGER NOT NULL)');ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS rooms_updated ON rooms(updated)');}
 async fetch(request:Request){
  const sql=this.ctx.storage.sql;
  if(request.method==='GET')return json({rooms:sql.exec<Listing>('SELECT code,name,arena,gameMode,players,updated FROM rooms WHERE updated > ? ORDER BY updated DESC LIMIT 100',Date.now()-90000).toArray()});
  const body=await request.json() as Listing&{owner:string};
  if(request.method==='DELETE'){sql.exec('DELETE FROM rooms WHERE code = ? AND owner = ?',body.code,body.owner);return json({ok:true});}
  sql.exec('INSERT INTO rooms (code,owner,name,arena,gameMode,players,updated) VALUES (?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET owner=excluded.owner,name=excluded.name,arena=excluded.arena,gameMode=excluded.gameMode,players=excluded.players,updated=excluded.updated',body.code,body.owner,body.name,body.arena,body.gameMode,body.players,body.updated);
  if(await this.ctx.storage.getAlarm()===null)await this.ctx.storage.setAlarm(Date.now()+90000);
  return json({ok:true});
 }
 async alarm(){this.ctx.storage.sql.exec('DELETE FROM rooms WHERE updated <= ?',Date.now()-90000);const {count}=this.ctx.storage.sql.exec<{count:number}>('SELECT COUNT(*) AS count FROM rooms').one();if(count)await this.ctx.storage.setAlarm(Date.now()+90000);}
}
