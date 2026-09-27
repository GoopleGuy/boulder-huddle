# Boulder Huddle

[Live app](https://boulder-huddle-service.draft-room-pro.workers.dev/) — an installable NFL guide for Boulder, Colorado. GitHub Pages can host the static frontend using the included workflow.

## No paid data API or OpenAI key

GitHub Actions checks public Denver TV listings approximately every 30 minutes and commits data/listings.json. The Cloudflare companion service matches those listings to the current ESPN schedule. It checks team names, Denver station callsigns, dates and kickoff windows, including up to 30 minutes of pregame coverage. A conflicting schedule invalidates the report. Evidence older than two hours cannot confirm access.

Sources are TV Passport's dated listings for KCNC (CBS 4.1), KDVR (FOX 31.1), KUSA (NBC 9.1), and KMGH (ABC 7.1). Direct HTML is preferred; the public Jina Reader HTML service is a fallback. No model generates the channel data. If a current-slate fetch fails, the workflow fails and retains the previous results and original timestamp.

GitHub's standard hosted runners are free for public repositories. Schedules are best-effort and may be delayed. GitHub can disable schedules after 60 days without repository activity; timestamped data commits normally provide ongoing activity. Cloudflare hosting and push delivery remain subject to its account limits.

## What the key-free method verifies

The updater identifies full local OTA broadcasts and competing regional Sunday assignments. ESPN supplies kickoff and broadcaster/service listings. The app distinguishes full-game access, RedZone look-ins, mobile/tablet access and unconfirmed access for your selected services.

It does not independently interpret every changing streaming entitlement or NFL+ exception. Unverified mobile/exclusive rights remain pending with links to official sources. NFL+ replays are not live access; RedZone is not a full out-of-market game. Check the official listing before kickoff.

## Run locally

Use Node.js 22.12 or newer. Run npm ci, npm test, npm run build, and npm run preview. Run node scripts/update-listings.js to check current and next-week channel listings; that script needs no packages or private keys.

## GitHub deployment

Use Settings → Pages → GitHub Actions. The pages.yml workflow builds and publishes on pushes to main. Relative assets and service worker scope support repository subpaths. public/config.json selects the deployed companion service.

The refresh-listings.yml workflow runs at minutes 17 and 47 of every hour using only GitHub's built-in repository token. It publishes public listing data without user API secrets. It can also be run manually from Actions. Its data-only commits do not trigger Pages builds; the Worker reads the raw JSON directly.

## Android reminders

Open the HTTPS app in Chrome, choose Install app or Add to Home screen, save games with the bell buttons, and enable Game reminders. The Worker checks every five minutes and sends reminders during the 15 minutes before kickoff. Android battery settings and push providers can delay delivery. Turn off reminders to remove the server subscription.

Calendar exports include an independent 15-minute alarm. They are snapshots and do not follow flex scheduling. Offline mode displays the last loaded guide with a saved-data label.

## Companion service

For another Cloudflare account, run npx wrangler login, create a D1 database and update wrangler.toml with its ID, allowed origins and public feed URL. Initialize the database with npx wrangler d1 execute boulder-huddle --remote --file worker/schema.sql. Generate keys with npm run keys and save them using wrangler secret put VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY. Never commit the private key. Build, then run npm run worker:deploy. No OpenAI key is used.

The service stores push subscriptions, hashed management tokens, saved event IDs, preferences and delivery records. Abandoned subscriptions expire after 90 days. This personal service caps subscriptions at 100 devices and validates origins, request sizes and push endpoints. Fonts optionally load from Google Fonts; logos use the schedule feed's URLs.

## Viewing methods

Each game lists every eligible method from the selected services, including multiple TV/streaming providers, NFL+ phone/tablet access, and RedZone look-ins. The main badge and filters summarize the game; they do not limit the list to one method. Details, favorites, calendar exports and reminder summaries use the same access calculation.

NFL+ and NFL+ Premium include verified local regular-season/postseason games on phones and tablets, without TV casting, following [NFL's live-game policy](https://support.nfl.com/hc/en-us/articles/35869738454164-What-NFL-games-are-available-LIVE-with-NFL). A fresh matched local station listing supports this eligibility; stale or unknown local assignments and RedZone coverage alone do not. Explicit verified mobile evidence remains supported for other games. Primetime/exclusive exceptions are not newly inferred from network names. RedZone remains labeled as look-ins, not a full game.

## Schedule fetching

The updater, Worker and standalone browser guide share `src/schedule.js`. It requests individual ESPN scoreboard dates with at most three requests in flight, using the web API first and the alternate host on failure. A boundary day is included before filtering by America/Denver kickoff date; event IDs are deduplicated and sorted consistently for feed signatures. Every required date must succeed with a valid events array. Failures include the endpoint, date, HTTP status when available and a short response excerpt.

The updater writes both slates to a temporary file and renames it only after both have completed and current-slate listing verification has passed. A failed refresh preserves the prior file and timestamp. Run `npm test`, `npm run build`, then `node scripts/update-listings.js` to validate a correction. Deploy the Worker separately with `npm run worker:deploy` after Cloudflare authentication; the GitHub Pages workflow does not deploy the Worker.

## Refresh resilience

The Worker refreshes the published feed every five minutes, with the configured raw GitHub URL as a fallback and a one-minute retry after failures. It retains the last valid feed and positive listing evidence for each matching schedule. A temporary source failure or empty scrape does not overwrite still-valid evidence. Original `checkedAt` timestamps remain unchanged, and the existing two-hour limit and exact schedule signature still apply. Guide caches cannot outlive their evidence; unconfirmed results are retried after one minute.

## Validation and limitations

Tests cover Mountain Time/daylight saving, regional access, stale evidence, exact station matching, pregame windows, published-feed expiry, push endpoint validation, reminder timing and calendar exports. Physical Android delivery must be checked on the user's device. Data providers can block requests or change their page format; source failures remain visible and are not treated as verified access.
