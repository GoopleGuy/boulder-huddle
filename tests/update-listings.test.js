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

const event={id:'1',date:'2026-09-27T17:00Z',season:{year:2026,type:2},competitions:[{competitors:[{homeAway:'home',team:{displayName:'Home'}},{homeAway:'away',team:{displayName:'Away'}}],broadcasts:[{names:['CBS']}]}]};
const row={call:'KCNC',network:'CBS',day:'2026-09-27',minute:660,teams:['Home','Away'],title:'Away at Home',url:'https://www.tvpassport.com/tv-listings/stations/cbs-kcnc-denver-co/1566/2026-09-27'};
const schedule=async url=>Response.json({events:new URL(url).searchParams.get('dates')==='20260927'?[event]:[]});
async function seeded(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'huddle-retained-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const outputPath=path.join(dir,'listings.json'),checkedAt='2026-09-24T16:00Z';
 await updateListings({now,outputPath,log:()=>{},fetcher:schedule,fetchListings:async games=>({checkedAt,rows:games.length?[row,{...row,call:'KUSA',network:'NBC',minute:1100}]:[],successfulPages:1})});
 return {outputPath,checkedAt};
}
test('empty schedule scrape preserves a previously confirmed slate and timestamp',async t=>{
 const {outputPath,checkedAt}=await seeded(t);
 await updateListings({now,outputPath,log:()=>{},fetcher:async()=>Response.json({events:[]})});
 const feed=JSON.parse(await fs.readFile(outputPath,'utf8'));assert.equal(feed.slates[0].checkedAt,checkedAt);assert.equal(feed.slates[0].rows.length,2);
});
test('partial scrape retains original row timestamps and newer station/window evidence wins',async t=>{
 const {outputPath,checkedAt}=await seeded(t),fresh='2026-09-27T16:00Z';
 await updateListings({now,outputPath,log:()=>{},fetcher:schedule,fetchListings:async games=>({checkedAt:fresh,rows:games.length?[{...row,teams:['New Home','New Away']}]:[],successfulPages:1})});
 const feed=JSON.parse(await fs.readFile(outputPath,'utf8')),rows=feed.slates[0].rows;
 assert.equal(feed.slates[0].checkedAt,checkedAt);assert.equal(rows.length,2);assert.equal(rows.find(r=>r.call==='KUSA').checkedAt,checkedAt);assert.equal(rows.find(r=>r.call==='KCNC').checkedAt,fresh);assert.deepEqual(rows.find(r=>r.call==='KCNC').teams,['New Home','New Away']);
});
test('empty listing scrape never stamps a new confirmation on retained rows',async t=>{
 const {outputPath,checkedAt}=await seeded(t);
 await updateListings({now,outputPath,log:()=>{},fetcher:schedule,fetchListings:async()=>({checkedAt:'2026-09-27T16:00Z',rows:[],successfulPages:0})});
 const feed=JSON.parse(await fs.readFile(outputPath,'utf8'));assert.equal(feed.slates[0].checkedAt,checkedAt);assert.ok(feed.slates[0].rows.every(r=>r.checkedAt===checkedAt));
});
