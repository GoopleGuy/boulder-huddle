import test from 'node:test';
import assert from 'node:assert/strict';
import {pwaEnvironment,notificationHelp,notificationPermissionHelp,getPushSubscription,installInstructions} from '../src/pwa.js';

const browser={isSecureContext:true,PushManager:class{},Notification:class{},matchMedia:()=>({matches:false})};
const device={userAgent:'Android',platform:'Linux armv8l',maxTouchPoints:5,serviceWorker:{}};
const iphone={...device,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',platform:'iPhone'};

test('current Android and desktop browsers use capability detection, without an install requirement',()=>{
 for(const navigator of [device,{...device,userAgent:'Firefox',platform:'Linux',maxTouchPoints:0}]){
  const environment=pwaEnvironment(browser,navigator);
  assert.equal(environment.supported,true);assert.equal(notificationHelp(environment),'');
 }
});
test('iPhone browser tab without push gets Home Screen instructions, not Android-only advice',()=>{
 const environment=pwaEnvironment({isSecureContext:true},iphone);
 assert.equal(environment.ios,true);assert.equal(environment.supported,false);
 assert.match(notificationHelp(environment),/Home Screen/);assert.match(notificationHelp(environment),/16\.4/);
 assert.doesNotMatch(notificationHelp(environment),/Chrome|Android/);
});
test('desktop-style iPad user agents still receive iPad instructions',()=>{
 const environment=pwaEnvironment({isSecureContext:true},{...iphone,userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X)',platform:'MacIntel',maxTouchPoints:5});
 assert.equal(environment.ios,true);assert.match(notificationHelp(environment),/iPhone or iPad/);
 assert.equal(pwaEnvironment(browser,{...device,platform:'MacIntel',maxTouchPoints:0,userAgent:'Macintosh'}).ios,false);
});
test('installed iPhone supports standard web push, with either standalone detection',()=>{
 const legacy=pwaEnvironment(browser,{...iphone,standalone:true});
 const modern=pwaEnvironment({...browser,matchMedia:query=>({matches:query==='(display-mode: standalone)'})},iphone);
 for(const environment of [legacy,modern]){
  assert.equal(environment.installed,true);assert.equal(environment.supported,true);assert.equal(notificationHelp(environment),'');
 }
});
test('old or unsupported installed iOS shows requirements and a calendar alternative',()=>{
 const environment=pwaEnvironment({isSecureContext:true},{...iphone,standalone:true});
 assert.equal(environment.supported,false);assert.match(notificationHelp(environment),/16\.4/);assert.match(notificationHelp(environment),/Calendar/);
});
test('missing capabilities and insecure contexts cannot enable notifications',()=>{
 for(const missing of ['PushManager','Notification']){
  const incomplete={...browser};delete incomplete[missing];
  const environment=pwaEnvironment(incomplete,device);
  assert.equal(environment.supported,false);assert.match(notificationHelp(environment),/Calendar/);
 }
 assert.equal(pwaEnvironment(browser,{}).supported,false);
 const insecure=pwaEnvironment({...browser,isSecureContext:false},iphone);
 assert.equal(insecure.supported,false);assert.match(notificationHelp(insecure),/HTTPS/);
 assert.equal(pwaEnvironment(undefined,undefined).supported,false);
});
test('denied and dismissed notification prompts have distinct platform-aware advice',()=>{
 assert.match(notificationPermissionHelp({ios:true},'denied'),/Settings → Notifications → Huddle/);
 assert.match(notificationPermissionHelp({ios:false},'denied'),/browser’s site settings/);
 assert.doesNotMatch(notificationPermissionHelp({ios:true},'default'),/blocked/);
});
test('subscription reads safely handle Safari tabs and missing service workers',async()=>{
 assert.equal(await getPushSubscription(null),null);
 assert.equal(await getPushSubscription({}),null);
 assert.equal(await getPushSubscription({pushManager:{}}),null);
 const sub={endpoint:'https://example.test/push'};
 assert.equal(await getPushSubscription({pushManager:{getSubscription:async()=>sub}}),sub);
 await assert.rejects(getPushSubscription({pushManager:{getSubscription:async()=>{throw new Error('Unavailable');}}}),/Unavailable/);
});
test('manual install instructions cover both platforms without promising push parity',()=>{
 const html=installInstructions();
 for(const text of ['iPhone or iPad','Android','Safari','Share','Add to Home Screen','Open as Web App','Chrome','Install and create shortcut','16.4','not a browser tab','Enable notifications','Calendar'])assert.ok(html.includes(text),text);
});
