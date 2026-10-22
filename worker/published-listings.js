export function selectPublishedListings(feed,signature,now=Date.now(),{allowStale=false}={}){
 if(feed?.schema!==1||!Array.isArray(feed.slates))return null;
 const slate=feed.slates.find(s=>s.signature===signature);
 if(!slate||!Array.isArray(slate.rows)||!Number.isFinite(Date.parse(slate.checkedAt)))return null;
 const age=now-Date.parse(slate.checkedAt);
 if(age<0||(!allowStale&&age>=2*3600000))return null;
 const rows=slate.rows.filter(r=>(!r.checkedAt||(Number.isFinite(Date.parse(r.checkedAt))&&Date.parse(r.checkedAt)<=now&&(allowStale||now-Date.parse(r.checkedAt)<2*3600000)))&&['KCNC','KDVR','KUSA','KMGH'].includes(r.call)&&['CBS','FOX','NBC','ABC'].includes(r.network)&&/^\d{4}-\d{2}-\d{2}$/.test(r.day)&&Number.isInteger(r.minute)&&r.minute>=0&&r.minute<1440&&Array.isArray(r.teams)&&r.teams.length===2&&r.teams.every(t=>typeof t==='string')&&typeof r.url==='string'&&r.url.startsWith('https://www.tvpassport.com/tv-listings/stations/'));
 return {...slate,rows,bootstrap:false};
}

// Merge by station/window, not whole-feed freshness: independently checked games
// can have different timestamps, and partial scrapes must not roll another back.
export function mergeListingEvidence(...reports){
 const candidates=reports.filter(Boolean).flatMap((report,index)=>report.rows.map(row=>({row:{...row,checkedAt:row.checkedAt||report.checkedAt},index})));
 candidates.sort((a,b)=>Date.parse(b.row.checkedAt)-Date.parse(a.row.checkedAt)||b.index-a.index);
 const rows=[];
 for(const {row} of candidates){
  if(!rows.some(newer=>newer.call===row.call&&newer.day===row.day&&Math.abs(newer.minute-row.minute)<=35))rows.push(row);
 }
 return rows.length?{rows,checkedAt:rows.map(row=>row.checkedAt).sort((a,b)=>Date.parse(a)-Date.parse(b))[0]}:null;
}
