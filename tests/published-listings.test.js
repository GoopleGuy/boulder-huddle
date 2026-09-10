import test from 'node:test';
import assert from 'node:assert/strict';
import {selectPublishedListings} from '../worker/published-listings.js';
const now=Date.parse('2026-09-10T00:00Z');
const make=age=>({schema:1,slates:[{signature:'abc',checkedAt:new Date(now-age).toISOString(),rows:[{call:'KCNC',network:'CBS',day:'2026-09-13',minute:660,teams:['Buffalo Bills','Houston Texans'],url:'https://www.tvpassport.com/tv-listings/stations/cbs-kcnc-denver-co/1566/2026-09-13'}]}]});
test('published data preserves its original retrieval time',()=>{const result=selectPublishedListings(make(3600000),'abc',now);assert.equal(result.rows.length,1);assert.equal(result.checkedAt,new Date(now-3600000).toISOString());});
test('expired, future and changed-schedule data cannot certify channels',()=>{assert.equal(selectPublishedListings(make(7200000),'abc',now),null);assert.equal(selectPublishedListings(make(-1),'abc',now),null);assert.equal(selectPublishedListings(make(0),'different',now),null);});
test('malformed source rows are discarded',()=>{const feed=make(0);feed.slates[0].rows[0].url='javascript:bad';assert.equal(selectPublishedListings(feed,'abc',now).rows.length,0);});
