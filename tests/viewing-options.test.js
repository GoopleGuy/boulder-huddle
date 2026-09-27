import test from 'node:test';
import assert from 'node:assert/strict';
import {access,calendar,mergeVerification,normalizeScoreboard} from '../src/core.js';
import {localReport} from '../worker/local-listings.js';
import {renderWatchOptions} from '../src/watch-options.js';
const now=Date.parse('2026-09-27T16:30Z');
const game={id:'1',date:'2026-09-27T17:00Z',seasonType:2,networks:['CBS'],local:'yes',station:'KCNC · 4.1',verifiedAt:new Date(now).toISOString(),away:{name:'Away'},home:{name:'Home'}};
const ids=result=>result.options.map(o=>o.id);

test('local game lists antenna, streaming, every selected TV provider, mobile and RedZone together',()=>{
 const result=access(game,{ota:true,paramount:true,youtubetv:true,hulu:true,tv_cbs:true,nfl:true,redzone:true,tv_redzone:true},now);
 assert.deepEqual(ids(result),['ota','paramount','youtubetv','hulu','nfl-mobile','nfl-redzone','youtubetv-redzone','hulu-redzone']);
 assert.equal(result.kind,'full');assert.equal(result.mobile,true);assert.equal(result.redzone,true);
 assert.equal(new Set(ids(result)).size,result.options.length);
});
test('NFL+ Premium supplies mobile and RedZone without antenna or a second NFL+ toggle',()=>{
 const result=access(game,{redzone:true},now);
 assert.deepEqual(ids(result),['nfl-mobile','nfl-redzone']);assert.equal(result.kind,'mobile');
 const html=renderWatchOptions(result);
 assert.match(html,/phone\/tablet only; no TV casting/);assert.match(html,/Live look-ins · not the full game/);
 assert.equal((html.match(/<li /g)||[]).length,2);
 const ics=calendar(game,result);assert.match(ics,/NFL\+/);assert.match(ics,/RedZone/);assert.match(ics,/no TV casting/);assert.match(ics,/not the full game/);
});
test('verified out-of-market game offers Sunday Ticket and RedZone but not NFL+ mobile',()=>{
 const result=access({...game,local:'no',station:null},{ticket:true,redzone:true,paramount:true,ota:true},now);
 assert.deepEqual(ids(result),['ticket','nfl-redzone']);assert.equal(result.mobile,false);
});
test('unknown, stale, future, preseason and unowned mobile access are never inferred',()=>{
 for(const overrides of [{local:'unknown',station:null},{verifiedAt:new Date(now-3*3600e3).toISOString()},{verifiedAt:new Date(now+1).toISOString()},{seasonType:1}]){
  assert.equal(access({...game,...overrides},{redzone:true},now).mobile,false);
 }
 assert.deepEqual(ids(access(game,{},now)),[]);
 assert.deepEqual(ids(access(game,{nfl:true},now)),['nfl-mobile']);
 assert.equal(access({...game,seasonType:3},{nfl:true},now).mobile,true);
});
test('multiple national streaming paths coexist and existing eligibility rules still apply',()=>{
 const result=access({...game,date:'2026-09-28T00:20Z',networks:['NBC']},{ota:true,peacock:true,nfl:true,redzone:true},now);
 assert.deepEqual(ids(result),['ota','peacock','nfl-mobile']);assert.equal(result.redzone,false);
 assert.deepEqual(ids(access({...game,networks:['ESPN+'],local:'unknown',station:null},{espn:true,espnplus:true},now)),['espn','espnplus']);
});
test('real normalization and station-verification path makes verified local games mobile eligible',()=>{
 const raw={events:[{id:'1',date:game.date,season:{year:2026,type:2},competitions:[{competitors:[{homeAway:'home',team:{displayName:'Home'}},{homeAway:'away',team:{displayName:'Away'}}],broadcasts:[{names:['CBS']}]}]}]};
 const games=normalizeScoreboard(raw);
 const report=localReport(games,[{network:'CBS',call:'KCNC',day:'2026-09-27',minute:660,teams:['Home','Away'],title:'Away at Home',url:'https://www.tvpassport.com/tv-listings/stations/cbs-kcnc-denver-co/1566/2026-09-27'}],new Date(now).toISOString());
 const verified=mergeVerification(games,report,now)[0];
 assert.deepEqual(ids(access(verified,{redzone:true},now)),['nfl-mobile','nfl-redzone']);
});
test('viewing method labels are escaped and unavailable methods have no option rows',()=>{
 assert.match(renderWatchOptions({options:[{kind:'full',label:'<script>',detail:'A & B'}]}),/&lt;script&gt;/);
 assert.doesNotMatch(renderWatchOptions(access(game,{},now)),/<li /);
});
