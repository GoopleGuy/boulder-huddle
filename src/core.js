import {SERVICE_LABELS,PROVIDERS} from './preferences.js';
export const ZONE = 'America/Denver';
export const STATIONS = {CBS: 'KCNC · 4.1', FOX: 'KDVR · 31.1', NBC: 'KUSA · 9.1', ABC: 'KMGH · 7.1'};
export const DEFAULT_SERVICES = {...Object.fromEntries(Object.keys(SERVICE_LABELS).map(k=>[k,false])),ota:true, prime:true, netflix:true, nfl:true, redzone:true};
export function localDate(date) {return new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));}
export function mountain(date, options={}) {return new Intl.DateTimeFormat('en-US',{timeZone:ZONE,...options}).format(new Date(date));}
export function kickoff(game) {return game.timeTbd ? 'Time TBD' : mountain(game.date,{hour:'numeric',minute:'2-digit'});}
export function slateRange(now=new Date(),offset=0) {
  const d=new Date(localDate(now)+'T12:00:00Z');
  d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+5)%7)+offset*7); // Tuesday through Monday, including unusual Wednesday games.
  const end=new Date(d); end.setUTCDate(d.getUTCDate()+6);
  return {start:d.toISOString().slice(0,10),end:end.toISOString().slice(0,10)};
}
export function normalizeScoreboard(data) {
  return (data.events||[]).map(e=>{
    const c=e.competitions?.[0]; if(!c) return null;
    const team=side=>{const t=c.competitors.find(x=>x.homeAway===side)?.team;return t?{name:t.displayName,short:t.name,abbr:t.abbreviation,logo:t.logo,color:t.color}:null;};
    if(!team('home')||!team('away')||!Number.isFinite(Date.parse(e.date))) return null;
    return {id:e.id,date:e.date,away:team('away'),home:team('home'),networks:[...new Set((c.broadcasts||[]).flatMap(b=>b.names||[]))],state:e.status?.type?.state||'pre',status:e.status?.type?.shortDetail||'',timeTbd:c.timeValid===false,venue:c.venue?.fullName||'',neutral:!!c.neutralSite,week:e.week?.number||data.week?.number,season:e.season?.year,seasonType:e.season?.type,local:'unknown',sources:[],verifiedAt:null};
  }).filter(Boolean).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
}
export function isSundayAfternoon(g) {const hour=+mountain(g.date,{hour:'2-digit',hourCycle:'h23'});return mountain(g.date,{weekday:'short'})==='Sun' && hour>=11 && hour<17 && g.seasonType===2 && g.networks.some(n=>/^(CBS|FOX)$/i.test(n));}
export function freshVerification(g,now=Date.now()) {return !!g.verifiedAt && now-Date.parse(g.verifiedAt)<2*3600e3 && now>=Date.parse(g.verifiedAt);}
export function access(g,services=DEFAULT_SERVICES,now=Date.now()) {
  const fresh=freshVerification(g,now),nets=g.networks.map(x=>x.toLowerCase());
  const has=s=>nets.some(n=>n===s||n.includes(s));
  const sunday=isSundayAfternoon(g),station=fresh&&g.local==='yes'?g.station:null;
  // NFL+ includes verified local regular-season/postseason games on mobile.
  // RedZone coverage alone never establishes full-game mobile eligibility.
  const mobile=!!((services.nfl||services.redzone)&&fresh&&(g.mobile===true||(station&&[2,3].includes(g.seasonType))));
  const providers=PROVIDERS.filter(k=>services[k]);
  const options=[];
  const add=(id,kind,label,detail)=>options.push({id,kind,label,detail});
  const full=(id,label)=>add(id,'full',label,'Full game · TV / streaming');
  if(station&&services.ota)full('ota',station+' with your antenna');
  if(services.prime&&(has('prime video')||has('amazon')))full('prime','Prime Video');
  if(services.netflix&&has('netflix'))full('netflix','Netflix');
  if((services.nfl||services.redzone)&&has('nfl network'))full('nfl-network','NFL Network through NFL+');
  if(services.ticket&&sunday&&fresh&&g.local==='no')full('ticket','NFL Sunday Ticket');
  if(services.peacock&&(has('peacock')||has('nbc')))full('peacock','Peacock');
  if(services.paramount&&((station&&has('cbs'))||has('paramount')))full('paramount','Paramount+');
  if(services.foxone&&station&&has('fox'))full('foxone','FOX One');
  if(services.espn&&nets.some(n=>['espn','espn2','abc','espn+','espn unlimited','nfl network'].includes(n)))full('espn','ESPN Unlimited');
  if(services.espnplus&&has('espn+'))full('espnplus','ESPN Select / ESPN+');
  if(services.youtube&&nets.includes('youtube'))full('youtube','YouTube');
  if(services.twitch&&has('twitch'))full('twitch','Twitch');
  if(services.tubi&&has('tubi'))full('tubi','Tubi');
  for(const provider of providers){
    if((station&&['cbs','fox','nbc','abc'].some(n=>services['tv_'+n]&&nets.includes(n)))||
       (services.tv_espn&&nets.some(n=>['espn','espn2'].includes(n)))||(services.tv_nfl&&has('nfl network'))){
      full(provider,SERVICE_LABELS[provider]+(station?' · '+station:''));
    }
  }
  const hasFull=options.length>0;
  if(mobile)add('nfl-mobile','mobile','NFL+ on your phone or tablet','Full game · phone/tablet only; no TV casting');
  if(sunday){
    if(services.redzone)add('nfl-redzone','redzone','NFL RedZone through NFL+ Premium','Live look-ins · not the full game');
    if(services.tv_redzone)for(const provider of providers)add(provider+'-redzone','redzone','NFL RedZone through '+SERVICE_LABELS[provider],'Live look-ins · not the full game');
  }
  const rz=options.some(o=>o.kind==='redzone');
  const result=(kind,label,line,detail)=>({kind,label,line:options.length?options.map(o=>o.label).join(' · '):line,detail,mobile,redzone:rz,station,options});
  if(hasFull)return result('full','Full game','','Full-game options are listed separately from mobile-only access and RedZone look-ins.'+(fresh?'':' Broadcaster listed by schedule feed; rights verification pending.'));
  if(mobile)return result('mobile','Mobile / tablet','','Full game on mobile only; no TV casting. '+(g.requiredService?`For TV: ${g.requiredService} (not in your services).`:'No full-game TV option confirmed with your services.')+(rz?' RedZone also offers live look-ins.':''));
  if(rz)return result(fresh&&g.local==='no'?'redzone':'pending',fresh&&g.local==='no'?'RedZone only':'Local TV unconfirmed','',fresh&&g.local==='no'?'No full local broadcast with your services. RedZone shows live look-ins, not the full game. Sunday Ticket is needed for the full out-of-market game.':'Full local broadcast is not confirmed. RedZone offers look-ins only; check the Denver assignment before planning to watch.');
  const required=g.requiredService||g.networks.join(' / ')||'Broadcaster TBD';
  return result(fresh?'extra':'pending',fresh?'Extra service':'Access unconfirmed',fresh?required:'Verify local broadcast & streaming rights',fresh?`No confirmed full-game access with your services. ${required} is needed; check its eligible plan.`:'NFL+ mobile eligibility and any Denver simulcast are still unconfirmed. Open the sources for the latest listing.');
}
export function safeUrl(url) {try {const u=new URL(url);return u.protocol==='https:'?u.href:null;}catch{return null;}}
export function mergeVerification(games,report,now=Date.now()) {
  if(!report||!Array.isArray(report.games))return games;
  return games.map(g=>{
    const v=report.games.find(v=>v.id===g.id&&v.date===g.date);
    if(!v||!['yes','no','unknown'].includes(v.local)||!Number.isFinite(Date.parse(report.checkedAt))||now-Date.parse(report.checkedAt)>2*3600e3||Date.parse(report.checkedAt)>now)return g;
    const sources=(v.sources||[]).filter(s=>safeUrl(s.url)&&typeof s.title==='string');
    if(!sources.length)return g;
    const station=typeof v.station==='string'&&v.station.length<100?v.station:null;
    return {...g,local:v.local==='yes'&&!station?'unknown':v.local,station,mobile:v.mobile===true,requiredService:typeof v.requiredService==='string'?v.requiredService.slice(0,200):null,notes:typeof v.notes==='string'?v.notes.slice(0,500):'',sources,verifiedAt:report.checkedAt};
  });
}
export function calendar(g,how) {
  const esc=s=>String(s).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  const stamp=d=>new Date(d).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z');
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Boulder Huddle//NFL Guide//EN','BEGIN:VEVENT',`UID:${g.id}@boulder-huddle`,`DTSTAMP:${stamp(Date.now())}`,`DTSTART:${stamp(g.date)}`,`DTEND:${stamp(Date.parse(g.date)+3*3600e3)}`,`SUMMARY:${esc(g.away.name+' at '+g.home.name)}`,`DESCRIPTION:${esc('How you can watch: '+(how.options?.length?how.options.map(o=>o.label+' ('+o.detail+')').join('; '):how.line)+'. '+how.detail+' Schedule may flex. Recheck Boulder Huddle before kickoff.')}`,'BEGIN:VALARM','TRIGGER:-PT15M','ACTION:DISPLAY','DESCRIPTION:NFL kickoff in 15 minutes','END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n');
}
