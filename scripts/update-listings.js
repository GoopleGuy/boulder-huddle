import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {slateRange,canonicalNetwork} from '../src/core.js';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {fetchSchedule} from '../src/schedule.js';
import {fetchLocalListings,pruneSupersededListings} from '../worker/local-listings.js';
import {mergeListingEvidence,hasListingEvidence} from '../worker/published-listings.js';

export async function updateListings({now=new Date(),fetcher=fetch,fetchListings=fetchLocalListings,outputPath='data/listings.json',log=console.log}={}){
let previous;
try{previous=JSON.parse(await fs.readFile(outputPath,'utf8'));}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
const slates=[];
for(const offset of [0,1]){
 const range=slateRange(now,offset);
 const games=await fetchSchedule(range,fetcher);
 const old=previous?.schema===1?previous.slates?.find(s=>s.start===range.start):null;
 // Empty data is not a cancellation notice. Keep original confirmed rows/time.
 if(!games.length&&hasListingEvidence(old)){slates.push(old);log(`${range.start}: empty schedule response; retaining last confirmed slate.`);continue;}
 const listings=await fetchListings(games,fetcher);
 const signature=createHash('sha256').update(JSON.stringify(games.map(g=>[g.id,g.date,g.networks]))).digest('hex');
 if(old?.signature===signature&&hasListingEvidence(old)){
  // Partial scrapes cannot erase other confirmed games. New assignments replace
  // the same station/window; retained rows carry their own original check time.
  // The oldest row timestamp also protects older Workers during rollout.
  Object.assign(listings,mergeListingEvidence(old,listings));
 }
 Object.assign(listings,pruneSupersededListings(listings,games));
 slates.push({...range,signature,...listings});
 log(`${range.start}: ${games.length} games; ${listings.rows.length} local station listings; ${listings.successfulPages} pages with live NFL listings; ${listings.programPages?.length||0} validated programming pages.`);
 if(offset===0&&games.some(g=>g.networks.some(n=>['NBC','ABC','CBS','FOX'].includes(canonicalNetwork(n))))&&!hasListingEvidence(listings))throw new Error('No current-slate local listings could be verified. Retaining previous data and timestamp.');
}
await fs.mkdir(path.dirname(outputPath),{recursive:true});
const temporary=outputPath+'.tmp';
try{
 await fs.writeFile(temporary,JSON.stringify({schema:1,generatedAt:new Date().toISOString(),slates},null,2)+'\n');
 await fs.rename(temporary,outputPath);
}finally{await fs.rm(temporary,{force:true});}
return slates;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await updateListings();
