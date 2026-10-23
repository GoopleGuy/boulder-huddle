import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {getGuide} from '../worker/index.js';
import {normalizeScoreboard,access} from '../src/core.js';

const start='2026-09-22';
const event={id:'1',date:'2026-09-27T17:00Z',season:{year:2026,type:2},competitions:[{competitors:[{homeAway:'home',team:{displayName:'Home'}},{homeAway:'away',team:{displayName:'Away'}}],broadcasts:[{names:['CBS']}]}]};
const signature=raw=>createHash('sha256').update(JSON.stringify(normalizeScoreboard(raw).map(g=>[g.id,g.date,g.networks]))).digest('hex');
const raw={events:[event]};
function setup(t){
 let time=Date.parse('2026-09-27T16:00Z');
 t.mock.method(Date,'now',()=>time);t.mock.method(console,'warn',()=>{});
 const checkedAt=new Date(time).toISOString();
 const feed={schema:1,slates:[{signature:signature(raw),checkedAt,rows:[{call:'KCNC',network:'CBS',day:'2026-09-27',minute:660,teams:['Home','Away'],title:'Away at Home',url:'https://www.tvpassport.com/tv-listings/stations/cbs-kcnc-denver-co/1566/2026-09-27'}]}]};
 feed.slates[0].programPages=[{call:'KCNC',callsign:'KCNC-TV',network:'CBS',day:'2026-09-27',timeZone:'America/Denver',url:feed.slates[0].rows[0].url,checkedAt,programs:[{minute:660,duration:180,title:'NFL Football',teams:['Home','Away']}]}];
 const rows=new Map();
 const DB={prepare(sql){let params;return {bind(...args){params=args;return this;},async first(){return rows.get(params[0])||null;},async run(){assert.match(sql,/INSERT INTO cache/);rows.set(params[0],{payload:params[1],expires:params[2]});return {meta:{changes:1}};}};}};
 const state={feed,raw,fail:null,backup:false,feedCalls:0,scrapeCalls:0};
 const fetcher=async url=>{
  const parsed=new URL(url);
  if(parsed.hostname.endsWith('espn.com')){if(state.scheduleFail)throw new Error('schedule timeout');return Response.json(parsed.searchParams.get('dates')==='20260927'?state.raw:{events:[]});}
  if(parsed.hostname==='feed.example'||parsed.hostname==='backup.example'){
   state.feedCalls++;
   if(parsed.hostname==='backup.example'&&state.backup)return Response.json(feed);
   if(state.fail==='network')throw new Error('timeout');
   if(state.fail==='json')return new Response('not JSON');
   if(state.fail==='schema')return Response.json({error:'unavailable'});
   if(state.fail)return new Response('Unavailable',{status:503});
   return Response.json(feed);
  }
  state.scrapeCalls++;return new Response('Unavailable',{status:503});
 };
 return {env:{DB,LISTINGS_URL:'https://feed.example/listings.json'},rows,state,fetcher,checkedAt,advance(ms){time+=ms;},put(key,value,ttl){rows.set(key,{payload:JSON.stringify(value),expires:time+ttl});}};
}

