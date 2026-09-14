import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL||'http://localhost:5174';
const relay=process.env.FORCE_RELAY==='1';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
for(const context of contexts)if(relay)await context.addInitScript(()=>{
 const Original=window.RTCPeerConnection;
 window.RTCPeerConnection=class extends Original{constructor(config,...args){super({...config,iceTransportPolicy:'relay'},...args);}};
});
const [host,guest]=await Promise.all(contexts.map(c=>c.newPage()));
try {
 await host.goto(base);
 await host.getByRole('button',{name:'Host a room',exact:true}).click();
 await host.getByLabel('Bot count').selectOption('0');
 await host.getByRole('button',{name:'CREATE ROOM',exact:true}).click();
 await host.getByRole('button',{name:'Copy invite link'}).waitFor({timeout:30000});
 const room=await host.locator('.room-invite b').innerText();
 await guest.goto(`${base}/?room=${room}`);
 await guest.getByLabel('Your callsign').fill('Join Test');
 await guest.getByRole('button',{name:'JOIN ROOM',exact:true}).click();
 await guest.getByRole('button',{name:'Resume game'}).waitFor({timeout:35000});
 await guest.getByRole('button',{name:'Resume game'}).click();
 await guest.keyboard.down('Tab');
 await guest.locator('.scoreboard').waitFor();assert.match(await guest.locator('.scoreboard').innerText(),/Join Test/);
 await guest.keyboard.up('Tab');
 await guest.keyboard.down('KeyW');await guest.waitForTimeout(700);await guest.keyboard.up('KeyW');
 await guest.screenshot({path:`/tmp/riftfall-join-${relay?'relay':'normal'}.png`});
 console.log(`PASS ${relay?'forced Cloudflare TURN relay':'normal'} host, invite join, populated match and movement input`);
} catch(error){console.error('HOST',await host.locator('body').innerText());console.error('GUEST',await guest.locator('body').innerText());throw error;}
finally{await browser.close();}
