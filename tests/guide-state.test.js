import test from 'node:test';
import assert from 'node:assert/strict';
import {retainConfirmedGames,reconcileGuide,savedGuide,confirmationSummary} from '../src/guide-state.js';
import {access,evidenceKey,mergeVerification} from '../src/core.js';
import {reminderDue} from '../worker/index.js';
const now=Date.parse('2026-09-27T16:00Z');
const game={id:'1',date:'2026-09-27T17:00Z',networks:['CBS'],state:'pre',away:{name:'Away'},home:{name:'Home'},season:2026,seasonType:2,local:'unknown',verifiedAt:null,sources:[]};
const prior={...game,local:'yes',station:'KCNC · 4.1',verifiedAt:'2026-09-24T16:00Z',sources:[{title:'Station listing',url:'https://www.tvpassport.com/tv-listings/stations/cbs-kcnc-denver-co/1566/2026-09-27'}]};
test('browser cache migration retains original source-backed confirmation on an unconfirmed response',()=>{
 const result=reconcileGuide({games:[game],checkedAt:new Date(now).toISOString()},{games:[prior]},now);
 assert.equal(result.games[0].verifiedAt,prior.verifiedAt);assert.equal(result.games[0].verificationKey,evidenceKey(game));
 const option=access(result.games[0],{ota:true,nfl:true},now);assert.equal(option.kind,'full');assert.equal(option.mobile,true);assert.equal(option.verificationState,'last-confirmed');assert.match(option.detail,/Sep 24, 2026/);
 assert.deepEqual(confirmationSummary(result.games,now),{confirmed:1,retained:1,lastConfirmedAt:prior.verifiedAt});
});
test('changed date, team, network, season and TBD invalidate only their own evidence',()=>{
 for(const change of [{date:'2026-09-27T20:25Z'},{away:{name:'Another'}},{networks:['FOX']},{seasonType:1},{season:2027},{timeTbd:true}]){
  const result=retainConfirmedGames([{...game,...change}, {...game,id:'2'}],[prior,{...prior,id:'2'}],now);
  assert.equal(result[0].local,'unknown');assert.equal(result[1].local,'yes');
 }
});
test('unknown, old, future and sourceless evidence cannot replace retained confirmation',()=>{
 for(const change of [{local:'unknown',station:null},{verifiedAt:'2026-09-20T16:00Z'},{verifiedAt:'2026-09-28T16:00Z'},{sources:[]}]){
  const incoming={...prior,verifiedAt:new Date(now).toISOString(),...change};
  assert.equal(retainConfirmedGames([incoming],[prior],now)[0].verifiedAt,prior.verifiedAt);
 }
 const bad={...prior,sources:[{title:'bad',url:'javascript:bad'}]};
 assert.equal(retainConfirmedGames([game],[bad],now)[0].local,'unknown');
});
test('new source-backed yes/no wins and network ordering alone does not invalidate it',()=>{
 const newer={...prior,local:'no',station:null,verifiedAt:new Date(now).toISOString()};
 assert.equal(retainConfirmedGames([newer],[prior],now)[0].local,'no');
 const old={...prior,networks:['CBS','ABC']},incoming={...game,networks:['ABC','CBS']};
 assert.equal(retainConfirmedGames([incoming],[old],now)[0].local,'yes');
});
test('saved guide and empty refresh preserve schedule time; nonempty schedules control removals',()=>{
 const previous={games:[prior],checkedAt:prior.verifiedAt};
 const saved=savedGuide(previous,'Source unavailable.');assert.equal(saved.checkedAt,previous.checkedAt);assert.equal(saved.scheduleState,'saved');
 assert.match(saved.verificationMessage,/not newly verified/);
 assert.equal(reconcileGuide({games:[]},previous,now).games.length,1);
 assert.deepEqual(reconcileGuide({games:[{...game,id:'2'}]},previous,now).games.map(g=>g.id),['2']);
 assert.deepEqual(reconcileGuide({games:[]},null,now).games,[]);
 assert.throws(()=>reconcileGuide({games:[{}]},previous,now),/Invalid guide/);
});
test('canceled, postponed and suspended games lose viewing options and never trigger kickoff reminders',()=>{
 for(const statusName of ['STATUS_CANCELED','STATUS_POSTPONED','STATUS_SUSPENDED']){
  const changed={...game,statusName,date:new Date(now+10*60000).toISOString()};
  const result=retainConfirmedGames([changed],[{...prior,date:changed.date}],now)[0];
  assert.equal(result.verifiedAt,null);assert.deepEqual(access(result,undefined,now).options,[]);assert.equal(reminderDue(result,now),false);
 }
});
test('stale reports require explicit retention mode and keep their original timestamp',()=>{
 const report={checkedAt:prior.verifiedAt,games:[prior]};
 assert.equal(mergeVerification([game],report,now)[0].local,'unknown');
 const retained=mergeVerification([game],report,now,{allowStale:true})[0];
 assert.equal(retained.verifiedAt,prior.verifiedAt);assert.equal(access(retained,undefined,now).verificationState,'last-confirmed');
});
test('aging alone does not change the reminder viewing-options fingerprint',()=>{
 const g={...prior,verificationKey:evidenceKey(prior)};
 const fingerprint=at=>{const a=access(g,undefined,at);return JSON.stringify([g.date,g.networks,a.line,a.kind]);};
 assert.equal(fingerprint(Date.parse(prior.verifiedAt)),fingerprint(now));
});
test('per-row timestamps from partial published runs remain the confirmation source of truth',()=>{
 const report={checkedAt:new Date(now).toISOString(),games:[{...prior,checkedAt:prior.verifiedAt}]};
 const g=mergeVerification([game],report,now,{allowStale:true})[0];
 assert.equal(g.verifiedAt,prior.verifiedAt);assert.equal(access(g,undefined,now).verificationState,'last-confirmed');
});

