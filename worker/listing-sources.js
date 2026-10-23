export const LOCAL_STATIONS=[
 {network:'CBS',call:'KCNC',callsign:'KCNC-TV',path:'cbs-kcnc-denver-co/1566'},
 {network:'FOX',call:'KDVR',callsign:'KDVR-HD',path:'fox-kdvr-denver-co-hd/6401'},
 {network:'NBC',call:'KUSA',callsign:'KUSA',path:'nbc-kusa-denver-co/1569'},
 {network:'ABC',call:'KMGH',callsign:'KMGH-HD',path:'abc-kmgh-denver-co-hd/5723'}
];
export const listingUrl=(station,day)=>`https://www.tvpassport.com/tv-listings/stations/${station.path}/${day}`;
export const validDay=day=>/^\d{4}-\d{2}-\d{2}$/.test(day||'')&&Number.isFinite(Date.parse(day+'T12:00Z'))&&new Date(day+'T12:00Z').toISOString().slice(0,10)===day;
export const decode=s=>s.replace(/&nbsp;/gi,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&#x([a-f0-9]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
export function listingAttributes(html){
 return [...html.matchAll(/<div\b[^>]*\bdata-(?:listDateTime|showName|callsign)="[^"]*"[^>]*>/gi)].map(match=>Object.fromEntries([...match[0].matchAll(/\b(data-[\w-]+)="([^"]*)"/g)].map(m=>[m[1].toLowerCase(),decode(m[2])])));
}