test('multiple five-minute refresh failures preserve verified evidence and its original timestamp',async t=>{
 const f=setup(t);
 let guide=await getGuide(f.env,start,f.fetcher);assert.equal(guide.games[0].local,'yes');
 for(const failure of ['http','network','json','schema']){
  f.advance(6*60000);f.state.fail=failure;
  guide=await getGuide(f.env,start,f.fetcher);
  assert.equal(guide.games[0].local,'yes',failure);assert.equal(guide.games[0].verifiedAt,f.checkedAt,failure);
 }
 assert.equal(f.state.scrapeCalls,0);assert.equal(f.state.feedCalls,5);
});
test('previously cached feed survives migration even when its five-minute cache has expired',async t=>{
 const f=setup(t);f.put('published-listings',f.state.feed,-1);f.state.fail='http';
 const guide=await getGuide(f.env,start,f.fetcher);
 assert.equal(guide.games[0].verifiedAt,f.checkedAt);assert.equal(guide.games[0].local,'yes');
});
test('empty or malformed replacement feed cannot wipe out retained valid per-schedule evidence',async t=>{
 const f=setup(t);await getGuide(f.env,start,f.fetcher);f.advance(6*60000);
 f.state.feed.slates[0].rows=[];
 const guide=await getGuide(f.env,start,f.fetcher);
 assert.equal(guide.games[0].local,'yes');assert.equal(guide.games[0].verifiedAt,f.checkedAt);
});
test('aging retains confirmed assignments without extending the evidence timestamp',async t=>{
 const f=setup(t);await getGuide(f.env,start,f.fetcher);f.state.fail='http';
 f.advance(119*60000);const almost=await getGuide(f.env,start,f.fetcher);assert.equal(almost.games[0].local,'yes');
 f.advance(60000);const expired=await getGuide(f.env,start,f.fetcher);assert.equal(expired.games[0].local,'yes');assert.equal(expired.games[0].verifiedAt,f.checkedAt);
 assert.equal(access(expired.games[0]).kind,'full');assert.equal(access(expired.games[0]).verificationState,'last-confirmed');assert.match(expired.verificationMessage,/not newly verified/);
 assert.ok(f.state.scrapeCalls>0);
});
test('a changed kickoff rejects the retained feed and previous schedule evidence',async t=>{
 const f=setup(t);await getGuide(f.env,start,f.fetcher);f.advance(6*60000);f.state.fail='http';
 f.state.raw={events:[{...event,date:'2026-09-27T20:25Z'}]};
 const guide=await getGuide(f.env,start,f.fetcher);assert.equal(guide.games[0].local,'unknown');assert.equal(guide.games[0].verifiedAt,null);
});
test('raw feed fallback recovers when the primary feed is unavailable',async t=>{
 const f=setup(t);f.env.LISTINGS_FALLBACK_URL='https://backup.example/listings.json';f.state.fail='http';f.state.backup=true;
 const guide=await getGuide(f.env,start,f.fetcher);assert.equal(guide.games[0].local,'yes');assert.equal(f.state.feedCalls,2);assert.equal(f.state.scrapeCalls,0);
});
test('fresh feed refresh replaces evidence with the new original check time',async t=>{
 const f=setup(t);await getGuide(f.env,start,f.fetcher);f.advance(6*60000);
 const next=new Date(Date.now()).toISOString();f.state.feed.slates[0].checkedAt=next;
 const guide=await getGuide(f.env,start,f.fetcher);assert.equal(guide.games[0].verifiedAt,next);
});

