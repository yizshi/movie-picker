const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Database = require('better-sqlite3');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'moviepicker.db');
const db = new Database(DB_PATH);

// Initialize DB
db.exec(`
CREATE TABLE IF NOT EXISTS movies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  poster TEXT,
  genres TEXT,
  notes TEXT,
  suggester TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ballots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ballot_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ballot_id INTEGER NOT NULL,
  movie_id INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  FOREIGN KEY (ballot_id) REFERENCES ballots(id) ON DELETE CASCADE,
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
);
`);

// Add meetings table and migrate ballots to include meeting_id and availability JSON
db.exec(`
CREATE TABLE IF NOT EXISTS meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  date TEXT,
  candidate_days TEXT,
  allowed_movie_ids TEXT,
  voting_open INTEGER DEFAULT 1,
  watched_movie_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (watched_movie_id) REFERENCES movies(id)
);
`);

// Reviews table for watched movies: score 0-10 and optional comment
db.exec(`
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movie_id INTEGER NOT NULL,
  username TEXT,
  score INTEGER NOT NULL,
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
);
`);

// Ensure ballots has meeting_id and availability columns (safe to run repeatedly)
const ballotCols = db.prepare("PRAGMA table_info(ballots);").all();
const colNames = ballotCols.map(c => c.name);
if (!colNames.includes('meeting_id')) {
  db.prepare('ALTER TABLE ballots ADD COLUMN meeting_id INTEGER').run();
}
if (!colNames.includes('availability')) {
  db.prepare("ALTER TABLE ballots ADD COLUMN availability TEXT").run();
}

// Add genres column to movies table if it doesn't exist
const movieCols = db.prepare("PRAGMA table_info(movies);").all();
const movieColNames = movieCols.map(c => c.name);
if (!movieColNames.includes('genres')) {
  db.prepare('ALTER TABLE movies ADD COLUMN genres TEXT').run();
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helpers
function getMovies() {
  const stmt = db.prepare('SELECT * FROM movies ORDER BY created_at DESC');
  return stmt.all();
}

const http = require('http');
require('dotenv').config();

// Fetch movie poster and genres from TMDB API
async function fetchMovieData(movieTitle) {
  const TMDB_API_KEY = process.env.TMDB_API_KEY;
  if (!TMDB_API_KEY) {
    return { poster: null, genres: null };
  }

  try {
    let movieId = null;
    let posterPath = null;
    
    // If input looks like an IMDB URL, extract the IMDB id and use TMDB's find endpoint
    if (typeof movieTitle === 'string') {
      const imdbMatch = movieTitle.match(/imdb\.com\/title\/(tt\d+)/i);
      if (imdbMatch) {
        const imdbId = imdbMatch[1];
        const findUrl = `https://api.themoviedb.org/3/find/${imdbId}?external_source=imdb_id`;
        const findResp = await fetch(findUrl, {
          headers: {
            'Authorization': `Bearer ${TMDB_API_KEY}`,
            'Accept': 'application/json'
          }
        });
        if (findResp.ok) {
          const findData = await findResp.json();
          // movie_results contains matching movies
          if (findData.movie_results && findData.movie_results.length > 0) {
            const movie = findData.movie_results[0];
            movieId = movie.id;
            posterPath = movie.poster_path;
          }
        }
      }
    }

    // Fallback: search by title if we didn't find via IMDB
    if (!movieId) {
      const searchUrl = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(movieTitle || '')}`;
      const searchResponse = await fetch(searchUrl, {
        headers: {
          'Authorization': `Bearer ${TMDB_API_KEY}`,
          'Accept': 'application/json'
        }
      });
      if (!searchResponse.ok) {
        return { poster: null, genres: null };
      }

      const searchData = await searchResponse.json();
      if (!searchData.results || searchData.results.length === 0) {
        return { poster: null, genres: null };
      }

      const movie = searchData.results[0];
      movieId = movie.id;
      posterPath = movie.poster_path;
    }

    // Now fetch detailed movie information including genres
    if (movieId) {
      const detailUrl = `https://api.themoviedb.org/3/movie/${movieId}`;
      const detailResponse = await fetch(detailUrl, {
        headers: {
          'Authorization': `Bearer ${TMDB_API_KEY}`,
          'Accept': 'application/json'
        }
      });
      
      if (detailResponse.ok) {
        const detailData = await detailResponse.json();
        const genres = detailData.genres ? detailData.genres.map(g => g.name) : [];
        const posterUrl = posterPath ? `https://image.tmdb.org/t/p/original${posterPath}` : null;
        
        return {
          poster: posterUrl,
          genres: genres.length > 0 ? JSON.stringify(genres) : null
        };
      }
    }

    // Fallback: return just the poster if detailed fetch failed
    const posterUrl = posterPath ? `https://image.tmdb.org/t/p/original${posterPath}` : null;
    return { poster: posterUrl, genres: null };
  } catch (err) {
    return { poster: null, genres: null };
  }
}

