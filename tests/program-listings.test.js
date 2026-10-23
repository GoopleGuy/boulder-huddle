import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseProgramPage,validProgramPage,nonGameWindow} from '../worker/program-listings.js';
import {LOCAL_STATIONS,localReport,fetchLocalListings} from '../worker/local-listings.js';
import {selectPublishedListings,mergeListingEvidence,hasListingEvidence} from '../worker/published-listings.js';
import {access,mergeVerification,canonicalNetwork,evidenceKey} from '../src/core.js';
import {retainConfirmedGames} from '../src/guide-state.js';
const stamp='2026-10-23T04:00:00.000Z',now=Date.parse(stamp),day='2026-10-25';
const html=fs.readFileSync(new URL('./fixtures/kcnc-2026-10-25.html',import.meta.url),'utf8');
const captured=JSON.parse(fs.readFileSync(new URL('./fixtures/guide-2026-10-20.json',import.meta.url),'utf8'));
const page=()=>parseProgramPage(html,LOCAL_STATIONS[0],day,stamp);
const game=captured.games.find(g=>g.id==='401873012');
const report=(p,at=now)=>localReport([game],[],stamp,[p],at);

test('captured complete KCNC programming certifies four early CBS games as not local, never full access',()=>{
 const p=page();assert.ok(validProgramPage(p,now));
 const games=captured.games.filter(g=>g.networks.includes('CBS')&&g.date==='2026-10-25T17:00Z');
 const result=localReport(games,[],stamp,[p],now);assert.equal(result.games.length,4);
 for(const g of mergeVerification(games,result,now)){
  assert.equal(g.local,'no');assert.equal(g.station,null);assert.equal(g.verifiedAt,stamp);assert.equal(g.requiredService,'NFL Sunday Ticket');
  const options=access(g,{ota:true,nfl:true,redzone:true},now);assert.equal(options.kind,'redzone');assert.equal(options.mobile,false);assert.ok(options.options.every(o=>o.kind!=='full'));
 }
 assert.match(result.games[0].notes,/SailGP Racing/);
 assert.equal(nonGameWindow(p,day,845,now),null,'Broncos NFL window is not negative evidence');
});

test('full captured slate resolves the three Fox conflicts plus four CBS programming windows',()=>{
 const result=localReport(captured.games,captured.rows,stamp,[page()],now);
 assert.equal(result.games.filter(g=>g.local==='yes').length,5);
 assert.equal(result.games.filter(g=>g.local==='no').length,7);
 assert.deepEqual(result.games.filter(g=>g.local==='no').map(g=>g.id),['401873012','401873013','401873014','401873015','401873016','401873018','401873021']);
});

test('partial pages, gaps, overlaps, missing durations and mixed NFL entries never establish non-carriage',()=>{
 const changes=[
  p=>{p.programs=p.programs.filter(x=>x.minute!==720);},
  p=>{p.programs.find(x=>x.minute===720).minute++;},
  p=>{p.programs.find(x=>x.minute===720).minute--;},
  p=>{delete p.programs.find(x=>x.minute===720).duration;},
  p=>{p.programs.find(x=>x.minute===720).duration=0;},
  p=>{p.programs.find(x=>x.minute===720).duration=-1;},
  p=>{p.programs.find(x=>x.minute===720).duration=721;},
  p=>{p.programs.find(x=>x.minute===720).title='NFL Football';},
  p=>{p.programs.find(x=>x.minute===720).title='College Football';},
  p=>{p.programs.find(x=>x.minute===720).teams=['Cincinnati Bengals','Baltimore Ravens'];},
  p=>{p.programs.push({...p.programs.find(x=>x.minute===720)});},
  p=>{p.programs=p.programs.filter(x=>x.minute<810);}
 ];
 for(const mutate of changes){const p=page();mutate(p);assert.equal(report(p).games.length,0);}
});

test('unknown, generic and blank programming cannot fill a non-game window',()=>{
 for(const title of ['',' ','TBA','TBD','To Be Announced','Local Programming','Local   Programming','Sports Special','Teams TBA','Football','Programming unavailable','T.B.A.','T. B. D.','Sports','---','…','🏈']){
  const p=page();p.programs.find(x=>x.minute===720).title=title;assert.equal(report(p).games.length,0,title);
 }
});