test('one-day and multi-day failures survive ordinary expired-cache cleanup',async t=>{
 const f=setup(t);await getGuide(f.env,start,f.fetcher);f.state.fail='http';
 for(const days of [1,3]){
  f.advance(days*24*3600000);
  for(const [key,row] of f.rows)if(row.expires<Date.now()-3600000)f.rows.delete(key);
  const guide=await getGuide(f.env,start,f.fetcher);
  assert.equal(guide.games[0].verifiedAt,f.checkedAt);assert.equal(access(guide.games[0]).kind,'full');
  assert.match(access(guide.games[0]).detail,/Last confirmed.*not newly verified/);
 }
});
test('schedule outage and empty response preserve the original saved schedule timestamp',async t=>{
 const f=setup(t),original=await getGuide(f.env,start,f.fetcher);f.advance(24*3600000);f.state.scheduleFail=true;
 let guide=await getGuide(f.env,start,f.fetcher);
 assert.equal(guide.scheduleState,'saved');assert.equal(guide.checkedAt,original.checkedAt);assert.equal(guide.games[0].verifiedAt,f.checkedAt);
 f.state.scheduleFail=false;f.state.raw={events:[]};f.advance(61000);
 guide=await getGuide(f.env,start,f.fetcher);assert.equal(guide.games.length,1);assert.equal(guide.scheduleState,'saved');assert.equal(guide.checkedAt,original.checkedAt);assert.match(guide.verificationMessage,/returned no games/);
});
test('a changed or removed game does not erase unaffected game confirmations',async t=>{
 const f=setup(t);const second={...event,id:'2',date:'2026-09-27T20:25Z'};f.state.raw={events:[event,second]};f.state.feed.slates[0].signature=signature(f.state.raw);
 const original=await getGuide(f.env,start,f.fetcher);assert.equal(original.games[0].local,'yes');
 f.advance(6*60000);f.state.fail='http';f.state.raw={events:[event,{...second,date:'2026-09-27T21:00Z'}]};
 let guide=await getGuide(f.env,start,f.fetcher);assert.equal(guide.games[0].local,'yes');assert.equal(guide.games[1].local,'unknown');
 f.advance(6*60000);f.state.raw={events:[second]};guide=await getGuide(f.env,start,f.fetcher);assert.deepEqual(guide.games.map(g=>g.id),['2']);
});
test('a newer competing assignment replaces old local access, and older feeds cannot restore it',async t=>{
 const f=setup(t);const other={...event,id:'2',competitions:[{...event.competitions[0],competitors:[{homeAway:'home',team:{displayName:'Other Home'}},{homeAway:'away',team:{displayName:'Other Away'}}]}]};
 f.state.raw={events:[event,other]};f.state.feed.slates[0].signature=signature(f.state.raw);
 await getGuide(f.env,start,f.fetcher);f.advance(6*60000);
 f.state.feed.slates[0].checkedAt=new Date(Date.now()).toISOString();f.state.feed.slates[0].rows[0].teams=['Other Home','Other Away'];
 let guide=await getGuide(f.env,start,f.fetcher);assert.equal(guide.games[0].local,'no');assert.equal(guide.games[1].local,'yes');
 f.advance(6*60000);f.state.feed.slates[0].checkedAt=f.checkedAt;f.state.feed.slates[0].rows[0].teams=['Home','Away'];
 guide=await getGuide(f.env,start,f.fetcher);assert.equal(guide.games[0].local,'no');
});
test('partial new listings keep the missing game original confirmation',async t=>{
 const f=setup(t);const second={...event,id:'2',date:'2026-09-27T20:25Z',competitions:[{...event.competitions[0],competitors:[{homeAway:'home',team:{displayName:'Other Home'}},{homeAway:'away',team:{displayName:'Other Away'}}]}]};
 f.state.raw={events:[event,second]};f.state.feed.slates[0].signature=signature(f.state.raw);
 f.state.feed.slates[0].rows.push({...f.state.feed.slates[0].rows[0],minute:865,teams:['Other Home','Other Away']});
 await getGuide(f.env,start,f.fetcher);f.advance(6*60000);
 f.state.feed.slates[0].checkedAt=new Date(Date.now()).toISOString();f.state.feed.slates[0].rows.pop();
 const guide=await getGuide(f.env,start,f.fetcher);assert.equal(guide.games[1].local,'yes');assert.equal(guide.games[1].verifiedAt,f.checkedAt);assert.notEqual(guide.games[0].verifiedAt,f.checkedAt);
});
test('cancellation and postponement invalidate access even with matching listing data',async t=>{
 const f=setup(t);await getGuide(f.env,start,f.fetcher);
 for(const name of ['STATUS_CANCELED','STATUS_POSTPONED','STATUS_SUSPENDED']){
  f.advance(6*60000);f.state.raw={events:[{...event,status:{type:{state:'pre',name,shortDetail:name}}}]};
  const guide=await getGuide(f.env,start,f.fetcher);assert.equal(guide.games[0].local,'unknown');assert.equal(guide.games[0].verifiedAt,null);assert.deepEqual(access(guide.games[0]).options,[]);
 }
});
test('new row evidence is selected even when the feed keeps a conservative old slate timestamp',async t=>{
 const f=setup(t);await getGuide(f.env,start,f.fetcher);f.advance(3*3600000);
 const newTime=new Date(Date.now()).toISOString();f.state.feed.slates[0].rows[0].checkedAt=newTime;
 const guide=await getGuide(f.env,start,f.fetcher);assert.equal(guide.games[0].verifiedAt,newTime);assert.equal(access(guide.games[0]).verificationState,'fresh');
});
test('newer evidence for one game is applied even if another cached row is newer still',async t=>{
 const f=setup(t);const second={...event,id:'2',date:'2026-09-27T20:25Z',competitions:[{...event.competitions[0],competitors:[{homeAway:'home',team:{displayName:'Other Home'}},{homeAway:'away',team:{displayName:'Other Away'}}]}]};
 f.state.raw={events:[event,second]};f.state.feed.slates[0].signature=signature(f.state.raw);
 const newer=f.checkedAt,older=new Date(Date.now()-3600000).toISOString(),middle=new Date(Date.now()-1800000).toISOString();
 f.state.feed.slates[0].rows[0].checkedAt=newer;
 f.state.feed.slates[0].rows.push({...f.state.feed.slates[0].rows[0],minute:865,teams:['Other Home','Other Away'],checkedAt:older});
 await getGuide(f.env,start,f.fetcher);f.advance(6*60000);
 f.state.feed.slates[0].rows[0].checkedAt=older;f.state.feed.slates[0].rows[1].checkedAt=middle;
 const guide=await getGuide(f.env,start,f.fetcher);
 assert.equal(guide.games[0].verifiedAt,newer);assert.equal(guide.games[1].verifiedAt,middle);
});
test('a newer competing assignment wins even when an unrelated cached game has a later timestamp',async t=>{
 const f=setup(t);
 const atSlot=(id,home,away)=>({...event,id,date:'2026-09-27T20:25Z',competitions:[{...event.competitions[0],competitors:[{homeAway:'home',team:{displayName:home}},{homeAway:'away',team:{displayName:away}}]}]});
 f.state.raw={events:[event,atSlot('2','B Home','B Away'),atSlot('3','C Home','C Away')]};f.state.feed.slates[0].signature=signature(f.state.raw);
 const stamp=minute=>new Date(Date.now()-minute*60000).toISOString();
 const latest=stamp(30),old=stamp(60),middle=stamp(40);
 f.state.feed.slates[0].rows[0].checkedAt=latest;
 f.state.feed.slates[0].rows.push({...f.state.feed.slates[0].rows[0],minute:865,teams:['B Home','B Away'],checkedAt:old});
 let guide=await getGuide(f.env,start,f.fetcher);assert.deepEqual(guide.games.map(g=>g.local),['yes','yes','no']);
 f.advance(6*60000);f.state.feed.slates[0].rows[0].checkedAt=old;f.state.feed.slates[0].rows[1].checkedAt=middle;f.state.feed.slates[0].rows[1].teams=['C Home','C Away'];
 guide=await getGuide(f.env,start,f.fetcher);assert.deepEqual(guide.games.map(g=>g.local),['yes','no','yes']);assert.equal(guide.games[0].verifiedAt,latest);assert.equal(guide.games[1].verifiedAt,middle);assert.equal(guide.games[2].verifiedAt,middle);
});

