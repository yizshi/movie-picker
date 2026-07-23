# 🎬 Distruibued Denail of Screentime

A comprehensive movie suggestion and ranked voting app for groups to decide what to watch together. Features meeting management, secure admin controls, automatic poster fetching, and flexible deployment options.

## ✨ Features

### 🎭 Core Functionality
- **Movie Browsing**: Browse all suggested movies with search, filtering, and sorting options
- **Movie Suggestions**: Add movies with IMDB links to automatically fetch posters and genres
- **Ranked Voting**: Users vote with up to 3 ranked choices using Borda scoring (1st=3pts, 2nd=2pts, 3rd=1pt)
- **Meeting Management**: Create meetings with candidate dates and movie restrictions
- **Automatic Winner Selection**: When voting closes, top movie and most popular date are selected
- **Movie Reviews**: Rate and review watched movies (0-10 scale)

### 🔐 Security & Admin
- **Secure Admin Authentication**: bcrypt password hashing with token-based sessions
- **Admin Controls**: Delete movies, manage meetings, set watched movies
- **Environment Protection**: Comprehensive security for sensitive credentials

### 🎨 User Experience  
- **Smart Navigation**: Context-aware navigation that only shows relevant options
- **Advanced Search & Filtering**: Filter movies by title, genre, suggester with multiple sort options
- **TMDB Integration**: Automatic movie poster and genre fetching from IMDB links
- **Responsive Design**: Works on desktop and mobile devices
- **Real-time Results**: Live voting results and meeting status

### 🚀 Deployment Options
- **Local SQLite**: Quick setup for development and small groups
- **Firebase Cloud**: Scalable cloud deployment with Firestore and Functions
- **Hybrid Support**: Seamless migration between deployment types

## 🛠️ Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### 1. Clone and Install
```bash
git clone https://github.com/yizshi/movie-picker.git
cd movie-picker
npm install
```

### 2. Environment Setup
```bash
cp .env.example .env
# Edit .env with your configuration (see Configuration section)
```

### 3. Choose Your Deployment

#### Option A: Local SQLite (Recommended for development)
```bash
npm run start:sqlite
```

#### Option B: Local with Firebase
```bash
npm run start:firebase
```

#### Option C: Deploy to Firebase
```bash
npm run deploy
```

Open http://localhost:3000 in your browser.

## ⚙️ Configuration

### Environment Variables

Create a `.env` file with the following variables:

```bash
# Admin Authentication (REQUIRED)
# Use generate-password-hash.js to create a secure hash
ADMIN_PASSWORD_HASH="$2b$12$your_secure_hash_here"

# TMDB API for movie posters (Optional but recommended)
TMDB_API_KEY="your_tmdb_bearer_token"

# Firebase Configuration (Required for Firebase deployment)
GOOGLE_APPLICATION_CREDENTIALS="./path-to-service-account.json"
FIREBASE_PROJECT_ID="your-firebase-project-id"
```

### Generate Secure Admin Password
```bash
node generate-password-hash.js
# Follow the prompts and add the hash to your .env file
```

