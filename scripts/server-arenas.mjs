import {build} from 'esbuild';
import {writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const temp=await mkdtemp(join(tmpdir(),'riftfall-arenas-'));
try {
 await build({entryPoints:['src/assets/arena-variants.ts'],bundle:true,platform:'node',format:'esm',outfile:join(temp,'arenas.mjs')});
 const {createArenaFor}=await import(join(temp,'arenas.mjs'));
 const result={};
 for(const id of ['crown','foundry','glacier','dunes']){const {colliders,spawns,pickups,jumpPads,loot}=createArenaFor(id);result[id]={colliders,spawns,pickups,jumpPads,...(loot?{loot}:{})};}
 await writeFile('worker/arenas.json',JSON.stringify(result));
}finally{await rm(temp,{recursive:true,force:true});}
