import {LOCAL_STATIONS,listingUrl,listingAttributes,validDay} from './listing-sources.js';

const ZONE='America/Denver',TWO_HOURS=2*3600000;
const knownStudio=/^(The NFL Today|FOX NFL Sunday|NFL on FOX Postgame|Football Night in America|Countdown to Kickoff)$/i;
function explicitNonGame(program){
 // Unknown placeholders and generic sports/football entries cannot prove that
 // a station is not carrying a game. Recognized studio shows are not full games.
 const title=program.title.trim().replace(/\s+/g,' ');
 if(program.teams.some(Boolean)||!/[a-z0-9]/i.test(title)||/\b(T[.\s]*B[.\s]*[AD]|unknown|unavailable|pending|to be announced|to be determined|local programming|programming information|sports special|teams? to be|game to be)\b/i.test(title)||/^(sports|live sports|programming|program|schedule|not available|no listings|tv listings|coverage)$/i.test(title))return false;
 return knownStudio.test(title)||!(/\b(NFL|football)\b/i.test(title));
}
export function validProgramPage(page,now=Date.now(),{allowStale=false}={}){
 const station=LOCAL_STATIONS.find(s=>s.call===page?.call);
 const age=now-Date.parse(page?.checkedAt);
 return !!(station&&page.network===station.network&&page.callsign===station.callsign&&page.timeZone===ZONE&&validDay(page.day)&&page.url===listingUrl(station,page.day)&&Number.isFinite(age)&&age>=0&&(allowStale||age<TWO_HOURS)&&Array.isArray(page.programs)&&page.programs.length&&page.programs.every(p=>p&&Number.isInteger(p.minute)&&p.minute>=0&&p.minute<1440&&Number.isInteger(p.duration)&&p.duration>0&&p.duration<=720&&typeof p.title==='string'&&p.title.length>0&&Array.isArray(p.teams)&&p.teams.length===2&&p.teams.every(t=>typeof t==='string')));
}
export function parseProgramPage(html,station,day,checkedAt=new Date(Date.now()).toISOString()){
 if(!LOCAL_STATIONS.some(s=>s.call===station.call&&s.network===station.network&&s.path===station.path&&s.callsign===station.callsign)||!validDay(day)||!/timezone:\s*"America\/Denver"/.test(html))return null;
 const programs=[];
 for(const attrs of listingAttributes(html)){
  const time=attrs['data-listdatetime'];
  if(typeof time!=='string'||!/^\d{4}-\d{2}-\d{2} /.test(time))return null;
  if(!time.startsWith(day+' '))continue;
  // A malformed row on this station/day invalidates the page rather than being
  // silently removed and allowing neighboring programs to cover its interval.
  if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:00$/.test(time)||+time.slice(11,13)>23||+time.slice(14,16)>59||attrs['data-callsign']!==station.callsign||!/^\d+$/.test(attrs['data-duration']||'')||!attrs['data-showname'])return null;
  programs.push({minute:+time.slice(11,13)*60+ +time.slice(14,16),duration:+attrs['data-duration'],title:attrs['data-showname'],teams:[attrs['data-team1']||'',attrs['data-team2']||'']});
 }
 const page={call:station.call,network:station.network,callsign:station.callsign,day,timeZone:ZONE,url:listingUrl(station,day),checkedAt,programs};
 return validProgramPage(page,Date.parse(checkedAt))?page:null;
}
// Require an entire three-hour game window from one fresh station-page snapshot.
// No gaps, conflicting overlaps, NFL games or placeholders; never combine pages
// or timestamps to fill missing coverage. Previously confirmed games are retained
// separately, so old raw pages cannot manufacture new out-of-market evidence.
export function nonGameWindow(page,day,minute,now=Date.now(),{allowStale=false}={}){
 if(!validProgramPage(page,now,{allowStale})||page.day!==day||!Number.isInteger(minute))return null;
 const end=minute+180;
 const programs=page.programs.filter(p=>p.minute<end&&p.minute+p.duration>minute).sort((a,b)=>a.minute-b.minute);
 if(!programs.length||programs.some(p=>!explicitNonGame(p)))return null;
 let covered=minute;
 for(let i=0;i<programs.length;i++){
  const p=programs[i];
  if((i===0?p.minute>minute:p.minute!==covered))return null;
  covered=p.minute+p.duration;
 }
 if(covered<end)return null;
 return {checkedAt:page.checkedAt,title:programs.map(p=>p.title).join('; '),url:page.url,call:page.call,network:page.network,day};
}
