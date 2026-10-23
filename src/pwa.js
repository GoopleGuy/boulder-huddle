// Detect capabilities for behavior; use device hints only to explain the right setup steps.
export function pwaEnvironment(browser=globalThis.window,device=globalThis.navigator){
 const ios=/iPad|iPhone|iPod/.test(device?.userAgent||'')||(/Mac/.test(device?.platform||'')&&device?.maxTouchPoints>1);
 const installed=Boolean(device?.standalone||browser?.matchMedia?.('(display-mode: standalone)').matches);
 const secure=Boolean(browser?.isSecureContext);
 const supported=Boolean(secure&&device&&'serviceWorker'in device&&browser&&'PushManager'in browser&&'Notification'in browser);
 return {ios,installed,secure,supported};
}

export function notificationHelp(environment){
 if(!environment.secure)return 'Open Huddle over HTTPS to enable notifications. Calendar reminders are still available.';
 if(environment.supported)return '';
 if(environment.ios&&!environment.installed)return 'On iPhone or iPad, add Huddle to your Home Screen, then open it from that icon to enable notifications. Requires iOS or iPadOS 16.4 or later.';
 if(environment.ios)return 'Notifications require iOS or iPadOS 16.4 or later and a Home Screen web app. Check your software version, or use Calendar reminders.';
 return 'This browser does not support background notifications. Try a current browser with web push support, such as Chrome on Android, or use Calendar reminders.';
}

export function notificationPermissionHelp(environment,permission){
 if(permission!=='denied')return 'Notifications were not enabled. Tap Enable notifications again when you are ready.';
 return environment.ios
  ? 'Notifications are blocked. On your iPhone or iPad, open Settings → Notifications → Huddle (or the name you chose), allow notifications, then return here.'
  : 'Notifications are blocked. Allow them for Huddle in your browser’s site settings, and check your device’s notification settings.';
}

export async function getPushSubscription(registration){
 return registration?.pushManager?.getSubscription?registration.pushManager.getSubscription():null;
}

export function installInstructions(){
 return `<h3>iPhone or iPad</h3><p>Open Huddle in Safari. Tap <strong>Share</strong> (you may need to open the page menu first), then <strong>Add to Home Screen</strong>. If shown, leave <strong>Open as Web App</strong> on, then tap <strong>Add</strong>.</p><h3>Android</h3><p>Open Huddle in Chrome. Tap the <strong>three-dot menu</strong>, then <strong>Install and create shortcut → Install</strong>. Some versions call this <strong>Install app</strong> or <strong>Add to Home screen</strong>; follow the install prompt.</p><p class="muted">Open Huddle from its new icon, save a game, then choose <strong>Game reminders → Enable notifications</strong> and allow the prompt. On iPhone and iPad, notifications require iOS or iPadOS 16.4 or later and must be enabled from the Home Screen app, not a browser tab.</p><p class="fine">Background alerts need an HTTPS connection and the live guide service connected in Settings. Calendar reminders work without push notifications. Offline mode shows your last loaded schedule with a saved-data label.</p>`;
}
