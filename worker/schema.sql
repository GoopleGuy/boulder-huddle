CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, payload TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS subscriptions (id TEXT PRIMARY KEY, token TEXT NOT NULL, payload TEXT NOT NULL, updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS delivered (subscription_id TEXT NOT NULL, event_key TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(subscription_id,event_key));
CREATE TABLE IF NOT EXISTS fingerprints (subscription_id TEXT NOT NULL, game_id TEXT NOT NULL, fingerprint TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(subscription_id,game_id));
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