// Legacy function for backward compatibility
async function fetchMoviePoster(movieTitle) {
  const data = await fetchMovieData(movieTitle);
  return data.poster;
}

// GET all movies
app.get('/api/movies', (req, res) => {
  const movies = getMovies();
  res.json(movies);
});

// Add a suggestion with automatic poster fetching from TMDB
app.post('/api/movies', async (req, res) => {
  const { title, poster, notes, suggester } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  // Require poster to be an IMDB link
  const imdbMatch = poster && typeof poster === 'string' && poster.match(/imdb\.com\/title\/(tt\d+)/i);
  if (!imdbMatch) {
    return res.status(400).json({ error: 'poster must be an IMDB movie link (https://www.imdb.com/title/tt...)' });
  }

  try {
    let finalPosterUrl = poster;
    let finalGenres = null;

    // If poster contains an IMDB URL, try to fetch via TMDB find endpoint
    if (poster && typeof poster === 'string' && poster.includes('imdb.com')) {
      const movieData = await fetchMovieData(poster);
      if (movieData.poster) finalPosterUrl = movieData.poster;
      if (movieData.genres) finalGenres = movieData.genres;
    }

    // If no poster URL is provided, try to fetch from TMDB using title
    if (!finalPosterUrl) {
      const movieData = await fetchMovieData(title);
      if (movieData.poster) finalPosterUrl = movieData.poster;
      if (movieData.genres) finalGenres = movieData.genres;
    }

    const stmt = db.prepare('INSERT INTO movies (title, poster, genres, notes, suggester) VALUES (?, ?, ?, ?, ?)');
    const info = stmt.run(title, finalPosterUrl || null, finalGenres || null, notes || null, suggester || null);
    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(info.lastInsertRowid);
    res.json(movie);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create movie' });
  }
});

// Submit ranked votes (Borda: rank 1 -> 3 pts, rank 2 -> 2 pts, rank 3 -> 1 pt)
app.post('/api/votes', (req, res) => {
  const { username, ranks, meetingId, availability } = req.body; // availability: array of day strings
  if (!username) return res.status(400).json({ error: 'username is required' });
  if (!Array.isArray(ranks)) return res.status(400).json({ error: 'ranks array is required' });
  if (ranks.length === 0) return res.status(400).json({ error: 'at least one rank required' });
  if (ranks.length > 3) return res.status(400).json({ error: 'maximum 3 ranks allowed' });
  if (!meetingId) return res.status(400).json({ error: 'meetingId is required' });

  // Ensure meeting is open for voting
  const meeting = db.prepare('SELECT id, voting_open FROM meetings WHERE id = ?').get(meetingId);
  if (!meeting) return res.status(400).json({ error: 'meeting not found' });
  if (!meeting.voting_open) return res.status(400).json({ error: 'voting is closed for this meeting' });

  // Validate unique movieIds
  const movieIds = ranks.map(r => r.movieId);
  const uniqueIds = new Set(movieIds);
  if (uniqueIds.size !== movieIds.length) return res.status(400).json({ error: 'duplicate movie in ranks' });

  const insertBallot = db.prepare('INSERT INTO ballots (username, meeting_id, availability) VALUES (?, ?, ?)');
  const insertVote = db.prepare('INSERT INTO ballot_votes (ballot_id, movie_id, rank) VALUES (?, ?, ?)');

  const tx = db.transaction((username, meetingId, availability, ranks) => {
    const info = insertBallot.run(username, meetingId, availability ? JSON.stringify(availability) : null);
    const ballotId = info.lastInsertRowid;
    for (const r of ranks) {
      if (!r.rank || !r.movieId) throw new Error('invalid rank entry');
      insertVote.run(ballotId, r.movieId, r.rank);
    }
    return ballotId;
  });

  try {
    const ballotId = tx(username, meetingId, availability, ranks);
    res.json({ success: true, ballotId });
  } catch (err) {
    res.status(400).json({ error: err.message || 'failed to save votes' });
  }
});