### TMDB API Setup
1. Create account at [TMDB](https://www.themoviedb.org/)
2. Go to Settings → API
3. Copy your API Read Access Token (Bearer token)
4. Add to `.env` as `TMDB_API_KEY`

## 🔧 Development

### Architecture at a glance

The app has three interchangeable backends that all expose the same `/api/*` surface:

| Backend | Entry point | Data store | Used for |
|---------|-------------|------------|----------|
| SQLite server | `server.js` | `moviepicker.db` | Fast local dev, offline |
| Local Firebase server | `server-firebase.js` | Firestore (live) | Testing against real cloud data |
| Cloud Functions | `functions/index.js` | Firestore (live) | Production (behind Firebase Hosting rewrites) |

`public/` is a static frontend served by all three. `firebase.json` rewrites `/api/**` to the `api` Cloud Function; everything else falls back to `index.html`.

### Available scripts

| Command | Description |
|---------|-------------|
| `npm start` / `npm run start:sqlite` | Local SQLite server on :3000 |
| `npm run start:firebase` | Local server backed by live Firestore |
| `npm run start:emulator` | Firebase emulators (functions + firestore + hosting) |
| `npm run deploy` | Deploy hosting + functions + firestore |
| `npm run deploy:hosting` | Hosting only (static frontend) |
| `npm run deploy:functions` | Functions only (API) |
| `npm run deploy:firestore` | Firestore rules + indexes only |
| `npm run migrate` | One-shot migrate SQLite → Firestore |
| `npm test` / `test:watch` / `test:coverage` | Root Jest suite |
| `cd functions && npm test` | Functions Jest suite |

### Day-to-day dev loop

1. `cp .env.example .env` (or `.env.firebase.example` for the Firebase server) and fill in values. Note: the servers read `ADMIN_PASSWORD_HASH`, not `ADMIN_PASSWORD` — generate one with `node generate-password-hash.js`.
2. Pick a backend:
   - Frontend-only or logic changes → `npm run start:sqlite` (fastest).
   - Anything touching Firestore shape, indexes, or Functions-specific code → `npm run start:firebase` or `npm run start:emulator`.
3. Edit files. `public/` is served statically, so a browser refresh picks up frontend changes without restarting the server. Server / Functions edits require a restart.
4. Before pushing: `npm test && (cd functions && npm test)`.

### Project structure

```
movie-picker/
├── public/                    # Static frontend (served by all backends)
│   ├── index.html             # Home
│   ├── movies.html            # Browse all movies
│   ├── suggest.html           # Add a movie
│   ├── meetings.html          # List meetings
│   ├── vote.html              # Cast a ballot
│   ├── results.html           # Live results
│   ├── watched.html / watched-list.html  # Watched history + reviews
│   ├── admin-movies.html      # Admin: manage movies
│   ├── admin-meetings.html    # Admin: manage meetings
│   ├── admin-meeting-details.html  # Admin: single meeting drill-in
│   ├── debug.html             # Debug tools
│   ├── app.js                 # Shared frontend JS
│   └── styles.css
├── functions/                 # Firebase Cloud Functions (deployed API)
│   ├── index.js               # All /api/* routes
│   └── tests/                 # Functions Jest suite
├── server.js                  # Local SQLite server
├── server-firebase.js         # Local server, live Firestore
├── tests/                     # Root Jest suite (auth, api, voting, frontend, nav)
├── .github/workflows/ci-cd.yml
├── firebase.json              # Hosting rewrites + functions + firestore config
├── firestore.rules / firestore.indexes.json
├── migrate-to-firebase.js     # SQLite → Firestore migration
├── generate-password-hash.js  # bcrypt hash generator
├── set-firebase-env.sh        # Push local env → functions:config
└── *.js (utility scripts, see below)
```

### One-off utility scripts

These are ad-hoc admin scripts that talk directly to Firestore using the service-account key. Run with `node <script>.js`. They are **not** part of the app runtime.

| Script | Purpose |
|--------|---------|
| `check-movies.js` | Dump all movies + duplicate detection by IMDB id |
| `merge-duplicates.js` | Merge movies that share an IMDB id |
| `fix-all-movies.js` | Backfill missing IMDB ids via TMDB search |
| `hide-all-movies.js` | Set `hidden: true` on every movie |
| `cleanup-poster-cache.js` | Strip cached poster blobs from Firestore |
| `cache-posters*.js` | Various poster-caching strategies |
| `backfill-*.js` / `migrate-metadata.js` | One-time metadata backfills |

Prefer creating a new script over adding admin-only endpoints for one-off maintenance.

## 🚀 Deployment

### Firebase project

- Project id: `distributed-denial-of-screen` (see `.firebaserc`).
- Runtime: Node.js 20 for Functions.
- Hosting rewrites `/api/**` → `api` function; everything else → `index.html`.

### First-time setup

```bash
npm install -g firebase-tools
firebase login
firebase use distributed-denial-of-screen
./set-firebase-env.sh   # pushes ADMIN_PASSWORD_HASH + TMDB_API_KEY into functions:config
```

### Deploying

Most changes touch either the frontend or the API, not both:

```bash
npm run deploy:hosting     # public/ only — fast, safe
npm run deploy:functions   # functions/ only — restarts the API
npm run deploy:firestore   # rules/indexes only
npm run deploy             # everything (use sparingly)
```

Prefer the narrowest deploy that covers your change. A hosting deploy is near-instant; a functions deploy takes a couple of minutes and briefly warms cold starts.

### Automated deploys (CI/CD)

`.github/workflows/ci-cd.yml` does:

1. **On every push and PR**: install deps, run root tests, run `functions/` tests, upload coverage.
2. **On push to `main` (after tests pass)**: install firebase-tools, write the service-account key from `FIREBASE_SERVICE_ACCOUNT_KEY`, push `functions:config`, then `firebase deploy`.

Required GitHub secrets (see [GITHUB_SECRETS_SETUP.md](GITHUB_SECRETS_SETUP.md)):
- `ADMIN_PASSWORD_HASH` — bcrypt hash from `generate-password-hash.js`
- `TMDB_API_KEY` — TMDB v4 bearer token
- `FIREBASE_SERVICE_ACCOUNT_KEY` — full JSON of the service account
- `FIREBASE_PROJECT_ID` — `distributed-denial-of-screen`
- `FIREBASE_TOKEN` — CI deploy token from `firebase login:ci`

### Migration from SQLite to Firebase

```bash
# Point .env at the target Firebase project
npm run migrate
```

Backs up nothing — snapshot Firestore first if the target isn't empty.

## 👀 Code review

### Pull request flow

1. Branch off `main`.
2. Keep PRs small and focused. If a change touches the frontend, functions, and firestore rules together, call that out in the description.
3. Push — CI runs both test suites automatically. A green build is required before merge.
4. Merging to `main` auto-deploys. There is no staging environment, so treat main as production.

### What reviewers should check

- **API surface parity**: any new route added to `functions/index.js` should also exist in `server.js` and `server-firebase.js` if it's meant to be usable locally, and vice versa. Divergence between the three backends is the most common source of bugs.
- **Firestore shape changes**: new fields or collections should be reflected in `firestore.rules`, `firestore.indexes.json` (if queried), and any relevant migration script.
- **Auth**: admin-only routes must go through `requireAdmin`. Never trust `req.body.isAdmin` or similar.
- **Secrets**: no keys in commits. `.env`, `service-account.json`, and `distributed-denial-of-screen-firebase-adminsdk-*.json` are gitignored — verify with `git status` before pushing.
- **Frontend/API contract**: `public/app.js` is the single client. If you change response shape, grep for the field in `public/` before merging.
- **Tests**: prefer adding a test to `tests/` (or `functions/tests/`) over manual verification. Voting/scoring logic in particular has a dedicated `voting.test.js`.

### Local pre-flight

```bash
npm test
(cd functions && npm test)
npm run start:sqlite     # smoke-test the change against SQLite
npm run start:firebase   # then against live Firestore if the change touches it
```

### Reviewing a PR locally

```bash
gh pr checkout <number>
npm ci && (cd functions && npm ci)
npm test
npm run start:firebase   # or :sqlite
```

## 📖 API Documentation

### Public endpoints
- `GET /api/movies` — list movies
- `POST /api/movies` — suggest a movie (IMDB link auto-fetches poster + genres)
- `GET /api/meetings` — list meetings with vote counts
- `GET /api/meetings/:id` — meeting details
- `POST /api/votes` — submit ranked ballot + availability
- `GET /api/votes` — list ballots (optionally filtered by meeting)
- `GET /api/results` — computed results (optionally filtered by meeting)
- `GET /api/movies/:id/reviews` — reviews for a movie
- `POST /api/movies/:id/reviews` — add a review (0-10)
- `GET /api/posters/:movieId` — cached poster image proxy

### Admin endpoints (require authentication)
- `POST /api/admin/login` / `POST /api/admin/logout` / `GET /api/admin/me`
- `DELETE /api/movies/:id` — delete
- `PATCH /api/movies/:id/visibility` — hide/unhide
- `POST /api/movies/hide-all` — bulk-hide every currently visible movie
- `POST /api/meetings` / `PATCH /api/meetings/:id` / `DELETE /api/meetings/:id`
- `POST /api/meetings/:id/watched` — record the watched movie
- `DELETE /api/votes/:id` — remove a ballot
- `DELETE /api/reviews/:id` — remove a review

### Request Examples

#### Add Movie
```bash
curl -X POST http://localhost:3000/api/movies \
  -H "Content-Type: application/json" \
  -d '{
    "title": "The Matrix",
    "poster": "https://www.imdb.com/title/tt0133093/",
    "suggester": "Alice",
    "notes": "Classic sci-fi!"
  }'
```

#### Submit Vote
```bash
curl -X POST http://localhost:3000/api/votes \
  -H "Content-Type: application/json" \
  -d '{
    "username": "Bob",
    "meetingId": "meeting123",
    "ranks": [
      {"movieId": "1", "rank": 1},
      {"movieId": "2", "rank": 2}
    ],
    "availability": ["2024-01-15", "2024-01-16"]
  }'
```

## 🔒 Security Features

- **bcrypt Password Hashing**: Admin passwords use industry-standard hashing
- **Token-based Authentication**: Secure admin sessions with expiration
- **Environment Protection**: Sensitive credentials never exposed in code
- **Firebase Security Rules**: Proper database access controls
- **Input Validation**: All API endpoints validate inputs

## 🧪 Testing

### Test Coverage

The project includes comprehensive test suites covering:

- **Authentication Tests**: bcrypt password hashing and verification
- **API Tests**: All endpoints with various scenarios and edge cases  
- **Voting Logic Tests**: Borda scoring and date selection algorithms
- **Integration Tests**: Full request/response cycles with test database

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run Firebase Functions tests
cd functions && npm test
```

### Test Structure

```
tests/
├── setup.js           # Test configuration and mocks
├── auth.test.js        # Password hashing and authentication
├── api.test.js         # API endpoint integration tests
└── voting.test.js      # Voting algorithm unit tests
```

### Writing New Tests

Tests use Jest and Supertest. Example:

```javascript
test('should create movie with valid IMDB link', async () => {
  const response = await request(app)
    .post('/api/movies')
    .send({
      title: 'Test Movie',
      poster: 'https://www.imdb.com/title/tt0133093/',
      suggester: 'Test User'
    })
    .expect(200);

  expect(response.body.title).toBe('Test Movie');
});
```

## 🎯 Usage Guide

### For Administrators

1. **Login**: Use admin interface at `/admin-movies.html`
2. **Manage Movies**: Add/delete movies, view all suggestions
3. **Create Meetings**: Set up voting periods with date options
4. **Control Voting**: Open/close voting, set allowed movies
5. **View Results**: See real-time voting results and declare winners

### For Users

1. **Suggest Movies**: Add movies via IMDB links for auto-poster fetching
2. **Join Meetings**: Vote on available movies with ranked preferences
3. **Set Availability**: Indicate which dates work for you
4. **View Results**: See current standings and meeting details
5. **Review Movies**: Rate movies after watching (0-10 scale)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Test locally with both SQLite and Firebase
5. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues

**Admin login not working after Firebase deploy:**
- Check that `ADMIN_PASSWORD_HASH` is set in Firebase Functions config
- Regenerate hash with `node generate-password-hash.js`
- Deploy functions: `firebase deploy --only functions`

**Movies not showing posters:**
- Verify `TMDB_API_KEY` is set correctly
- Check that IMDB links are properly formatted
- TMDB API has rate limits; wait and retry

**Firebase deployment fails:**
- Ensure Firebase project is initialized: `firebase init`
- Check service account credentials are valid
- Verify billing is enabled for Firebase project

**Migration issues:**
- Backup SQLite database before migrating
- Ensure Firebase credentials are correct in `.env`
- Check Firestore security rules allow admin writes

### Getting Help

- Check the [Firebase Migration Guide](ADMIN_PASSWORD_MIGRATION.md)
- Review Firebase Functions logs: `firebase functions:log`
- Open an issue with error details and steps to reproduce

---

Built with ❤️ for movie lovers who can never decide what to watch!
