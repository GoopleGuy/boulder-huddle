import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {slateRange} from '../src/core.js';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {fetchSchedule} from '../src/schedule.js';
import {fetchLocalListings} from '../worker/local-listings.js';

export async function updateListings({now=new Date(),fetcher=fetch,fetchListings=fetchLocalListings,outputPath='data/listings.json',log=console.log}={}){
const slates=[];
for(const offset of [0,1]){
 const range=slateRange(now,offset);
 const games=await fetchSchedule(range,fetcher);
 const listings=await fetchListings(games,fetcher);
 const signature=createHash('sha256').update(JSON.stringify(games.map(g=>[g.id,g.date,g.networks]))).digest('hex');
 slates.push({...range,signature,...listings});
 log(`${range.start}: ${games.length} games; ${listings.rows.length} local station listings; ${listings.successfulPages} pages with live NFL listings.`);
 if(offset===0&&games.some(g=>g.networks.some(n=>['NBC','ABC','CBS','FOX'].includes(n)))&&!listings.rows.length)throw new Error('No current-slate local listings could be verified. Retaining previous data and timestamp.');
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
