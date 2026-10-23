import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {pwaEnvironment,notificationHelp,notificationPermissionHelp,getPushSubscription,installInstructions} from '../src/pwa.js';

// Exercise the actual dialog handlers with a small DOM/network boundary, without
// registering a real device, requesting OS permissions or sending subscriptions.
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const handlers=source.slice(source.indexOf('async function reminders()'),source.indexOf("window.addEventListener('appinstalled'"));
function harness(overrides={}){
 const events=[],dialogs=[],toasts=[],elements=new Map([['#dialog',{open:false}]]);
 const context={
  pwaEnvironment:()=>({ios:false,installed:false,secure:true,supported:true}),notificationHelp,notificationPermissionHelp,getPushSubscription,installInstructions,
  registration:{pushManager:{getSubscription:async()=>null}},api:'https://guide.example.test',saved:[],services:{},dialogVersion:0,installPrompt:null,
  Notification:{permission:'default',requestPermission:async()=>{events.push('permission');return 'granted';}},
  json:async(url,options)=>{events.push([url,options]);return {publicKey:'AQ'};},
  read:()=> 'existing-device-token',write:()=>{},crypto:{randomUUID:()=> 'test'},atob:value=>Buffer.from(value,'base64').toString('binary'),Uint8Array,
  icon:()=>'',esc:value=>String(value),toast:message=>toasts.push(message),settings:()=>{context.dialogVersion++;dialogs.push({title:'Settings'});},
  $:selector=>elements.get(selector)||null,
  modal(title,body){
   context.dialogVersion++;dialogs.push({title,body});
   for(const [id,element] of elements)if(id!=='#dialog')element.isConnected=false;
   for(const id of ['enable-alerts','disable-alerts','reminder-settings','reminder-install'])elements.delete('#'+id);
   for(const match of body.matchAll(/<button[^>]*id="([^"]+)"([^>]*)>/g))elements.set('#'+match[1],{disabled:match[2].includes('disabled'),isConnected:true});
   elements.get('#dialog').open=true;
  },
  ...overrides,
 };
 vm.createContext(context);vm.runInContext(handlers,context);
 return {context,dialogs,toasts,events,elements};
}

test('iOS browser-tab reminder dialog opens safely with install help and a disabled push button',async()=>{
 const h=harness({registration:{},pwaEnvironment:()=>({ios:true,installed:false,secure:true,supported:false})});
 await h.context.reminders();
 assert.match(h.dialogs[0].body,/Home Screen/);
 assert.equal(h.elements.get('#enable-alerts').disabled,true);
 assert.ok(h.elements.get('#reminder-install'));
 await h.elements.get('#reminder-install').onclick();
 assert.equal(h.dialogs.at(-1).title,'Install Huddle');
 assert.match(h.dialogs.at(-1).body,/iPhone or iPad/);assert.match(h.dialogs.at(-1).body,/Android/);
 await h.context.syncSubscription();assert.equal(h.events.length,0);
});
test('missing guide service or service-worker registration leaves setup visible but cannot subscribe',async()=>{
 for(const overrides of [{api:''},{registration:null}]){
  const h=harness(overrides);await h.context.reminders();
  assert.equal(h.elements.get('#enable-alerts').disabled,true);
  assert.match(h.dialogs[0].body,/Settings|getting ready/);
 }
});
test('subscription read failures show recovery guidance instead of rejecting the dialog',async()=>{
 const h=harness({registration:{pushManager:{getSubscription:async()=>{throw new Error('unavailable');}}}});
 await h.context.reminders();assert.match(h.dialogs[0].body,/Could not check/);assert.equal(h.elements.get('#enable-alerts').disabled,true);
});
test('a late subscription check does not overwrite newer navigation or a closed dialog',async()=>{
 for(const action of ['settings','close']){
  let finish;const h=harness({registration:{pushManager:{getSubscription:()=>new Promise(resolve=>{finish=resolve;})}}});
  const pending=h.context.reminders();
  if(action==='settings')h.context.settings();else h.context.dialogVersion++;
  finish(null);await pending;
  assert.equal(h.dialogs.some(d=>d.title==='Game reminders'),false);
 }
});
test('permission dismissal and denial never contact the push service and allow another attempt',async()=>{
 for(const permission of ['default','denied']){
  const h=harness({pwaEnvironment:()=>({ios:true,installed:true,secure:true,supported:true}),Notification:{permission,requestPermission:async()=>permission}});
  await h.context.reminders();const button=h.elements.get('#enable-alerts');await button.onclick();
  assert.equal(h.events.length,0);assert.equal(button.disabled,false);
  assert.match(h.toasts[0],permission==='denied'?/Settings → Notifications → Huddle/:/not enabled/);
 }
});
test('supported push requests permission on the tap before network work and preserves sync',async()=>{
 const sub={endpoint:'https://web.push.apple.com/example',toJSON:()=>({endpoint:'https://web.push.apple.com/example'})};
 const h=harness();let current=null;
 h.context.registration.pushManager={getSubscription:async()=>current,subscribe:async()=>{h.events.push('subscribe');current=sub;return sub;}};
 await h.context.reminders();await h.elements.get('#enable-alerts').onclick();
 assert.equal(h.events[0],'permission');assert.equal(h.events[1][0],'https://guide.example.test/push-config');
 assert.equal(h.events[2],'subscribe');assert.equal(h.events[3][0],'https://guide.example.test/subscription');
 assert.equal(h.events[3][1].method,'POST');assert.match(h.toasts[0],/Notifications enabled/);
});
test('finishing an enable action does not reopen a dialog the user closed',async()=>{
 let finish;const h=harness({Notification:{permission:'default',requestPermission:()=>new Promise(resolve=>{finish=resolve;})}});
 h.context.registration.pushManager.subscribe=async()=>({toJSON:()=>({})});
 await h.context.reminders();const button=h.elements.get('#enable-alerts');const pending=button.onclick();
 assert.equal(button.disabled,true);h.elements.get('#dialog').open=false;h.context.dialogVersion++;
 finish('granted');await pending;assert.equal(h.dialogs.length,1);assert.equal(h.elements.get('#dialog').open,false);
});
test('unsubscribing retains server deletion and device-unsubscribe behavior',async()=>{
 let active=true;const h=harness();
 const sub={endpoint:'https://web.push.apple.com/example',unsubscribe:async()=>{active=false;}};
 h.context.registration.pushManager.getSubscription=async()=>active?sub:null;
 await h.context.reminders();await h.elements.get('#disable-alerts').onclick();
 assert.equal(h.events[0][0],'https://guide.example.test/subscription');assert.equal(h.events[0][1].method,'DELETE');assert.equal(active,false);
});
test('native install prompt is consumed once; manual and installed states are useful',async()=>{
 let prompts=0;const h=harness({installPrompt:{prompt:async()=>{prompts++;}}});
 await h.context.install();assert.equal(prompts,1);assert.equal(h.context.installPrompt,null);
 await h.context.install();assert.equal(h.dialogs.at(-1).title,'Install Huddle');
 h.context.pwaEnvironment=()=>({installed:true});await h.context.install();assert.equal(h.dialogs.at(-1).title,'Huddle is installed');assert.equal(prompts,1);
});
