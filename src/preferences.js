export const TEAMS = {
 AFC: {BAL:'Baltimore Ravens',BUF:'Buffalo Bills',CIN:'Cincinnati Bengals',CLE:'Cleveland Browns',DEN:'Denver Broncos',HOU:'Houston Texans',IND:'Indianapolis Colts',JAX:'Jacksonville Jaguars',KC:'Kansas City Chiefs',LAC:'Los Angeles Chargers',LV:'Las Vegas Raiders',MIA:'Miami Dolphins',NE:'New England Patriots',NYJ:'New York Jets',PIT:'Pittsburgh Steelers',TEN:'Tennessee Titans'},
 NFC: {ARI:'Arizona Cardinals',ATL:'Atlanta Falcons',CAR:'Carolina Panthers',CHI:'Chicago Bears',DAL:'Dallas Cowboys',DET:'Detroit Lions',GB:'Green Bay Packers',LAR:'Los Angeles Rams',MIN:'Minnesota Vikings',NO:'New Orleans Saints',NYG:'New York Giants',PHI:'Philadelphia Eagles',SEA:'Seattle Seahawks',SF:'San Francisco 49ers',TB:'Tampa Bay Buccaneers',WSH:'Washington Commanders'}
};
export function normalizeFavorites(value={}) {return {AFC:Object.hasOwn(TEAMS.AFC,value?.AFC)?value.AFC:'DEN',NFC:Object.hasOwn(TEAMS.NFC,value?.NFC)?value.NFC:''};}
export function favoriteTeams(game,favorites) {return Object.values(normalizeFavorites(favorites)).filter(t=>t&&(game.away.abbr===t||game.home.abbr===t));}
export const SERVICE_GROUPS = [
 {title:'Antenna & streaming',items:{ota:'OTA antenna',prime:'Amazon Prime Video',netflix:'Netflix',nfl:'NFL+',redzone:'NFL+ Premium · RedZone',peacock:'Peacock Premium / Premium Plus',paramount:'Paramount+',foxone:'FOX One',espn:'ESPN Unlimited',espnplus:'ESPN Select / ESPN+',ticket:'NFL Sunday Ticket',youtube:'YouTube · event streams',twitch:'Twitch · event streams',tubi:'Tubi · event streams'}},
 {title:'Live TV providers',items:{youtubetv:'YouTube TV',hulu:'Hulu + Live TV',fubo:'Fubo',directv:'DIRECTV',sling:'Sling TV',other:'Other cable / satellite / live TV'}},
 {title:'Channels included in your live TV plan',note:'Check the channels your selected provider actually carries. Local games still follow Denver assignments. Sunday Ticket and RedZone are separate add-ons.',items:{tv_cbs:'CBS · KCNC 4.1',tv_fox:'FOX · KDVR 31.1',tv_nbc:'NBC · KUSA 9.1',tv_abc:'ABC · KMGH 7.1',tv_espn:'ESPN / ESPN2',tv_nfl:'NFL Network',tv_redzone:'NFL RedZone add-on'}}
];
export const SERVICE_LABELS=Object.assign({},...SERVICE_GROUPS.map(g=>g.items));
export const PROVIDERS=['youtubetv','hulu','fubo','directv','sling','other'];
