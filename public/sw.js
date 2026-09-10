const VERSION='huddle-v1';
const assets=[]; // BUILD_ASSETS
const root=new URL('./',self.location.href).href;
self.addEventListener('install',event=>{event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll([root,root+'manifest.webmanifest',root+'icon-192.png',root+'icon-512.png',...assets.map(a=>root+a)])));self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('huddle-')&&key!==VERSION)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(root)||url.pathname.endsWith('/config.json'))return;
 if(url.href.startsWith(root+'teams/')){event.respondWith(caches.open(VERSION).then(async cache=>{const saved=await cache.match(event.request);if(saved)return saved;const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response;}));return;}
 event.respondWith((async()=>{const cache=await caches.open(VERSION);try{const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response;}catch(error){const cached=await cache.match(event.request);if(cached)return cached;if(event.request.mode==='navigate'){const shell=await cache.match(root);if(shell)return shell;}throw error;}})());
});
self.addEventListener('push',event=>{let data={title:'Boulder Huddle',body:'Your game-day guide has an update.'};try{data={...data,...event.data.json()};}catch{}event.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:root+'icon-192.png',badge:root+'icon-192.png',tag:data.tag||'huddle-update',data:{url:root},renotify:false}));});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});const current=clients.find(c=>c.url.startsWith(root));if(current)return current.focus();return self.clients.openWindow(root);})());});