test('freshness, exact station/subchannel, network, URL, date and timezone are mandatory',()=>{
 for(const change of [
  {checkedAt:new Date(now-2*3600000).toISOString()},{checkedAt:new Date(now+1).toISOString()},{checkedAt:'bad'},
  {callsign:'KCNC-other'},{callsign:'KCNC'},{call:'KDVR'},{network:'FOX'},{timeZone:'Europe/Paris'},
  {day:'2026-10-26'},{day:'2026-02-30'},{url:page().url+'?station=other'},{url:page().url.replace('1566','6401')}
 ])assert.equal(report({...page(),...change}).games.length,0,JSON.stringify(change));
 assert.equal(report(null).games.length,0);
 assert.equal(localReport([{...game,networks:['CBS','Fox']}],[],stamp,[page()],now).games.length,0,'one station cannot rule out a simulcast');
});

test('malformed/timezone-mismatched source HTML cannot become a program-page snapshot',()=>{
 for(const changed of [html.replaceAll('America/Denver','Europe/Paris'),html.replaceAll('KCNC-TV','KCNC-other'),html.replaceAll('data-duration="60"','data-duration="bad"'),html.replace('11:00:00','11:60:00'),html.replace('11:00:00','25:00:00')]){
  assert.equal(parseProgramPage(changed,LOCAL_STATIONS[0],day,stamp),null);
 }
 assert.equal(parseProgramPage(html,LOCAL_STATIONS[1],day,stamp),null);
 assert.equal(parseProgramPage(html+'<div data-callsign="KCNC-TV" data-showName="NFL Football"></div>',LOCAL_STATIONS[0],day,stamp),null);
});

test('Denver DST conversion is respected and generic local programming keeps next-week late FOX unknown',()=>{
 const fox=fs.readFileSync(new URL('./fixtures/kdvr-2026-11-01.html',import.meta.url),'utf8');
 const p=parseProgramPage(fox,LOCAL_STATIONS[1],'2026-11-01',stamp);assert.ok(p);
 const late={...game,date:'2026-11-01T21:05Z',networks:['Fox']};
 assert.equal(localReport([late],[],stamp,[p],now).games.length,0);
 const g={...game,date:'2026-11-01T18:00Z'};
 const winter={...page(),day:'2026-11-01',url:page().url.replace(day,'2026-11-01')};
 assert.equal(localReport([g],[],stamp,[winter],now).games[0].local,'no');
});

test('newer explicit non-game window replaces older named assignment, not a newer assignment',()=>{
 const yes={...captured.rows.find(r=>r.call==='KCNC'),minute:660,teams:[game.away.name,game.home.name],title:'Cincinnati Bengals at Baltimore Ravens',checkedAt:new Date(now-60000).toISOString()};
 assert.equal(localReport([game],[yes],stamp,[page()],now).games[0].local,'no');
 const newer={...yes,checkedAt:stamp};const older={...page(),checkedAt:new Date(now-60000).toISOString()};
 assert.equal(localReport([game],[newer],stamp,[older],now).games[0].local,'yes');
 assert.equal(localReport([game],[newer],stamp,[page()],now).games[0].local,'yes','tie favors named evidence');
 const simulcast={...yes,call:'KMGH',network:'ABC',url:captured.rows.find(r=>r.call==='KMGH').url};
 assert.equal(localReport([game],[simulcast],stamp,[page()],now).games[0].local,'yes','KCNC programming cannot disprove KMGH simulcast');
 const both=localReport([game],[yes,simulcast],stamp,[page()],now).games[0];
 assert.equal(both.local,'yes');assert.equal(both.station,'KMGH · 7.1','surviving second simulcast is not hidden by first match');
});

test('aging raw windows cannot newly certify; established game confirmations retain original timestamp',()=>{
 const p=page(),first=mergeVerification([game],report(p),now)[0];
 assert.equal(first.local,'no');
 const later=now+3*3600000,empty=localReport([game],[],stamp,[p],later);assert.equal(empty.games.length,0);
 const unchanged=retainConfirmedGames([{...game,local:'unknown',verifiedAt:null,sources:[]}],[first],later)[0];
 assert.equal(unchanged.local,'no');assert.equal(unchanged.verifiedAt,stamp);assert.equal(access(unchanged,undefined,later).verificationState,'last-confirmed');
});

