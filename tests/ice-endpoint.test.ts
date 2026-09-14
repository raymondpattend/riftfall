import {describe,it,expect,vi} from 'vitest';
import {iceResponse} from '../worker/ice';
const env={CLOUDFLARE_TURN_KEY_ID:'key-id',CLOUDFLARE_TURN_API_TOKEN:'master-secret'};
describe('Cloudflare TURN credential endpoint',()=>{
 it('returns only temporary credentials and removes browser-blocked ports',async()=>{
  const fetcher=vi.fn().mockResolvedValue(Response.json({iceServers:[{urls:['stun:stun.cloudflare.com:3478','stun:stun.cloudflare.com:53']},{urls:['turn:turn.cloudflare.com:3478','turns:turn.cloudflare.com:443?transport=tcp','turn:turn.cloudflare.com:53'],username:'temporary-user',credential:'temporary-password'}],private:'master-secret'}));
  const response=await iceResponse(env,fetcher);expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('no-store');const text=await response.text();expect(text).not.toContain('master-secret');expect(text).not.toContain(':53');expect(JSON.parse(text).iceServers[1].credential).toBe('temporary-password');expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/key-id/'),expect.objectContaining({body:JSON.stringify({ttl:14400})}));
 });
 it('does not call the provider when secrets are missing',async()=>{const fetcher=vi.fn();expect((await iceResponse({},fetcher)).status).toBe(503);expect(fetcher).not.toHaveBeenCalled();});
 it('does not leak provider failures or long-lived secrets',async()=>{const response=await iceResponse(env,vi.fn().mockRejectedValue(Error('master-secret')));expect(response.status).toBe(502);expect(await response.text()).not.toContain('master-secret');});
 it('rejects an upstream error',async()=>{expect((await iceResponse(env,vi.fn().mockResolvedValue(new Response(null,{status:500})))).status).toBe(502);});
 it('rejects malformed or STUN-only credentials',async()=>{for(const body of [{},{iceServers:[{urls:'stun:stun.cloudflare.com'}]},{iceServers:[null]}])expect((await iceResponse(env,vi.fn().mockResolvedValue(Response.json(body)))).status).toBe(502);});
});