// Get results (compute Borda points)
app.get('/api/results', (req, res) => {
  // points = 4 - rank  (rank 1 -> 3, rank 2 -> 2, rank 3 -> 1)
  const meetingId = req.query.meetingId;
  let rows;
  if (meetingId) {
    rows = db.prepare(`
      SELECT m.id, m.title, m.poster, m.genres, m.notes, m.suggester,
        COALESCE(SUM(4 - bv.rank), 0) AS score,
        COUNT(DISTINCT b.id) AS ballots,
        COUNT(bv.id) AS vote_count
      FROM movies m
      LEFT JOIN ballot_votes bv ON bv.movie_id = m.id
      LEFT JOIN ballots b ON b.id = bv.ballot_id AND b.meeting_id = ?
      GROUP BY m.id
      ORDER BY score DESC, vote_count DESC
    `).all(meetingId);
  } else {
    rows = db.prepare(`
      SELECT m.id, m.title, m.poster, m.genres, m.notes, m.suggester,
        COALESCE(SUM(4 - bv.rank), 0) AS score,
        COUNT(DISTINCT b.id) AS ballots,
        COUNT(bv.id) AS vote_count
      FROM movies m
      LEFT JOIN ballot_votes bv ON bv.movie_id = m.id
      LEFT JOIN ballots b ON b.id = bv.ballot_id
      GROUP BY m.id
      ORDER BY score DESC, vote_count DESC
    `).all();
  }
  res.json(rows);
});

// Meetings endpoints
app.get('/api/meetings', (req, res) => {
  const rows = db.prepare(`SELECT * FROM meetings ORDER BY date DESC, created_at DESC`).all();
  // parse JSON fields
  rows.forEach(r => {
    try { r.candidate_days = r.candidate_days ? JSON.parse(r.candidate_days) : []; } catch(e){ r.candidate_days = []; }
    try { r.allowed_movie_ids = r.allowed_movie_ids ? JSON.parse(r.allowed_movie_ids) : null; } catch(e){ r.allowed_movie_ids = null; }
    try {
      if (r.watched_movie_id) {
        r.watched_movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(r.watched_movie_id);
      } else {
        r.watched_movie = null;
      }
    } catch (e) {
      r.watched_movie = null;
    }
    // Compute vote counts per candidate day for this meeting (from ballots.availability JSON)
    try {
      const availRows = db.prepare('SELECT availability FROM ballots WHERE meeting_id = ? AND availability IS NOT NULL').all(r.id);
      const dateCounts = Object.create(null);
      for (const ar of availRows) {
        try {
          const arr = JSON.parse(ar.availability);
          if (Array.isArray(arr)) {
            for (const d of arr) {
              dateCounts[d] = (dateCounts[d] || 0) + 1;
            }
          }
        } catch (e) {
          // ignore malformed availability
        }
      }
      // expose as an array sorted by count desc
      r.date_counts = Object.entries(dateCounts).map(([date, count]) => ({ date, count })).sort((a, b) => b.count - a.count);
    } catch (e) {
      r.date_counts = [];
    }
  });
  res.json(rows);
});

app.post('/api/meetings', requireAdmin, (req, res) => {
  const { name, date, candidate_days, allowed_movie_ids, voting_open, watched_movie_id } = req.body;
  const stmt = db.prepare(`INSERT INTO meetings (name, date, candidate_days, allowed_movie_ids, voting_open, watched_movie_id) VALUES (?, ?, ?, ?, ?, ?)`);
  const info = stmt.run(name || null, date || null, candidate_days ? JSON.stringify(candidate_days) : null, allowed_movie_ids ? JSON.stringify(allowed_movie_ids) : null, voting_open ? 1 : 0, watched_movie_id || null);
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(info.lastInsertRowid);
  try { meeting.candidate_days = meeting.candidate_days ? JSON.parse(meeting.candidate_days) : []; } catch(e){ meeting.candidate_days = []; }
  try { meeting.allowed_movie_ids = meeting.allowed_movie_ids ? JSON.parse(meeting.allowed_movie_ids) : null; } catch(e){ meeting.allowed_movie_ids = null; }
  res.json(meeting);
});

// Delete a meeting (admin only)
app.delete('/api/meetings/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  
  
  try {
    // Check if meeting exists
    const meeting = db.prepare('SELECT id, watched_movie_id FROM meetings WHERE id = ?').get(id);
    if (!meeting) {
    
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Begin transaction to delete meeting and related data
    const tx = db.transaction(() => {
      
      // Delete all ballots for this meeting (will cascade to ballot_votes)
  const ballotResult = db.prepare('DELETE FROM ballots WHERE meeting_id = ?').run(id);
      
      // Delete the meeting
  const meetingResult = db.prepare('DELETE FROM meetings WHERE id = ?').run(id);
    });

    // Execute transaction
    tx();
    
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete meeting: ' + err.message });
  }
});

