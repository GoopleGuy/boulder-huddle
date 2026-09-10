import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {slateRange,normalizeScoreboard} from '../src/core.js';
import {fetchLocalListings} from '../worker/local-listings.js';

const slates=[];
for(const offset of [0,1]){
 const range=slateRange(new Date(),offset),dates=range.start.replaceAll('-','')+'-'+range.end.replaceAll('-','');
 let response=await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${dates}&limit=100`,{signal:AbortSignal.timeout(20000)});
 if(!response.ok)response=await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${dates}&limit=100`,{signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error('Schedule source unavailable: '+response.status);
 const games=normalizeScoreboard(await response.json());
 const listings=await fetchLocalListings(games);
 const signature=createHash('sha256').update(JSON.stringify(games.map(g=>[g.id,g.date,g.networks]))).digest('hex');
 slates.push({...range,signature,...listings});
 console.log(`${range.start}: ${games.length} games; ${listings.rows.length} local station listings; ${listings.successfulPages} pages with live NFL listings.`);
 if(offset===0&&games.some(g=>g.networks.some(n=>['NBC','ABC','CBS','FOX'].includes(n)))&&!listings.rows.length)throw new Error('No current-slate local listings could be verified. Retaining previous data and timestamp.');
}
await fs.mkdir('data',{recursive:true});
await fs.writeFile('data/listings.json',JSON.stringify({schema:1,generatedAt:new Date().toISOString(),slates},null,2)+'\n');
