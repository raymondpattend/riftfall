const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const failure=(message:string,status=400)=>json({error:message},status);
export async function iceResponse(env:{CLOUDFLARE_TURN_KEY_ID?:string;CLOUDFLARE_TURN_API_TOKEN?:string},fetcher:typeof fetch=fetch){
 if(!env.CLOUDFLARE_TURN_KEY_ID||!env.CLOUDFLARE_TURN_API_TOKEN)return failure('The multiplayer relay is not configured.',503);
 try{
  const response=await fetcher(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.CLOUDFLARE_TURN_KEY_ID)}/credentials/generate-ice-servers`,{method:'POST',headers:{Authorization:`Bearer ${env.CLOUDFLARE_TURN_API_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({ttl:14400}),signal:AbortSignal.timeout(8000)});
  if(!response.ok)return failure('The multiplayer relay is temporarily unavailable.',502);
  const body=await response.json() as {iceServers:{urls:string|string[];username?:string;credential?:string}[]};
  if(!Array.isArray(body.iceServers))throw Error('Invalid relay');
  const iceServers=body.iceServers.map(server=>({urls:(Array.isArray(server.urls)?server.urls:[server.urls]).filter(url=>typeof url==='string'&&/^(stun|turn|turns):/.test(url)&&!/:53(?:\?|$)/.test(url)),...(typeof server.username==='string'?{username:server.username}:{}),...(typeof server.credential==='string'?{credential:server.credential}:{})})).filter(server=>server.urls.length);
  if(!iceServers.some(server=>server.urls.some(url=>/^turns?:/.test(url))))throw Error('Missing TURN');
  return json({iceServers});
 }catch{return failure('The multiplayer relay is temporarily unavailable.',502);}
}