test('window-only published/cache evidence is retained with exact timestamps, never revived when stale',()=>{
 const feed={schema:1,slates:[{signature:'x',checkedAt:stamp,rows:[],programPages:[page()]}]};
 let selected=selectPublishedListings(feed,'x',now,{allowStale:true});assert.equal(selected.programPages.length,1);assert.ok(hasListingEvidence(selected));
 const merged=mergeListingEvidence(selected);assert.equal(merged.programPages[0].checkedAt,stamp);assert.equal(merged.checkedAt,stamp);
 selected=selectPublishedListings(feed,'x',now+3*3600000,{allowStale:true});assert.equal(selected.programPages.length,1,'historical snapshot may prevent resurrection, not newly certify');assert.equal(localReport([game],selected.rows,selected.checkedAt,selected.programPages,now+3*3600000).games.length,0);
});

test('merging never combines partial programming snapshots across timestamps',()=>{
 const a=page(),b=page();a.programs=a.programs.filter(p=>p.minute<750);b.programs=b.programs.filter(p=>p.minute>=750);b.checkedAt=new Date(now+60000).toISOString();
 const merged=mergeListingEvidence({rows:[],programPages:[a]},{rows:[],programPages:[b]});
 assert.equal(merged.programPages.length,1);assert.equal(merged.programPages[0].checkedAt,b.checkedAt);
 assert.equal(report(merged.programPages[0],now+60000).games.length,0);
});

test('broadcast aliases are canonicalized without changing stored source signatures or retained keys',()=>{
 for(const name of ['Fox','FOX',' fox '])assert.equal(canonicalNetwork(name),'FOX');
 for(const name of ['NFL Net','NFLNet','NFL Network','nfl network']){
  assert.equal(canonicalNetwork(name),'NFL Network');
  assert.equal(access({...game,networks:[name]},{nfl:true},now).options[0].id,'nfl-network');
 }
 const legacy={...captured.games.find(g=>g.networks.includes('Fox')),local:'no',verifiedAt:new Date(now-3*3600000).toISOString(),sources:[{title:'KDVR',url:captured.rows.find(r=>r.call==='KDVR').url}]};
 legacy.verificationKey=evidenceKey(legacy);assert.match(legacy.verificationKey,/Fox/);
 const retained=retainConfirmedGames([{...legacy,local:'unknown',verifiedAt:null,sources:[]}],[legacy],now)[0];
 assert.equal(retained.local,'no');assert.equal(retained.verifiedAt,legacy.verifiedAt);assert.equal(retained.verificationKey,legacy.verificationKey);
});

test('Fox games trigger a KDVR collection job even without a Broncos game',async()=>{
 const urls=[];const fetcher=async url=>{urls.push(url);return new Response('<script>const settings={timezone: "America/Denver"}</script>');};
 await fetchLocalListings([{...game,networks:['Fox']}],fetcher);
 assert.ok(urls.some(u=>u.includes('/fox-kdvr-denver-co-hd/6401/')));
 assert.ok(!urls.some(u=>u.includes('/cbs-kcnc-denver-co/')));
});

test('cold cache cannot resurrect an older positive after the newer contradictory page ages',()=>{
 const yes={...captured.rows.find(r=>r.call==='KCNC'),minute:660,teams:[game.away.name,game.home.name],title:'Cincinnati Bengals at Baltimore Ravens',checkedAt:new Date(now-3600000).toISOString()};
 const feed={schema:1,slates:[{signature:'x',checkedAt:yes.checkedAt,rows:[yes],programPages:[page()]}]};
 const later=now+3*3600000,selected=selectPublishedListings(feed,'x',later,{allowStale:true});
 const result=localReport([game],selected.rows,selected.checkedAt,selected.programPages,later);
 assert.equal(result.games.length,0,'old positive is suppressed, stale negative is not newly certified');
});