async function programming(f){
 const fs=await import('node:fs');
 const {parseProgramPage}=await import('../worker/program-listings.js');
 const {LOCAL_STATIONS}=await import('../worker/local-listings.js');
 const html=fs.readFileSync(new URL('./fixtures/kcnc-2026-10-25.html',import.meta.url),'utf8').replaceAll('2026-10-25','2026-09-27');
 return parseProgramPage(html,LOCAL_STATIONS[0],'2026-09-27',new Date(Date.now()).toISOString());
}
test('window-only published evidence passes through Worker selection/cache without a direct scrape',async t=>{
 const f=setup(t);f.state.feed.slates[0].rows=[];f.state.feed.slates[0].programPages=[await programming(f)];
 const guide=await getGuide(f.env,start,f.fetcher);assert.equal(guide.games[0].local,'no');assert.equal(guide.games[0].verifiedAt,f.checkedAt);assert.equal(f.state.scrapeCalls,0);
 const stored=[...f.rows].find(([key])=>key.startsWith('keyless-local:'));assert.equal(JSON.parse(stored[1].payload).programPages.length,1);
});
test('expired raw programming cannot newly confirm, while established negatives survive failed refreshes',async t=>{
 const f=setup(t);f.state.feed.slates[0].rows=[];f.state.feed.slates[0].programPages=[await programming(f)];
 await getGuide(f.env,start,f.fetcher);f.advance(3*3600000);f.state.fail='http';
 const retained=await getGuide(f.env,start,f.fetcher);assert.equal(retained.games[0].local,'no');assert.equal(retained.games[0].verifiedAt,f.checkedAt);assert.equal(access(retained.games[0]).verificationState,'last-confirmed');
 f.rows.clear();f.state.fail=null;
 const unconfirmed=await getGuide(f.env,start,f.fetcher);assert.equal(unconfirmed.games[0].local,'unknown');assert.equal(unconfirmed.games[0].verifiedAt,null);
});
test('new programming supersedes retained named access without old feed restoring it when raw pages age',async t=>{
 const f=setup(t);await getGuide(f.env,start,f.fetcher);f.advance(6*60000);
 f.state.feed.slates[0].programPages=[await programming(f)];
 let guide=await getGuide(f.env,start,f.fetcher);assert.equal(guide.games[0].local,'no');const checkedAt=guide.games[0].verifiedAt;
 f.advance(3*3600000);f.state.fail='http';
 guide=await getGuide(f.env,start,f.fetcher);assert.equal(guide.games[0].local,'no');assert.equal(guide.games[0].verifiedAt,checkedAt);
});