// --- Admin login (simple token store) ---------------------------------
const crypto = require('crypto');
const bcrypt = require('bcrypt');

// Admin authentication
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const ADMIN_PASSWORD_PLAINTEXT = process.env.ADMIN_PASSWORD; // For backward compatibility

if (!ADMIN_PASSWORD_HASH && !ADMIN_PASSWORD_PLAINTEXT) {
  throw new Error('Neither ADMIN_PASSWORD_HASH nor ADMIN_PASSWORD is set. Please create a .env file with one of these variables.');
}

// Helper function to verify password against hash or plaintext (for migration)
async function verifyPassword(inputPassword, storedHash, storedPlaintext) {
  if (!inputPassword) return false;
  
  // If hash exists, use bcrypt verification
  if (storedHash) {
    try {
      return await bcrypt.compare(inputPassword, storedHash);
    } catch (error) {
      console.error('Error verifying password hash:', error);
      return false;
    }
  }
  
  // Fallback to plaintext comparison (for backward compatibility)
  if (storedPlaintext) {
    console.warn('Using plaintext password comparison. Consider upgrading to hashed password.');
    return inputPassword === storedPlaintext;
  }
  
  return false;
}
// token -> expiry (ms since epoch)
const adminTokens = new Map();
function genToken() { return crypto.randomBytes(24).toString('hex'); }
function requireAdmin(req, res, next) {
  const token = req.get('X-Admin-Token') || (req.get('Authorization') || '').replace(/^Bearer\s+/, '');
  if (!token) return res.status(401).json({ error: 'admin token required' });
  const exp = adminTokens.get(token);
  if (!exp) return res.status(401).json({ error: 'invalid token' });
  if (Date.now() > exp) { adminTokens.delete(token); return res.status(401).json({ error: 'token expired' }); }
  // token valid
  req.admin = true;
  next();
}

app.post('/api/admin/login', async (req, res) => {
  const { password } = req.body || {};
  
  const isValidPassword = await verifyPassword(password, ADMIN_PASSWORD_HASH, ADMIN_PASSWORD_PLAINTEXT);
  
  if (!isValidPassword) {
    return res.status(401).json({ error: 'invalid password' });
  }
  
  const token = genToken();
  const ttl = 1000 * 60 * 60 * 4; // 4 hours
  adminTokens.set(token, Date.now() + ttl);
  
  res.json({ token, expiresIn: ttl });
});

app.post('/api/admin/logout', (req, res) => {
  const token = req.get('X-Admin-Token') || (req.get('Authorization') || '').replace(/^Bearer\s+/, '');
  if (token) adminTokens.delete(token);
  res.json({ ok: true });
});

app.get('/api/admin/me', (req, res) => {
  const token = req.get('X-Admin-Token') || (req.get('Authorization') || '').replace(/^Bearer\s+/, '');
  if (!token) return res.json({ admin: false });
  const exp = adminTokens.get(token);
  if (!exp || Date.now() > exp) { if (exp) adminTokens.delete(token); return res.json({ admin: false }); }
  res.json({ admin: true });
});

// Meeting CRUD operations
app.get('/api/meetings/:id', (req, res) => {
  const id = req.params.id;
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id);
  if (!meeting) return res.status(404).json({ error: 'meeting not found' });
  try { meeting.candidate_days = meeting.candidate_days ? JSON.parse(meeting.candidate_days) : []; } catch(e){ meeting.candidate_days = []; }
  let willCloseVoting = false; // Determine if voting will be closed
  if (meeting.watched_movie_id) {
    meeting.watched_movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(meeting.watched_movie_id);
  }
  res.json(meeting);
});

// Delete meeting endpoint
app.delete('/api/meetings/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  
  try {
    // Check if meeting exists
    const meeting = db.prepare('SELECT id FROM meetings WHERE id = ?').get(id);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Begin transaction to delete meeting and related data
    const tx = db.transaction(() => {
      // Delete all ballots for this meeting (will cascade to ballot_votes)
      db.prepare('DELETE FROM ballots WHERE meeting_id = ?').run(id);
      // Delete the meeting
      db.prepare('DELETE FROM meetings WHERE id = ?').run(id);
    });

    // Execute transaction
    tx();
    
    res.json({ success: true });
  } catch (err) {
    
    res.status(500).json({ error: 'Failed to delete meeting' });
  }
});

