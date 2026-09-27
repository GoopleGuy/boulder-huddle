import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchSchedule} from '../src/schedule.js';

const range={start:'2026-09-22',end:'2026-09-28'};
function event(id,date){return {id,date,season:{year:2026,type:2},competitions:[{competitors:[{homeAway:'home',team:{displayName:'Home',abbreviation:'H'}},{homeAway:'away',team:{displayName:'Away',abbreviation:'A'}}],broadcasts:[{names:['ESPN']}]}]};}
const dateOf=url=>new URL(url).searchParams.get('dates');

test('Monday night and Mountain midnight boundaries survive daily queries and duplicates',async()=>{
 const sunday=event('1','2026-09-28T00:20Z'),monday=event('2','2026-09-29T00:15Z');
 const late=event('3','2026-09-29T05:59Z'),next=event('4','2026-09-29T06:00Z');
 const previous=event('5','2026-09-22T05:59Z');const seen=[];
 const games=await fetchSchedule(range,async url=>{seen.push(dateOf(url));return Response.json({week:{number:3},events:dateOf(url)==='20260929'?[monday,late,next]:[sunday,monday,previous]});});
 assert.equal(seen.length,8);assert.ok(seen.includes('20260929'));assert.ok(seen.every(d=>/^\d{8}$/.test(d)));
 assert.deepEqual(games.map(g=>g.id),['1','2','3']);assert.ok(games.every(g=>g.week===3));
});
test('Mountain winter boundary uses MST rather than a fixed daylight-saving offset',async()=>{
 const games=await fetchSchedule({start:'2026-11-03',end:'2026-11-09'},async()=>Response.json({events:[event('1','2026-11-10T06:59Z'),event('2','2026-11-10T07:00Z')]}));
 assert.deepEqual(games.map(g=>g.id),['1']);
});
test('empty days are valid and daily fallback recovers HTTP, network and schema failures',async()=>{
 for(const failure of ['http','network','schema']){
  const seen=[];
  const games=await fetchSchedule(range,async url=>{seen.push(url);if(url.includes('site.web.')&&dateOf(url)==='20260925'){
   if(failure==='network')throw new Error('timeout');
   return failure==='http'?new Response('Denied',{status:403}):Response.json({error:'not a schedule'});
  }return Response.json({events:[]});});
  assert.deepEqual(games,[]);assert.equal(seen.length,9);assert.ok(seen.some(url=>url.includes('site.api.')&&dateOf(url)==='20260925'));
 }
});
test('a failed day aborts the whole slate and reports both endpoints and response bodies',async()=>{
 await assert.rejects(fetchSchedule(range,async url=>dateOf(url)==='20260925'?new Response('upstream detail',{status:400}):Response.json({events:[event('1','2026-09-27T17:00Z')]})),error=>{
  assert.match(error.message,/2026-09-25/);assert.match(error.message,/site.web.api.espn.com/);assert.match(error.message,/site.api.espn.com/);assert.match(error.message,/HTTP 400: upstream detail/);return true;
 });
});
test('malformed event arrays and invalid JSON cannot masquerade as a successful empty schedule',async()=>{
 for(const response of [()=>Response.json({events:[{id:'broken'}]}),()=>new Response('<html>Unavailable</html>')]){
  await assert.rejects(fetchSchedule(range,async()=>response()),/Schedule source unavailable/);
 }
});
test('equal kickoff times have stable ID order regardless of response order',async()=>{
 const games=await fetchSchedule(range,async()=>Response.json({events:[event('2','2026-09-27T17:00Z'),event('1','2026-09-27T17:00Z')]}));
 assert.deepEqual(games.map(g=>g.id),['1','2']);
});
