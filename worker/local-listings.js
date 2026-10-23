import {localDate,mountain,isSundayAfternoon,STATIONS,canonicalNetwork} from '../src/core.js';
import {LOCAL_STATIONS,listingAttributes,listingUrl} from './listing-sources.js';
import {parseProgramPage,nonGameWindow} from './program-listings.js';
export {LOCAL_STATIONS} from './listing-sources.js';

const canonical=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function parseListings(html,station,day){
 const result=[];
 for(const attrs of listingAttributes(html)){
  const time=attrs['data-listdatetime'];
  if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(time)||!time.startsWith(day+' ')||attrs['data-callsign']!==station.callsign||attrs['data-live']!=='1'||attrs['data-showname']!=='NFL Football')continue;
  const teams=[attrs['data-team1'],attrs['data-team2']];
  if(teams.some(t=>!t))continue;
  result.push({network:station.network,call:station.call,day,minute:+time.slice(11,13)*60+ +time.slice(14,16),teams,title:attrs['data-episodetitle'],url:listingUrl(station,day)});
 }
 return result;
}
// Historical complete programming can invalidate an older named assignment,
// but cannot establish a new negative. Persist this pruning so a later partial
// page or cache loss cannot resurrect a source-backed assignment it superseded.
export function pruneSupersededListings(report,games,now=Date.now()){
 if(!report)return report;
 const rows=report.rows.filter(row=>!games.some(g=>{
  if(g.timeTbd||!isSundayAfternoon(g)||localDate(g.date)!==row.day||row.teams.map(canonical).sort().join('|')!==[g.away.name,g.home.name].map(canonical).sort().join('|'))return false;
  const minute=+mountain(g.date,{hour:'2-digit',hourCycle:'h23'})*60+ +mountain(g.date,{minute:'2-digit'});
  if(minute-row.minute< -5||minute-row.minute>30)return false;
  return (report.programPages||[]).some(page=>page?.call===row.call&&Date.parse(page.checkedAt)>Date.parse(row.checkedAt||report.checkedAt)&&nonGameWindow(page,row.day,minute,now,{allowStale:true}));
 }));
 return {...report,rows};
}
// A historical contradiction may invalidate an older station claim without
// newly confirming out-of-market access. Carry the original source/time so the
// browser's own retained guide cannot restore that same superseded claim.
export function withListingInvalidations(games,programPages=[],now=Date.now()){
 return games.map(g=>{
  if(g.timeTbd||!isSundayAfternoon(g))return g;
  const day=localDate(g.date),minute=+mountain(g.date,{hour:'2-digit',hourCycle:'h23'})*60+ +mountain(g.date,{minute:'2-digit'});
  const invalidations=programPages.map(page=>nonGameWindow(page,day,minute,now,{allowStale:true})).filter(Boolean).map(row=>({station:STATIONS[row.network],checkedAt:row.checkedAt,url:row.url}));
  return invalidations.length?{...g,verificationInvalidations:invalidations}:g;
 });
}
export function localReport(games,listings,checkedAt=new Date(Date.now()).toISOString(),programPages=[],now=Date.now()){
 listings=pruneSupersededListings({rows:listings,programPages,checkedAt},games,now).rows;
 const matched=(row,g)=>row.teams.map(canonical).sort().join('|')===[g.away.name,g.home.name].map(canonical).sort().join('|');
 const rows=games.map(g=>{
  if(g.timeTbd)return null;
  const day=localDate(g.date),hour=+mountain(g.date,{hour:'2-digit',hourCycle:'h23'}),minute=+mountain(g.date,{minute:'2-digit'});
  const sameTime=listings.filter(r=>r.day===day&&Math.abs(r.minute-(hour*60+minute))<=5);
  // Named game listings can begin with up to 30 minutes of pregame coverage.
  const matches=listings.filter(r=>r.day===day&&hour*60+minute-r.minute>=-5&&hour*60+minute-r.minute<=30&&matched(r,g));
  const networks=[...new Set(g.networks.map(canonicalNetwork))];
  const programming=isSundayAfternoon(g)?programPages.filter(p=>networks.includes(p?.network)||matches.some(r=>r.call===p?.call)).map(p=>nonGameWindow(p,day,hour*60+minute,now)).filter(Boolean).sort((a,b)=>Date.parse(b.checkedAt)-Date.parse(a.checkedAt)):[];
  // Each station is independent. Contradicting one local simulcast cannot erase
  // another source-backed station that still carries the matchup.
  const yes=matches.filter(r=>!programming.some(p=>p.call===r.call&&Date.parse(p.checkedAt)>Date.parse(r.checkedAt||checkedAt))).sort((a,b)=>Date.parse(b.checkedAt||checkedAt)-Date.parse(a.checkedAt||checkedAt))[0];
  const no=!yes&&isSundayAfternoon(g)?sameTime.filter(r=>!matched(r,g)&&networks.includes(canonicalNetwork(r.network))&&games.some(other=>matched(r,other)&&localDate(other.date)===day&&other.date===g.date)).sort((a,b)=>Date.parse(b.checkedAt||checkedAt)-Date.parse(a.checkedAt||checkedAt))[0]:null;
  // One station alone cannot rule out a multi-broadcaster game.
  const nonGame=networks.length===1?programming.find(p=>networks.includes(p.network)):null;
  const named=yes||no;
  const usePrograms=!yes&&nonGame&&(!no||Date.parse(nonGame.checkedAt)>Date.parse(no.checkedAt||checkedAt));
  const row=usePrograms?nonGame:named;
  if(!row)return null;
  const isLocal=!usePrograms&&!!yes;
  const notes=usePrograms?`Denver's ${row.call} lists non-game programming throughout this three-hour kickoff window: ${row.title}.`:
   isLocal?`Denver listing: ${row.call} carries this matchup in the kickoff window.`:`Denver's ${row.call} listing selects ${row.title} in this window.`;
  return {id:g.id,date:g.date,checkedAt:row.checkedAt||checkedAt,local:isLocal?'yes':'no',station:isLocal?STATIONS[row.network]:null,
   mobile:g.mobile===true,requiredService:isLocal?null:'NFL Sunday Ticket',notes,
   sources:[{title:`${row.call} ${row.day} · TV Passport station listing`,url:row.url,evidence:row.title},...(g.sources||[])]};
 }).filter(Boolean);
 return {checkedAt,games:rows};
}
export async function fetchLocalListings(games,fetcher=fetch){
 if(!games.length)return {rows:[],programPages:[],successfulPages:0,diagnostics:[],checkedAt:new Date().toISOString()};
 // The provider defaults to the visitor's location, including overseas CI runners.
 // Set an anonymous session preference before requesting Denver's dated listings.
 let cookie='';
 try{const preference=await fetcher('https://www.tvpassport.com/my-passport/dashboard/save_timezone',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'timezone=America%2FDenver',signal:AbortSignal.timeout(12000)});cookie=(preference.headers.get('set-cookie')||'').split(';')[0];}catch{}
 const dates=[...new Set(games.map(g=>localDate(g.date)))];
 const jobs=dates.flatMap(day=>LOCAL_STATIONS.filter(station=>games.some(g=>localDate(g.date)===day&&(g.networks.some(n=>canonicalNetwork(n)===station.network)||g.away.abbr==='DEN'||g.home.abbr==='DEN'||(station.network==='ABC'&&g.networks.some(n=>canonicalNetwork(n)==='ESPN'))))).map(station=>({day,station})));
 const rows=[],programPages=[],diagnostics=[];let successfulPages=0;
 // Four workers bound parallel requests; fetch only dates that actually contain games.
 await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{
  while(jobs.length){const {day,station}=jobs.pop();
   try{const url=listingUrl(station,day);
    let response=await fetcher(url,{headers:{Accept:'text/html','User-Agent':'BoulderHuddle/1.0','Accept-Language':'en-US,en;q=0.9',...(cookie?{Cookie:cookie}:{})},signal:AbortSignal.timeout(12000)});
    let html=response.ok?await response.text():'';let via='direct';
    if(!/data-listdatetime=/i.test(html)){
     // Fetch rendered HTML, not model-generated text. The same strict date/team parser applies.
     response=await fetcher('https://r.jina.ai/'+url,{headers:{'x-respond-with':'html','x-no-cache':'true'},signal:AbortSignal.timeout(25000)});
     html=response.ok?await response.text():'';via='reader';
    }
    if(html.length>2000000)continue;
    if(!/timezone:\s*"America\/Denver"/.test(html)){diagnostics.push({call:station.call,day,error:'Unconfirmed listing timezone'});continue;}
    const checkedAt=new Date(Date.now()).toISOString();
    const parsed=parseListings(html,station,day);rows.push(...parsed.map(row=>({...row,checkedAt})));
    const page=parseProgramPage(html,station,day,checkedAt);if(page)programPages.push(page);
    if(parsed.length)successfulPages++;
    diagnostics.push({call:station.call,day,status:response.status,parsed:parsed.length,programs:page?.programs.length||0,via});
   }catch(e){diagnostics.push({call:station.call,day,error:e.name});}
  }
 }));
 return {rows,programPages,successfulPages,diagnostics,checkedAt:new Date(Date.now()).toISOString()};
}
