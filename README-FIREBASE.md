# Firebase Setup Guide

Detailed setup for running this app against Firebase (Firestore + Functions + Hosting). The main [README.md](README.md) covers day-to-day dev, deploy, and review flow — this doc is the one-time onboarding when standing up a new Firebase project or wiring your machine to the existing one.

Current project: `distributed-denial-of-screen` (see `.firebaserc`).

## Prerequisites

- Node.js 20+ (matches the Functions runtime)
- Firebase CLI: `npm install -g firebase-tools`
- Access to the Firebase project (or permission to create your own)

## Standing up a new Firebase project

Skip this section if you're just connecting to the existing `distributed-denial-of-screen` project.

1. Create the project at [Firebase Console](https://console.firebase.google.com/).
2. Enable **Firestore Database** — start in production mode; rules live in `firestore.rules`.
3. Enable **Cloud Functions** (requires the Blaze plan — Firestore Functions won't deploy on Spark).
4. Enable **Hosting**.
5. In Project Settings → Service Accounts → **Generate new private key**. Save the JSON somewhere outside the repo.

## Wiring your machine

1. `firebase login` (interactive) and `firebase use distributed-denial-of-screen`.
2. Point `GOOGLE_APPLICATION_CREDENTIALS` at the service-account JSON, or paste the JSON into `FIREBASE_SERVICE_ACCOUNT_KEY`. See `.env.firebase.example`.
3. Generate a bcrypt admin hash with `node generate-password-hash.js` and set `ADMIN_PASSWORD_HASH` in `.env`. **The servers read the hash, not a plaintext password.**
4. Write `functions/.env` from your root `.env`: `./set-firebase-env.sh`. Firebase Functions reads runtime env from that file at deploy time. (The older `firebase functions:config:set` API is deprecated and no longer works on current CLI versions.)
5. Deploy Firestore rules once so the DB isn't wide open: `npm run deploy:firestore`.

## Running against Firebase

- `npm run start:firebase` — runs `server-firebase.js` locally against **live** Firestore. Fast to iterate; changes hit real data.
- `npm run start:emulator` — Firebase emulators for Functions + Firestore + Hosting. Isolated from prod data.
- Production: `npm run deploy` (or the narrower `deploy:hosting` / `deploy:functions` / `deploy:firestore`).

## Migrating SQLite data

If you have an existing `moviepicker.db` and want to seed Firestore from it:

```bash
npm run migrate
```

Reads `moviepicker.db`, writes to the Firestore project configured in `.env`. **Snapshot Firestore first** if the target isn't empty — the migration doesn't diff, it writes.

## Firestore data model

Four collections, all keyed by auto-generated ids unless noted:

- **movies** — `title`, `poster`, `imdb_id`, `genres[]`, `suggestions[]` (each with `suggester`, `notes`, timestamp), `hidden`, cached poster fields
- **meetings** — `name`, `candidate_dates[]`, `allowed_movie_ids[]`, `voting_closed`, `winner_movie_id`, `winner_date`, `watched_movie_id`
- **ballots** — `meeting_id`, `username`, `ranks[]` (`{movieId, rank}`), `availability[]`
- **reviews** — `movie_id`, `username`, `rating` (0-10), `text`

Indexes are declared in `firestore.indexes.json`; rules in `firestore.rules`. When adding a query that filters + orders on multiple fields, add the composite index or the Firebase Emulator will yell at you.

## Ad-hoc data maintenance

The repo has a set of one-off scripts that talk to Firestore directly with the service account. They are **not** part of the app runtime and are meant to be run manually when data drift needs cleaning up:

| Script | Purpose |
|--------|---------|
| `check-movies.js` | Inventory + duplicate detection by IMDB id |
| `merge-duplicates.js` | Merge movies sharing an IMDB id |
| `fix-all-movies.js` | Backfill missing IMDB ids via TMDB search |
| `hide-all-movies.js` | Mark all movies `hidden: true` (useful before a reset) |
| `cleanup-poster-cache.js` | Strip cached poster blobs from Firestore docs |
| `cache-posters*.js` | Populate the poster cache with different strategies |
| `backfill-metadata.js`, `backfill-by-title.js`, `firebase-backfill-metadata.js`, `migrate-metadata.js`, `production-backfill.js` | One-time metadata backfills |

Run with `node <script>.js`. Most expect `GOOGLE_APPLICATION_CREDENTIALS` or the default service-account JSON at the repo root.

## Troubleshooting

**"Permission denied" on Firestore reads/writes** — you deployed rules but the client isn't authenticated as admin. Server-side scripts authenticate via the service account and bypass rules; browser clients hit the rules directly.

**Admin login fails after deploy** — `functions:config` didn't get the hash. Re-run `./set-firebase-env.sh` then `npm run deploy:functions`. Verify with `firebase functions:config:get`.

**`firebase deploy` complains about the Blaze plan** — Functions require Blaze. Hosting-only deploys work on Spark.

**Emulator ignores your data** — the emulator uses its own local Firestore. Import/export with `firebase emulators:start --import=./emulator-data --export-on-exit`.

**Poster fetch returns 204 / empty** — TMDB rate limit or missing `TMDB_API_KEY`. The poster cache (`GET /api/posters/:movieId`) is populated on suggest; run one of the `cache-posters*.js` scripts to backfill.

---

**Reminder:** never commit `service-account.json`, `distributed-denial-of-screen-firebase-adminsdk-*.json`, or `.env`. They're gitignored — keep it that way.