test('source-backed station invalidations reject only an older same-station local claim',()=>{
 const valid={station:prior.station,checkedAt:'2026-09-25T16:00Z',url:prior.sources[0].url};
 const invalidated={...game,verificationInvalidations:[valid]};
 assert.equal(retainConfirmedGames([invalidated],[prior],now)[0].local,'unknown');
 for(const change of [{station:'KMGH · 7.1'},{checkedAt:'2026-09-20T00:00Z'},{checkedAt:'2026-09-28T00:00Z'},{checkedAt:'bad'},{url:'javascript:bad'}]){
  assert.equal(retainConfirmedGames([{...game,verificationInvalidations:[{...valid,...change}]}],[prior],now)[0].local,'yes');
 }
 assert.equal(retainConfirmedGames([invalidated],[{...prior,local:'no',station:null}],now)[0].local,'no');
});

test('station invalidations survive partial refreshes but not a changed event identity',()=>{
 const invalidation={station:prior.station,checkedAt:'2026-09-25T16:00Z',url:prior.sources[0].url};
 const invalidated={...game,verificationInvalidations:[invalidation]};
 const partial=retainConfirmedGames([game],[invalidated],now)[0];
 assert.equal(partial.verificationInvalidations[0].checkedAt,invalidation.checkedAt);
 assert.equal(retainConfirmedGames([partial],[prior],now)[0].local,'unknown');
 const staleIncoming=retainConfirmedGames([{...prior,notes:'KCNC carries this matchup'}],[partial],now)[0];
 assert.equal(staleIncoming.local,'unknown','old response cannot resurrect station claim');assert.equal(staleIncoming.notes,'');
 const fresh={...prior,verifiedAt:'2026-09-27T15:00Z'};
 assert.equal(retainConfirmedGames([fresh],[partial],now)[0].local,'yes','new confirmation supersedes older invalidation');
 assert.equal(retainConfirmedGames([{...game,date:'2026-09-27T20:25Z'}],[invalidated],now)[0].verificationInvalidations,undefined);
});
