# 🎬 Movie Picker

A comprehensive movie suggestion and ranked voting app for groups to decide what to watch together. Features meeting management, secure admin controls, automatic poster fetching, and flexible deployment options.

## ✨ Features

### 🎭 Core Functionality
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

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start local SQLite server |
| `npm run start:sqlite` | Start local SQLite server |
| `npm run start:firebase` | Start local server with Firebase |
| `npm run start:emulator` | Start Firebase emulators |
| `npm run deploy` | Deploy to Firebase (hosting + functions) |
| `npm run deploy:hosting` | Deploy only Firebase hosting |
| `npm run deploy:functions` | Deploy only Firebase functions |
| `npm run migrate` | Migrate SQLite data to Firebase |

### Project Structure

```
movie-picker/
├── public/                 # Frontend files
│   ├── index.html         # Main app page
│   ├── admin-*.html       # Admin interfaces
│   └── app.js             # Frontend JavaScript
├── functions/             # Firebase Functions
│   ├── index.js           # Cloud Functions API
│   └── package.json       # Functions dependencies
├── server.js              # Local SQLite server
├── server-firebase.js     # Local Firebase server
├── migrate-to-firebase.js # Migration utility
├── generate-password-hash.js # Password hash generator
└── set-firebase-env.sh    # Firebase environment setup
```

## 🚀 Deployment Guide

### Firebase Deployment

1. **Setup Firebase Project**
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init
   ```

2. **Configure Environment**
   ```bash
   ./set-firebase-env.sh
   # Or manually: firebase functions:config:set app.admin_password_hash="$hash"
   ```

3. **Deploy**
   ```bash
   npm run deploy
   ```

### Migration from SQLite to Firebase
```bash
# Configure Firebase credentials in .env
npm run migrate
```

## 📖 API Documentation

### Public Endpoints
- `GET /api/movies` - List all movies
- `POST /api/movies` - Add new movie (requires IMDB link)
- `GET /api/meetings` - List meetings with vote counts
- `GET /api/meetings/:id` - Get meeting details
- `POST /api/votes` - Submit ranked votes for a meeting
- `GET /api/results` - Get voting results (optionally filtered by meeting)
- `GET /api/movies/:id/reviews` - Get movie reviews
- `POST /api/movies/:id/reviews` - Add movie review

### Admin Endpoints (require authentication)
- `POST /api/admin/login` - Admin login
- `POST /api/admin/logout` - Admin logout  
- `GET /api/admin/me` - Check admin status
- `DELETE /api/movies/:id` - Delete movie
- `POST /api/meetings` - Create meeting
- `PATCH /api/meetings/:id` - Update meeting (close voting, etc.)
- `DELETE /api/meetings/:id` - Delete meeting
- `POST /api/meetings/:id/watched` - Set watched movie

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
