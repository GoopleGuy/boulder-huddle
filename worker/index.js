import {buildPushPayload} from '@block65/webcrypto-web-push';
import {normalizeScoreboard,mergeVerification,slateRange,access,kickoff,DEFAULT_SERVICES} from '../src/core.js';
import {fetchLocalListings,localReport} from './local-listings.js';
import {selectPublishedListings} from './published-listings.js';
const FIVE=300000,HOUR=3600000;
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('');
async function getCache(env,key){const row=await env.DB.prepare('SELECT payload, expires FROM cache WHERE key=?').bind(key).first();return row&&row.expires>Date.now()?JSON.parse(row.payload):null;}
async function putCache(env,key,value,ttl){await env.DB.prepare('INSERT INTO cache(key,payload,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,expires=excluded.expires').bind(key,JSON.stringify(value),Date.now()+ttl).run();}
async function lock(env,key,ttl){const r=await env.DB.prepare("INSERT INTO cache(key,payload,expires) VALUES(?,'null',?) ON CONFLICT(key) DO UPDATE SET expires=excluded.expires WHERE cache.expires<?").bind(key,Date.now()+ttl,Date.now()).run();return r.meta.changes===1;}
export function validStart(start){if(!/^\d{4}-\d{2}-\d{2}$/.test(start||''))return false;const d=new Date(start+'T12:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===start&&Math.abs(+d-Date.now())<220*86400000;}
export async function getGuide(env,start,fetcher=fetch){
 const key='guide-keyless:'+start,cached=await getCache(env,key);if(cached)return cached;
 const end=new Date(start+'T12:00Z');end.setUTCDate(end.getUTCDate()+6);
 const dates=`${start.replaceAll('-','')}-${end.toISOString().slice(0,10).replaceAll('-','')}`;
 const options={headers:{'Accept':'application/json','User-Agent':'BoulderHuddle/1.0'},signal:AbortSignal.timeout(15000)};
 let response=await fetcher(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${dates}&limit=100`,options);
 if(!response.ok)response=await fetcher(`https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${dates}&limit=100`,{...options,signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Schedule provider unavailable ('+response.status+')');const raw=await response.json();if(!Array.isArray(raw.events))throw new Error('Invalid schedule response');
 let games=normalizeScoreboard(raw),verificationMessage='';
 const signature=await hash(JSON.stringify(games.map(g=>[g.id,g.date,g.networks])));
 let listings=null;
 if(env.LISTINGS_URL){try{
  let feed=await getCache(env,'published-listings');
  if(!feed){const feedUrl=new URL(env.LISTINGS_URL);feedUrl.searchParams.set('refresh',String(Math.floor(Date.now()/FIVE)));const r=await fetcher(feedUrl.href,{headers:{Accept:'application/vnd.github.raw+json','User-Agent':'BoulderHuddle/1.0'},signal:AbortSignal.timeout(15000)});if(r.ok){feed=await r.json();await putCache(env,'published-listings',feed,FIVE);}}
  listings=selectPublishedListings(feed,signature);
 }catch{}}
 const listingKey='keyless-local:'+signature;
 if(!listings)listings=await getCache(env,listingKey);
 if(!listings){listings=await fetchLocalListings(games,fetcher);await putCache(env,listingKey,listings,30*60000);}
 const local=localReport(games,listings.rows,listings.checkedAt);
 games=mergeVerification(games,local);
 const localCount=local.games.length;
 if(localCount)verificationMessage=`Denver channel assignments checked for ${localCount} games. Listings refresh about every 30 minutes; results older than two hours become unconfirmed. NFL+ mobile and unusual streaming rights require the linked official listings.`;
 else if(!verificationMessage)verificationMessage='Denver station listings are not yet available for this slate. Unconfirmed assignments remain pending.';
 const result={games,checkedAt:new Date().toISOString(),verificationMessage};await putCache(env,key,result,FIVE);return result;
}
export function validateSubscription(s){
 try{const u=new URL(s.endpoint);if(u.protocol!=='https:'||u.username||u.password||u.port)return false;
 const android=u.hostname==='fcm.googleapis.com'&&/^\/(fcm|wp)\//.test(u.pathname);
 const firefox=u.hostname==='updates.push.services.mozilla.com'&&u.pathname.startsWith('/wpush/');
 const apple=u.hostname==='web.push.apple.com'&&u.pathname.startsWith('/');
 if(!(android||firefox||apple)||s.endpoint.length>4096)return false;
 const decode=v=>Uint8Array.from(atob(v.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 return typeof s.keys?.p256dh==='string'&&typeof s.keys?.auth==='string'&&decode(s.keys.p256dh).length===65&&decode(s.keys.auth).length===16;
 }catch{return false;}
}
async function readBody(request){const reader=request.body?.getReader();if(!reader)throw new Error('Body required');const chunks=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();throw new Error('Body too large');}chunks.push(value);}const bytes=new Uint8Array(size);let off=0;for(const c of chunks){bytes.set(c,off);off+=c.length;}return JSON.parse(new TextDecoder().decode(bytes));}
async function push(env,sub,message){const payload=await buildPushPayload({data:JSON.stringify(message),options:{ttl:900}},sub,{subject:env.VAPID_SUBJECT,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY});return fetch(sub.endpoint,{...payload,redirect:'error',signal:AbortSignal.timeout(15000)});}
async function rateLimit(env,request){const slot=Math.floor(Date.now()/HOUR),key=await hash((request.headers.get('CF-Connecting-IP')||'local')+':'+slot);const result=await env.DB.prepare('INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,Date.now()+HOUR).first();return result.count<=60;}
export default {
 async fetch(request,env,ctx){
  const origin=request.headers.get('Origin');const allowed=[env.APP_ORIGIN,...(env.ADDITIONAL_ORIGINS||'').split(',').filter(Boolean)];const cors={'Access-Control-Allow-Origin':origin&&allowed.includes(origin)?origin:env.APP_ORIGIN,'Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Vary':'Origin','Cache-Control':'no-store'};const respond=(body,status=200)=>Response.json(body,{status,headers:cors});
  if(origin&&!allowed.includes(origin))return respond({error:'Origin not allowed'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  const url=new URL(request.url);
  try{
   if(url.pathname==='/guide'&&request.method==='GET'){const start=url.searchParams.get('start')||slateRange().start;if(!validStart(start))return respond({error:'Invalid date range'},400);return respond(await getGuide(env,start));}
   if(url.pathname==='/push-config'&&request.method==='GET'){if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)return respond({error:'Push is not configured'},503);return respond({publicKey:env.VAPID_PUBLIC_KEY});}
   if(url.pathname==='/subscription'&&['POST','DELETE'].includes(request.method)){
    if(!origin||!allowed.includes(origin))return respond({error:'Origin required'},403);
    if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)return respond({error:'Push is not configured'},503);
    const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');if(!token||token.length<40||token.length>150)return respond({error:'Device token required'},401);
    if(!(await rateLimit(env,request)))return respond({error:'Too many requests'},429);
    let body;try{body=await readBody(request);}catch{return respond({error:'Invalid request body'},400);}
    const endpoint=body.subscription?.endpoint||body.endpoint;if(typeof endpoint!=='string')return respond({error:'Missing endpoint'},400);
    const id=await hash(endpoint),tokenHash=await hash(token);const previous=await env.DB.prepare('SELECT token FROM subscriptions WHERE id=?').bind(id).first();
    if(previous&&previous.token!==tokenHash)return respond({error:'Device token mismatch'},403);
    if(request.method==='DELETE'){await env.DB.batch([env.DB.prepare('DELETE FROM subscriptions WHERE id=?').bind(id),env.DB.prepare('DELETE FROM fingerprints WHERE subscription_id=?').bind(id),env.DB.prepare('DELETE FROM delivered WHERE subscription_id=?').bind(id)]);return respond({ok:true});}
    if(!validateSubscription(body.subscription)||!Array.isArray(body.saved)||body.saved.length>100||body.saved.some(x=>typeof x!=='string'||!/^\d{1,20}$/.test(x)))return respond({error:'Invalid subscription'},400);
    if(!previous){const count=await env.DB.prepare('SELECT COUNT(*) AS count FROM subscriptions').first();if(count.count>=100)return respond({error:'Personal service device limit reached'},429);}
    const services=Object.fromEntries(Object.keys(DEFAULT_SERVICES).map(k=>[k,body.services?.[k]===true]));
    await env.DB.prepare('INSERT INTO subscriptions(id,token,payload,updated) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated=excluded.updated').bind(id,tokenHash,JSON.stringify({subscription:body.subscription,saved:body.saved,services}),Date.now()).run();
    return respond({ok:true});
   }
   if(env.ASSETS&&request.method==='GET')return env.ASSETS.fetch(request);
   return respond({error:'Not found'},404);
  }catch(error){console.error('Huddle request failed:',error.message);return respond({error:'Service unavailable. Please try again.'},503);}
 },
 async scheduled(controller,env,ctx){ctx.waitUntil(runReminders(env));}
};
export function reminderDue(game,now){const delta=Date.parse(game.date)-now;return !game.timeTbd&&game.state!=='post'&&delta>0&&delta<=15*60000;}
export async function runReminders(env){
 const now=Date.now();if(!(await lock(env,'cron-lock',4*60000)))return;
 await env.DB.batch([env.DB.prepare('DELETE FROM delivered WHERE created<?').bind(now-14*86400000),env.DB.prepare('DELETE FROM fingerprints WHERE updated<?').bind(now-14*86400000),env.DB.prepare('DELETE FROM cache WHERE expires<?').bind(now-HOUR),env.DB.prepare('DELETE FROM rate_limits WHERE expires<?').bind(now),env.DB.prepare('DELETE FROM subscriptions WHERE updated<?').bind(now-90*86400000)]);
 // Refresh the current week's schedule even without open browser sessions.
 let guide;try{guide=await getGuide(env,slateRange().start);}catch(error){console.error('Scheduled refresh failed:',error.message);return;}
 if(!env.VAPID_PRIVATE_KEY||!env.VAPID_PUBLIC_KEY)return;
 const {results}=await env.DB.prepare('SELECT id,payload FROM subscriptions').all();
 for(const row of results){const data=JSON.parse(row.payload);if(!validateSubscription(data.subscription))continue;
  for(const game of guide.games.filter(g=>data.saved.includes(g.id)&&g.state!=='post')){
   const a=access(game,data.services),fingerprint=JSON.stringify([game.date,game.networks,a.line,a.kind]);
   const old=await env.DB.prepare('SELECT fingerprint FROM fingerprints WHERE subscription_id=? AND game_id=?').bind(row.id,game.id).first();
   const changed=old&&old.fingerprint!==fingerprint;
   const due=reminderDue(game,now);const key=due?`kickoff:${game.id}:${game.date}`:changed?`change:${game.id}:${await hash(fingerprint)}`:null;
   let delivered=true;
   if(key){const claim=await env.DB.prepare('INSERT OR IGNORE INTO delivered(subscription_id,event_key,created) VALUES(?,?,?)').bind(row.id,key,now).run();if(claim.meta.changes){
     try{const response=await push(env,data.subscription,{title:due?`${game.away.abbr} at ${game.home.abbr} · ${kickoff(game)} MT`:'Your saved game has an update',body:`${game.away.short} at ${game.home.short}. ${a.line}. ${a.kind==='redzone'||a.kind==='pending'?'Full local broadcast not confirmed; RedZone is look-ins only.':''}`,tag:key});
      if(response.status===404||response.status===410){await env.DB.prepare('DELETE FROM subscriptions WHERE id=?').bind(row.id).run();break;}
      if(!response.ok)throw new Error('Push service unavailable');
     }catch{delivered=false;await env.DB.prepare('DELETE FROM delivered WHERE subscription_id=? AND event_key=?').bind(row.id,key).run();}
   }}
   if(delivered)await env.DB.prepare('INSERT INTO fingerprints(subscription_id,game_id,fingerprint,updated) VALUES(?,?,?,?) ON CONFLICT(subscription_id,game_id) DO UPDATE SET fingerprint=excluded.fingerprint,updated=excluded.updated').bind(row.id,game.id,fingerprint,now).run();
  }
 }
}

