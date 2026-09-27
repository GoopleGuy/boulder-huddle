import {localDate, normalizeScoreboard} from './core.js';

const HOSTS = ['site.web.api.espn.com', 'site.api.espn.com'];
const DAY = 86400000;

async function fetchDay(day, fetcher) {
  const failures = [];
  for (const host of HOSTS) {
    const url = `https://${host}/apis/site/v2/sports/football/nfl/scoreboard?dates=${day.replaceAll('-', '')}&limit=100`;
    try {
      const response = await fetcher(url, {
        headers: {Accept: 'application/json'},
        signal: AbortSignal.timeout(15000)
      });
      const body = await response.text();
      const excerpt = body.replace(/\s+/g, ' ').slice(0, 240);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${excerpt}`);
      let raw;
      try { raw = JSON.parse(body); }
      catch { throw new Error(`Invalid JSON (HTTP ${response.status}): ${excerpt}`); }
      if (!Array.isArray(raw.events)) throw new Error(`Missing events array (HTTP ${response.status}): ${excerpt}`);
      const games = normalizeScoreboard(raw);
      if (games.length !== raw.events.length || games.some(game => !game.id)) {
        throw new Error(`Malformed schedule events (HTTP ${response.status})`);
      }
      return games;
    } catch (error) {
      failures.push(`${url}: ${error.message}`);
    }
  }
  throw new Error(`Schedule source unavailable for ${day}. ${failures.join(' | ')}`);
}

export async function fetchSchedule(range, fetcher = fetch) {
  const start = Date.parse(`${range.start}T00:00:00Z`);
  const end = Date.parse(`${range.end}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 6 * DAY ||
      new Date(start).toISOString().slice(0, 10) !== range.start ||
      new Date(end).toISOString().slice(0, 10) !== range.end) {
    throw new Error('Invalid schedule date range');
  }
  // Query one extra day, then use Mountain dates to keep late Monday kickoffs
  // and exclude the next slate regardless of the provider's date boundary.
  const days = [];
  for (let date = start; date <= end + DAY; date += DAY) days.push(new Date(date).toISOString().slice(0, 10));
  const results = new Array(days.length);
  let next = 0;
  await Promise.all(Array.from({length: Math.min(3, days.length)}, async () => {
    while (next < days.length) {
      const index = next++;
      results[index] = await fetchDay(days[index], fetcher);
    }
  }));
  const games = new Map();
  for (const game of results.flat()) {
    const day = localDate(game.date);
    if (day >= range.start && day <= range.end) games.set(game.id, game);
  }
  return [...games.values()].sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || String(a.id).localeCompare(String(b.id)));
}