// Update meeting (admin) - allow toggling voting_open and other safe fields
app.patch('/api/meetings/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  const { voting_open, name, candidate_days, allowed_movie_ids } = req.body || {};
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

  try {
    const updates = [];
    const params = [];
    const prevVotingOpen = meeting.voting_open ? 1 : 0;
    let willCloseVoting = false;
    if (typeof voting_open !== 'undefined') { updates.push('voting_open = ?'); params.push(voting_open ? 1 : 0); if (prevVotingOpen === 1 && !voting_open) willCloseVoting = true; }
    if (typeof name !== 'undefined') { updates.push('name = ?'); params.push(name || null); }
    if (typeof candidate_days !== 'undefined') { updates.push('candidate_days = ?'); params.push(candidate_days ? JSON.stringify(candidate_days) : null); }
    if (typeof allowed_movie_ids !== 'undefined') { updates.push('allowed_movie_ids = ?'); params.push(allowed_movie_ids ? JSON.stringify(allowed_movie_ids) : null); }

    if (updates.length === 0) return res.status(400).json({ error: 'no valid fields to update' });

    const sql = `UPDATE meetings SET ${updates.join(', ')} WHERE id = ?`;
    params.push(id);
    db.prepare(sql).run(...params);

    // If we're closing voting now, pick the top movie for watched_movie_id
    if (willCloseVoting) {
      try {
        // 1) Determine most-selected candidate day from ballots.availability for this meeting
        const availRows = db.prepare('SELECT availability FROM ballots WHERE meeting_id = ? AND availability IS NOT NULL').all(id);
        const dateCounts = Object.create(null);
        for (const ar of availRows) {
          try {
            const arr = JSON.parse(ar.availability);
            if (Array.isArray(arr)) {
              for (const d of arr) {
                dateCounts[d] = (dateCounts[d] || 0) + 1;
              }
            }
          } catch (e) {
            // ignore malformed availability entries
          }
        }
        let chosenDate = null; let maxCount = 0;
        for (const [d, c] of Object.entries(dateCounts)) {
          if (c > maxCount) { maxCount = c; chosenDate = d; }
        }
        if (chosenDate) {
          db.prepare('UPDATE meetings SET date = ? WHERE id = ?').run(chosenDate, id);
        }

        // 2) Compute Borda-like score and vote_count per movie for THIS meeting only
        const top = db.prepare(`
          SELECT m.id AS movie_id,
                 COALESCE(SUM(CASE WHEN b.id IS NOT NULL THEN (4 - bv.rank) ELSE 0 END), 0) AS score,
                 COALESCE(SUM(CASE WHEN b.id IS NOT NULL THEN 1 ELSE 0 END), 0) AS vote_count
          FROM movies m
          LEFT JOIN ballot_votes bv ON bv.movie_id = m.id
          LEFT JOIN ballots b ON b.id = bv.ballot_id AND b.meeting_id = ?
          GROUP BY m.id
          ORDER BY score DESC, vote_count DESC
          LIMIT 1
        `).get(id);

        // If there are votes for this meeting, set the watched movie
        if (top && top.movie_id && Number(top.vote_count) > 0) {
          db.prepare('UPDATE meetings SET watched_movie_id = ? WHERE id = ?').run(top.movie_id, id);
        }
      } catch (e) {
        // ignore selection errors — don't block the update
      }
    }

    const updated = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id);
    try { updated.candidate_days = updated.candidate_days ? JSON.parse(updated.candidate_days) : []; } catch(e){ updated.candidate_days = []; }
    try { updated.allowed_movie_ids = updated.allowed_movie_ids ? JSON.parse(updated.allowed_movie_ids) : null; } catch(e){ updated.allowed_movie_ids = null; }
    if (updated.watched_movie_id) updated.watched_movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(updated.watched_movie_id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update meeting' });
  }
});

