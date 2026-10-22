import {confirmedVerification,evidenceKey,freshVerification,safeUrl,unavailableGame} from './core.js';

const confirmationFields=['local','station','mobile','requiredService','notes','sources','verifiedAt','verificationKey'];
function savedConfirmation(game,now){
 if(!game)return null;
 // Migrate previously saved, source-backed guides without inventing a check time.
 const candidate={...game,verificationKey:game.verificationKey||evidenceKey(game)};
 return (['yes','no'].includes(game.local)||game.mobile===true)&&(game.sources||[]).some(s=>safeUrl(s.url)&&typeof s.title==='string')&&confirmedVerification(candidate,now)?candidate:null;
}
export function retainConfirmedGames(games,previous=[],now=Date.now()){
 const saved=new Map(previous.map(g=>[g.id,g]));
 return games.map(game=>{
  if(game.timeTbd||unavailableGame(game))return {...game,local:'unknown',station:null,mobile:false,verifiedAt:null,verificationKey:null,sources:[]};
  const prior=savedConfirmation(saved.get(game.id),now);
  if(!prior||evidenceKey(prior)!==evidenceKey(game))return game;
  const incoming=savedConfirmation(game,now);
  if(incoming&&Date.parse(incoming.verifiedAt)>=Date.parse(prior.verifiedAt))return incoming;
  return {...game,...Object.fromEntries(confirmationFields.map(key=>[key,prior[key]]))};
 });
}
export function savedGuide(previous,reason){
 return {...previous,games:retainConfirmedGames(previous.games,previous.games),scheduleState:'saved',verificationMessage:reason+' Showing the last saved schedule and last-confirmed assignments; they are not newly verified.'};
}
export function reconcileGuide(result,previous,now=Date.now()){
 if(!Array.isArray(result?.games)||result.games.some(g=>!g.id||!Number.isFinite(Date.parse(g.date))||!Array.isArray(g.networks)||!g.away?.name||!g.home?.name))throw new Error('Invalid guide');
 // An empty response alone is not positive evidence that every game was canceled.
 if(!result.games.length&&previous?.games?.length)return savedGuide(previous,'The schedule feed returned no games.');
 return {...result,games:retainConfirmedGames(result.games,previous?.games,now)};
}
export function confirmationSummary(games,now=Date.now()){
 const confirmed=games.filter(g=>confirmedVerification(g,now));
 const retained=confirmed.filter(g=>!freshVerification(g,now));
 return {confirmed:confirmed.length,retained:retained.length,lastConfirmedAt:confirmed.length?confirmed.map(g=>g.verifiedAt).sort((a,b)=>Date.parse(a)-Date.parse(b))[0]:null};
}
