import test from 'node:test';
import assert from 'node:assert/strict';
import {selectPublishedListings} from '../worker/published-listings.js';
const now=Date.parse('2026-09-10T00:00Z');
const make=age=>({schema:1,slates:[{signature:'abc',checkedAt:new Date(now-age).toISOString(),rows:[{call:'KCNC',network:'CBS',day:'2026-09-13',minute:660,teams:['Buffalo Bills','Houston Texans'],url:'https://www.tvpassport.com/tv-listings/stations/cbs-kcnc-denver-co/1566/2026-09-13'}]}]});
test('published data preserves its original retrieval time',()=>{const result=selectPublishedListings(make(3600000),'abc',now);assert.equal(result.rows.length,1);assert.equal(result.checkedAt,new Date(now-3600000).toISOString());});
test('expired, future and changed-schedule data cannot certify channels',()=>{assert.equal(selectPublishedListings(make(7200000),'abc',now),null);assert.equal(selectPublishedListings(make(-1),'abc',now),null);assert.equal(selectPublishedListings(make(0),'different',now),null);});
test('malformed source rows are discarded',()=>{const feed=make(0);feed.slates[0].rows[0].url='javascript:bad';assert.equal(selectPublishedListings(feed,'abc',now).rows.length,0);});
test('explicit retained mode accepts old exact-schedule evidence but rejects future and unsafe rows',()=>{
 const feed=make(3*86400000);
 const result=selectPublishedListings(feed,'abc',now,{allowStale:true});assert.equal(result.checkedAt,feed.slates[0].checkedAt);assert.equal(result.rows.length,1);
 assert.equal(selectPublishedListings(feed,'changed',now,{allowStale:true}),null);
 assert.equal(selectPublishedListings(make(-1),'abc',now,{allowStale:true}),null);
 for(const change of [{checkedAt:new Date(now+1).toISOString()},{checkedAt:'bad'},{url:'javascript:bad'}]){
  const bad=make(3*86400000);Object.assign(bad.slates[0].rows[0],change);assert.equal(selectPublishedListings(bad,'abc',now,{allowStale:true}).rows.length,0);
 }
});
test('fresh-only selection does not accept an individually retained stale row',()=>{
 const feed=make(0);feed.slates[0].rows[0].checkedAt=new Date(now-3*86400000).toISOString();
 assert.equal(selectPublishedListings(feed,'abc',now).rows.length,0);
 assert.equal(selectPublishedListings(feed,'abc',now,{allowStale:true}).rows.length,1);
});

test('mixed-time reports and a partial direct scrape merge each station/window independently',async()=>{
 const {mergeListingEvidence}=await import('../worker/published-listings.js');
 const a={...make(0).slates[0].rows[0],checkedAt:'2026-09-09T10:00Z'};
 const b={...a,call:'KUSA',network:'NBC',checkedAt:'2026-09-09T08:00Z'};
 const cached={checkedAt:b.checkedAt,rows:[a,b]};
 const incoming={checkedAt:b.checkedAt,rows:[{...a,checkedAt:b.checkedAt},{...b,checkedAt:'2026-09-09T09:00Z',teams:['New Home','New Away']}]};
 let merged=mergeListingEvidence(cached,incoming);
 assert.equal(merged.rows.find(r=>r.call==='KCNC').checkedAt,a.checkedAt);
 assert.deepEqual(merged.rows.find(r=>r.call==='KUSA').teams,['New Home','New Away']);
 merged=mergeListingEvidence(merged,{checkedAt:'2026-09-09T11:00Z',rows:[{...a,checkedAt:'2026-09-09T11:00Z'}]});
 assert.equal(merged.rows.length,2);assert.equal(merged.rows.find(r=>r.call==='KUSA').checkedAt,'2026-09-09T09:00Z');
 assert.equal(merged.checkedAt,'2026-09-09T09:00Z');
});
