import {localDate,mountain,isSundayAfternoon,STATIONS} from '../src/core.js';

export const LOCAL_STATIONS=[
 {network:'CBS',call:'KCNC',path:'cbs-kcnc-denver-co/1566'},
 {network:'FOX',call:'KDVR',path:'fox-kdvr-denver-co-hd/6401'},
 {network:'NBC',call:'KUSA',path:'nbc-kusa-denver-co/1569'},
 {network:'ABC',call:'KMGH',path:'abc-kmgh-denver-co-hd/5723'}
];
const decode=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n));
const canonical=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function parseListings(html,station,day){
 const result=[];
 for(const match of html.matchAll(/<div\b[^>]*\bdata-listDateTime="[^"]*"[^>]*>/gi)){
  const attrs=Object.fromEntries([...match[0].matchAll(/\b(data-[\w-]+)="([^"]*)"/g)].map(m=>[m[1].toLowerCase(),decode(m[2])]));
  const time=attrs['data-listdatetime'];
  if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(time)||!time.startsWith(day+' ')||!attrs['data-callsign']?.startsWith(station.call)||attrs['data-live']!=='1'||attrs['data-showname']!=='NFL Football')continue;
  const teams=[attrs['data-team1'],attrs['data-team2']];
  if(teams.some(t=>!t))continue;
  result.push({network:station.network,call:station.call,day,minute:+time.slice(11,13)*60+ +time.slice(14,16),teams,title:attrs['data-episodetitle'],url:`https://www.tvpassport.com/tv-listings/stations/${station.path}/${day}`});
 }
 return result;
}
export function localReport(games,listings,checkedAt=new Date().toISOString()){
 const matched=(row,g)=>row.teams.map(canonical).sort().join('|')===[g.away.name,g.home.name].map(canonical).sort().join('|');
 const rows=games.map(g=>{
  if(g.timeTbd)return null;
  const day=localDate(g.date),hour=+mountain(g.date,{hour:'2-digit',hourCycle:'h23'}),minute=+mountain(g.date,{minute:'2-digit'});
  const sameTime=listings.filter(r=>r.day===day&&Math.abs(r.minute-(hour*60+minute))<=5);
  // Named game listings can begin with up to 30 minutes of pregame coverage.
  const yes=listings.find(r=>r.day===day&&hour*60+minute-r.minute>=-5&&hour*60+minute-r.minute<=30&&matched(r,g));
  const no=!yes&&isSundayAfternoon(g)?sameTime.find(r=>g.networks.includes(r.network)&&games.some(other=>matched(r,other)&&localDate(other.date)===day&&other.date===g.date)):null;
  if(!yes&&!no)return null;
  const row=yes||no;
  return {id:g.id,date:g.date,local:yes?'yes':'no',station:yes?STATIONS[row.network]:null,
   mobile:g.mobile===true,requiredService:yes?null:'NFL Sunday Ticket',
   notes:yes?`Denver listing: ${row.call} carries this matchup in the kickoff window.`:`Denver's ${row.call} listing selects ${row.title} in this window.`,
   sources:[{title:`${row.call} ${row.day} · TV Passport station listing`,url:row.url,evidence:row.title},...(g.sources||[])]};
 }).filter(Boolean);
 return {checkedAt,games:rows};
}
export async function fetchLocalListings(games,fetcher=fetch){
 const dates=[...new Set(games.map(g=>localDate(g.date)))];
 const jobs=dates.flatMap(day=>LOCAL_STATIONS.filter(station=>games.some(g=>localDate(g.date)===day&&(g.networks.includes(station.network)||g.away.abbr==='DEN'||g.home.abbr==='DEN'||(station.network==='ABC'&&g.networks.includes('ESPN'))))).map(station=>({day,station})));
 const rows=[],diagnostics=[];let successfulPages=0;
 // Four workers bound parallel requests; fetch only dates that actually contain games.
 await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{
  while(jobs.length){const {day,station}=jobs.pop();
   try{const url=`https://www.tvpassport.com/tv-listings/stations/${station.path}/${day}`;
    let response=await fetcher(url,{headers:{Accept:'text/html','User-Agent':'BoulderHuddle/1.0','Accept-Language':'en-US,en;q=0.9'},signal:AbortSignal.timeout(12000)});
    let html=response.ok?await response.text():'';let via='direct';
    if(!/data-listdatetime=/i.test(html)){
     // Fetch rendered HTML, not model-generated text. The same strict date/team parser applies.
     response=await fetcher('https://r.jina.ai/'+url,{headers:{'x-respond-with':'html','x-no-cache':'true'},signal:AbortSignal.timeout(25000)});
     html=response.ok?await response.text():'';via='reader';
    }
    if(html.length>2000000)continue;
    const parsed=parseListings(html,station,day);rows.push(...parsed);if(parsed.length)successfulPages++;diagnostics.push({call:station.call,day,status:response.status,parsed:parsed.length,via});
   }catch(e){diagnostics.push({call:station.call,day,error:e.name});}
  }
 }));
 return {rows,successfulPages,diagnostics,checkedAt:new Date().toISOString()};
}