test('legacy fresh named feed triggers programming upgrade without losing confirmations on source failure',async t=>{
 const f=setup(t);delete f.state.feed.slates[0].programPages;
 const guide=await getGuide(f.env,start,f.fetcher);assert.equal(guide.games[0].local,'yes');assert.equal(guide.games[0].verifiedAt,f.checkedAt);assert.ok(f.state.scrapeCalls>0);
});

test('Worker prunes superseded named rows and cold stale feeds cannot restore them',async t=>{
 const f=setup(t);await getGuide(f.env,start,f.fetcher);f.advance(6*60000);
 f.state.feed.slates[0].programPages=[await programming(f)];
 await getGuide(f.env,start,f.fetcher);
 const stored=[...f.rows].find(([key])=>key.startsWith('keyless-local:'));assert.equal(JSON.parse(stored[1].payload).rows.length,0);
 f.advance(3*3600000);f.rows.clear();
 const cold=await getGuide(f.env,start,f.fetcher);assert.equal(cold.games[0].local,'unknown');assert.equal(cold.games[0].verifiedAt,null);
});

test('historical contradiction invalidates warm older yes without newly confirming no',async t=>{
 const f=setup(t),old=await getGuide(f.env,start,f.fetcher);f.advance(6*60000);
 f.state.feed.slates[0].programPages=[await programming(f)];
 f.advance(3*3600000);
 const guide=await getGuide(f.env,start,f.fetcher);assert.equal(guide.games[0].local,'unknown');assert.equal(guide.games[0].verifiedAt,null);assert.equal(guide.games[0].verificationInvalidations.length,1);
 const {reconcileGuide}=await import('../src/guide-state.js');
 assert.equal(reconcileGuide(guide,old).games[0].local,'unknown','browser cache cannot restore the superseded yes');
});

test('direct collection accepts a valid programming-only page through the full Worker pipeline',async t=>{
 const f=setup(t);delete f.env.LISTINGS_URL;
 const direct=async(url,options)=>{
  if(new URL(url).hostname.endsWith('espn.com'))return f.fetcher(url,options);
  if(url.endsWith('/save_timezone'))return new Response('',{headers:{'set-cookie':'anonymous=fixture; Path=/'}});
  return new Response('<script>const settings={timezone: "America/Denver"};</script><div data-listDateTime="2026-09-27 11:00:00" data-callsign="KCNC-TV" data-duration="180" data-showName="SailGP Racing" data-team1="" data-team2=""></div>');
 };
 const guide=await getGuide(f.env,start,direct);assert.equal(guide.games[0].local,'no');assert.equal(guide.games[0].verifiedAt,f.checkedAt);assert.equal(guide.games[0].station,null);
});
