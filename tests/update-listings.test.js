import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {updateListings} from '../scripts/update-listings.js';

const now=new Date('2026-09-27T18:00Z');
test('a failed upcoming day preserves the previous file and original timestamp',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'huddle-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const outputPath=path.join(dir,'listings.json'),previous='{"generatedAt":"2026-09-15T20:16:31Z","slates":[]}\n';
 await fs.writeFile(outputPath,previous);
 await assert.rejects(updateListings({now,outputPath,log:()=>{},fetcher:async url=>new URL(url).searchParams.get('dates')==='20261001'?new Response('Failed',{status:400}):Response.json({events:[]})}),/2026-10-01/);
 assert.equal(await fs.readFile(outputPath,'utf8'),previous);assert.deepEqual(await fs.readdir(dir),['listings.json']);
});
test('both complete empty slates publish together',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'huddle-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const outputPath=path.join(dir,'listings.json');
 await updateListings({now,outputPath,log:()=>{},fetcher:async()=>Response.json({events:[]})});
 const feed=JSON.parse(await fs.readFile(outputPath,'utf8'));
 assert.deepEqual(feed.slates.map(s=>s.start),['2026-09-22','2026-09-29']);assert.equal(feed.schema,1);
});
