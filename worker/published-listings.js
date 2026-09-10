export function selectPublishedListings(feed,signature,now=Date.now()){
 if(feed?.schema!==1||!Array.isArray(feed.slates))return null;
 const slate=feed.slates.find(s=>s.signature===signature);
 if(!slate||!Array.isArray(slate.rows)||!Number.isFinite(Date.parse(slate.checkedAt)))return null;
 const age=now-Date.parse(slate.checkedAt);
 if(age<0||age>=2*3600000)return null;
 const rows=slate.rows.filter(r=>['KCNC','KDVR','KUSA','KMGH'].includes(r.call)&&['CBS','FOX','NBC','ABC'].includes(r.network)&&/^\d{4}-\d{2}-\d{2}$/.test(r.day)&&Number.isInteger(r.minute)&&r.minute>=0&&r.minute<1440&&Array.isArray(r.teams)&&r.teams.length===2&&r.teams.every(t=>typeof t==='string')&&typeof r.url==='string'&&r.url.startsWith('https://www.tvpassport.com/tv-listings/stations/'));
 return {...slate,rows,bootstrap:false};
}
