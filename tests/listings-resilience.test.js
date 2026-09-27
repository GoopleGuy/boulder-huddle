import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {getGuide} from '../worker/index.js';
import {normalizeScoreboard} from '../src/core.js';

const start='2026-09-22';
const event={id:'1',date:'2026-09-27T17:00Z',season:{year:2026,type:2},competitions:[{competitors:[{homeAway:'home',team:{displayName:'Home'}},{homeAway:'away',team:{displayName:'Away'}}],broadcasts:[{names:['CBS']}]}]};
const signature=raw=>createHash('sha256').update(JSON.stringify(normalizeScoreboard(raw).map(g=>[g.id,g.date,g.networks]))).digest('hex');
const raw={events:[event]};
function setup(t){
 let time=Date.parse('2026-09-27T16:00Z');
 t.mock.method(Date,'now',()=>time);t.mock.method(console,'warn',()=>{});
 const checkedAt=new Date(time).toISOString();
 const feed={schema:1,slates:[{signature:signature(raw),checkedAt,rows:[{call:'KCNC',network:'CBS',day:'2026-09-27',minute:660,teams:['Home','Away'],title:'Away at Home',url:'https://www.tvpassport.com/tv-listings/stations/cbs-kcnc-denver-co/1566/2026-09-27'}]}]};
 const rows=new Map();
 const DB={prepare(sql){let params;return {bind(...args){params=args;return this;},async first(){return rows.get(params[0])||null;},async run(){assert.match(sql,/INSERT INTO cache/);rows.set(params[0],{payload:params[1],expires:params[2]});return {meta:{changes:1}};}};}};
 const state={feed,raw,fail:null,backup:false,feedCalls:0,scrapeCalls:0};
 const fetcher=async url=>{
  const parsed=new URL(url);
  if(parsed.hostname.endsWith('espn.com'))return Response.json(parsed.searchParams.get('dates')==='20260927'?state.raw:{events:[]});
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
test('expired evidence is not extended by failed refreshes or by the guide cache',async t=>{
 const f=setup(t);await getGuide(f.env,start,f.fetcher);f.state.fail='http';
 f.advance(119*60000);const almost=await getGuide(f.env,start,f.fetcher);assert.equal(almost.games[0].local,'yes');
 f.advance(60000);const expired=await getGuide(f.env,start,f.fetcher);assert.equal(expired.games[0].local,'unknown');assert.equal(expired.games[0].verifiedAt,null);
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