// Delete a movie (admin only)
app.delete('/api/movies/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  
  try {
    // Check if movie exists
    const movie = db.prepare('SELECT id FROM movies WHERE id = ?').get(id);
    if (!movie) {
  return res.status(404).json({ error: 'Movie not found' });
    }

    // First check if the movie is currently marked as watched in any meeting
    const watchedMeeting = db.prepare('SELECT id FROM meetings WHERE watched_movie_id = ?').get(id);
    if (watchedMeeting) {
  return res.status(400).json({ error: 'Cannot delete movie: it is marked as watched in a meeting' });
    }

    // Begin transaction to safely delete movie and related data
    const tx = db.transaction(() => {
      // Remove the movie from any meeting's allowed_movie_ids
      const meetings = db.prepare('SELECT id, allowed_movie_ids FROM meetings WHERE allowed_movie_ids IS NOT NULL').all();
      for (const meeting of meetings) {
        try {
          const allowedIds = JSON.parse(meeting.allowed_movie_ids);
          if (allowedIds && allowedIds.includes(parseInt(id))) {
            const newAllowedIds = allowedIds.filter(mid => mid !== parseInt(id));
            db.prepare('UPDATE meetings SET allowed_movie_ids = ? WHERE id = ?')
              .run(JSON.stringify(newAllowedIds), meeting.id);
          }
        } catch (e) {
        }
      }

      // Delete the movie (will cascade to ballot_votes)
  const result = db.prepare('DELETE FROM movies WHERE id = ?').run(id);
    });

    // Execute transaction
    tx();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete movie: ' + err.message });
  }
});

// --- Reviews for watched movies ---------------------------------
// GET reviews and average for a movie
app.get('/api/movies/:id/reviews', (req, res) => {
  const movieId = Number(req.params.id);
  if (!movieId) return res.status(400).json({ error: 'invalid movie id' });
  try {
    const rows = db.prepare('SELECT id, username, score, comment, created_at FROM reviews WHERE movie_id = ? ORDER BY created_at DESC').all(movieId);
    const agg = db.prepare('SELECT COUNT(*) as cnt, AVG(score) as avgScore FROM reviews WHERE movie_id = ?').get(movieId);
    res.json({ count: agg.cnt || 0, average: agg.avgScore !== null ? Number(Number(agg.avgScore).toFixed(2)) : null, reviews: rows });
  } catch (err) {
    res.status(500).json({ error: 'failed to fetch reviews' });
  }
});

// POST a review (score + optional comment) for a movie
app.post('/api/movies/:id/reviews', (req, res) => {
  const movieId = Number(req.params.id);
  const { username, score, comment } = req.body || {};
  if (!movieId) return res.status(400).json({ error: 'invalid movie id' });
  const s = Number(score);
  if (isNaN(s) || s < 0 || s > 10) return res.status(400).json({ error: 'score must be a number between 0 and 10' });
  try {
    const stmt = db.prepare('INSERT INTO reviews (movie_id, username, score, comment) VALUES (?, ?, ?, ?)');
    const info = stmt.run(movieId, username || null, s, comment || null);
    const agg = db.prepare('SELECT COUNT(*) as cnt, AVG(score) as avgScore FROM reviews WHERE movie_id = ?').get(movieId);
    const rows = db.prepare('SELECT id, username, score, comment, created_at FROM reviews WHERE movie_id = ? ORDER BY created_at DESC').all(movieId);
    res.json({ success: true, reviewId: info.lastInsertRowid, count: agg.cnt || 0, average: agg.avgScore !== null ? Number(Number(agg.avgScore).toFixed(2)) : null, reviews: rows });
  } catch (err) {
    res.status(500).json({ error: 'failed to save review' });
  }
});

// Mark a meeting's watched movie
app.post('/api/meetings/:id/watched', requireAdmin, (req, res) => {
  const id = req.params.id;
  const { movieId } = req.body;
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id);
  if (!meeting) return res.status(404).json({ error: 'meeting not found' });
  if (movieId) {
    // ensure movie exists
    const movie = db.prepare('SELECT id FROM movies WHERE id = ?').get(movieId);
    if (!movie) return res.status(400).json({ error: 'movie not found' });
    db.prepare('UPDATE meetings SET watched_movie_id = ? WHERE id = ?').run(movieId, id);
  } else {
    // clear watched movie
    db.prepare('UPDATE meetings SET watched_movie_id = NULL WHERE id = ?').run(id);
  }
  const updated = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id);
  try { updated.candidate_days = updated.candidate_days ? JSON.parse(updated.candidate_days) : []; } catch(e){ updated.candidate_days = []; }
  try { updated.allowed_movie_ids = updated.allowed_movie_ids ? JSON.parse(updated.allowed_movie_ids) : null; } catch(e){ updated.allowed_movie_ids = null; }
  if (updated.watched_movie_id) updated.watched_movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(updated.watched_movie_id);
  res.json(updated);
});

// Fallback to index for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Only start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export app for testing
module.exports = { app };
