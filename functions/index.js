const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// TMDB serves multiple poster sizes. Cards render at ~200-300px wide, so w500
// is plenty (~35KB vs ~200KB for `original`). Rewrites both new and existing
// URLs on the way out so old rows benefit without a data migration.
function optimizePosterUrl(url) {
  if (!url || typeof url !== 'string') return url;
  return url.replace('/t/p/original/', '/t/p/w500/');
}


// Load environment variables (Firebase Functions supports .env files)
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Test endpoint
app.get('/test', (req, res) => {
  res.json({ message: 'Firebase Functions are working!', timestamp: new Date().toISOString() });
});

// Helper function to get movies from Firestore
async function getMovies() {
  try {
    // Remove orderBy to avoid index requirement issues, sort in memory instead
    // Exclude poster_cached_data (large base64 blob) — not needed for the list
    const snapshot = await db.collection('movies').select(
      'title', 'poster', 'genres', 'metadata', 'imdb_id', 'hidden',
      'suggestions', 'suggester', 'notes', 'created_at'
    ).get();
    const movies = snapshot.docs.map(doc => {
      const data = doc.data();
      
      // Optimized timestamp conversion
      let created_at = null;
      if (data.created_at) {
        try {
          created_at = data.created_at.toDate ? 
            data.created_at.toDate().toISOString() : 
            (typeof data.created_at === 'string' ? data.created_at : new Date(data.created_at).toISOString());
        } catch (e) {
          created_at = new Date().toISOString(); // fallback
        }
      }
      
      const posterUrl = optimizePosterUrl(data.poster);

      // Handle backward compatibility and format suggestions
      let suggestions = [];
      if (data.suggestions && Array.isArray(data.suggestions)) {
        // Optimized timestamp conversion for suggestions
        suggestions = data.suggestions.map(suggestion => ({
          ...suggestion,
          created_at: suggestion.created_at ? 
            (suggestion.created_at.toDate ? 
              suggestion.created_at.toDate().toISOString() : 
              (typeof suggestion.created_at === 'string' ? suggestion.created_at : new Date(suggestion.created_at).toISOString())
            ) : null
        }));
      } else if (data.suggester || data.notes) {
        // Old format - convert to new format
        suggestions = [{
          suggester: data.suggester || 'Anonymous',
          notes: data.notes || null,
          created_at: created_at
        }];
      }
      
      return {
        id: doc.id,
        title: data.title,
        poster: posterUrl,
        genres: data.genres,
        metadata: data.metadata,
        imdb_id: data.imdb_id,
        hidden: data.hidden || false,
        suggestions: suggestions,
        created_at,
        // Maintain backward compatibility for existing frontend code
        suggester: suggestions.length > 0 ? suggestions[0].suggester : null,
        notes: suggestions.length > 0 ? suggestions[0].notes : null
      };
    });
    
    // Sort in memory by created_at desc
    movies.sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });
    
    return movies;
  } catch (error) {
    console.error('Error fetching movies:', error);
    return [];
  }
}

// Fetch movie poster and genres from TMDB API
async function fetchMovieData(movieTitle) {
  const TMDB_API_KEY = process.env.TMDB_API_KEY;
  if (!TMDB_API_KEY) {
    return { poster: null, genres: null, metadata: null };
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
        const posterUrl = posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : null;
        
        // Extract additional metadata
        const metadata = {
          release_year: detailData.release_date ? new Date(detailData.release_date).getFullYear() : null,
          runtime: detailData.runtime || null,
          rating: detailData.vote_average ? parseFloat(detailData.vote_average.toFixed(1)) : null,
          overview: detailData.overview || null,
          imdb_id: detailData.imdb_id || null
        };
        
        return {
          poster: posterUrl,
          genres: genres.length > 0 ? genres : null,
          metadata: metadata
        };
      }
    }

    // Fallback: return just the poster if detailed fetch failed
    const posterUrl = posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : null;
    return { poster: posterUrl, genres: null, metadata: null };
  } catch (err) {
    return { poster: null, genres: null, metadata: null };
  }
}

// Search TMDB by title. Returns a lightweight shape for a picker UI.
async function searchTmdb(query) {
  const TMDB_API_KEY = process.env.TMDB_API_KEY;
  if (!TMDB_API_KEY || !query) return [];
  const url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}&include_adult=false`;
  const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${TMDB_API_KEY}`, 'Accept': 'application/json' } });
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.results || []).slice(0, 10).map(m => ({
    tmdb_id: m.id,
    title: m.title,
    year: m.release_date ? new Date(m.release_date).getFullYear() : null,
    poster: m.poster_path ? `https://image.tmdb.org/t/p/w185${m.poster_path}` : null,
    overview: m.overview || null
  }));
}

// Fetch full detail for a TMDB movie id. One round trip.
async function fetchMovieDataByTmdbId(tmdbId) {
  const TMDB_API_KEY = process.env.TMDB_API_KEY;
  if (!TMDB_API_KEY || !tmdbId) return { poster: null, genres: null, metadata: null };
  try {
    const resp = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}`, {
      headers: { 'Authorization': `Bearer ${TMDB_API_KEY}`, 'Accept': 'application/json' }
    });
    if (!resp.ok) return { poster: null, genres: null, metadata: null };
    const d = await resp.json();
    const posterUrl = d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null;
    const genres = d.genres ? d.genres.map(g => g.name) : [];
    return {
      poster: posterUrl,
      genres: genres.length > 0 ? genres : null,
      metadata: {
        release_year: d.release_date ? new Date(d.release_date).getFullYear() : null,
        runtime: d.runtime || null,
        rating: d.vote_average ? parseFloat(d.vote_average.toFixed(1)) : null,
        overview: d.overview || null,
        imdb_id: d.imdb_id || null
      },
      imdb_id: d.imdb_id || null,
      title: d.title || null
    };
  } catch (err) {
    return { poster: null, genres: null, metadata: null };
  }
}

// Admin authentication
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const ADMIN_PASSWORD_PLAINTEXT = process.env.ADMIN_PASSWORD; // For backward compatibility

if (!ADMIN_PASSWORD_HASH && !ADMIN_PASSWORD_PLAINTEXT) {
  console.warn('Neither ADMIN_PASSWORD_HASH nor ADMIN_PASSWORD is set. Admin features will not work.');
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

// Stateless HMAC-signed admin tokens: `<expMs>.<hmacHex>`.
// Cloud Functions run across multiple isolated instances, so an in-memory
// token map does not survive between requests — every navigation could
// hit a different instance and force a re-login. Signing solves that.
const TOKEN_SECRET = ADMIN_PASSWORD_HASH || ADMIN_PASSWORD_PLAINTEXT || 'unset-token-secret';
const ADMIN_TOKEN_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours

function signAdminToken(ttlMs = ADMIN_TOKEN_TTL_MS) {
  const exp = Date.now() + ttlMs;
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(String(exp)).digest('hex');
  return `${exp}.${sig}`;
}

function verifyAdminToken(token) {
  if (!token || typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(expStr).digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function extractToken(req) {
  return req.get('X-Admin-Token') || (req.get('Authorization') || '').replace(/^Bearer\s+/, '');
}

function requireAdmin(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'admin token required' });
  if (!verifyAdminToken(token)) return res.status(401).json({ error: 'invalid or expired token' });
  req.admin = true;
  next();
}

// Admin login
app.post('/admin/login', async (req, res) => {
  const { password } = req.body || {};
  
  const isValidPassword = await verifyPassword(password, ADMIN_PASSWORD_HASH, ADMIN_PASSWORD_PLAINTEXT);
  
  if (!isValidPassword) {
    return res.status(401).json({ error: 'invalid password' });
  }
  
  const token = signAdminToken();
  res.json({ token, expiresIn: ADMIN_TOKEN_TTL_MS });
});

app.post('/admin/logout', (req, res) => {
  // Stateless tokens: client just discards it. Kept for API compatibility.
  res.json({ ok: true });
});

app.get('/admin/me', (req, res) => {
  res.json({ admin: verifyAdminToken(extractToken(req)) });
});

// TMDB search proxy — used by the suggest picker. Keeps the API key server-side.
app.get('/tmdb/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.json([]);
  try {
    res.json(await searchTmdb(q));
  } catch (err) {
    console.error('TMDB search error:', err);
    res.status(500).json({ error: 'TMDB search failed' });
  }
});

// Movies endpoints
app.get('/movies', async (req, res) => {
  try {
    const movies = await getMovies();
    // Allow admins to include hidden movies via query param
    const isAdmin = verifyAdminToken(extractToken(req));
    const includeHidden = isAdmin && req.query.include_hidden === 'true';
    const filtered = includeHidden ? movies : movies.filter(m => !m.hidden);
    res.json(filtered);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch movies' });
  }
});

app.post('/movies', async (req, res) => {
  const { title: bodyTitle, poster, notes, suggester, tmdb_id } = req.body;

  // Accept either tmdb_id (from the search picker) OR an IMDB URL in `poster`
  // (legacy path, still supported for backward compat).
  let imdbId = null;
  let title = bodyTitle;
  let tmdbDetail = null;

  if (tmdb_id) {
    tmdbDetail = await fetchMovieDataByTmdbId(tmdb_id);
    if (!tmdbDetail || !tmdbDetail.imdb_id) {
      return res.status(400).json({ error: 'Could not resolve movie from TMDB' });
    }
    imdbId = tmdbDetail.imdb_id;
    title = title || tmdbDetail.title;
  } else {
    if (!title) return res.status(400).json({ error: 'title is required' });
    const imdbMatch = poster && typeof poster === 'string' && poster.match(/imdb\.com\/title\/(tt\d+)/i);
    if (!imdbMatch) {
      return res.status(400).json({ error: 'must provide either tmdb_id or an IMDB movie link' });
    }
    imdbId = imdbMatch[1];
  }

  try {
    
    // Check if a movie with this IMDB ID already exists
    const existingMoviesSnapshot = await db.collection('movies')
      .where('imdb_id', '==', imdbId)
      .get();

    if (!existingMoviesSnapshot.empty) {
      // Movie exists, append new suggestion
      const existingDoc = existingMoviesSnapshot.docs[0];
      const existingData = existingDoc.data();
      
      // Create new suggestion object
      const newSuggestion = {
        suggester: suggester || 'Anonymous',
        notes: notes || null,
        created_at: new Date()
      };

      // Get existing suggestions or initialize array
      const existingSuggestions = existingData.suggestions || [];
      
      // For backward compatibility, if old format exists, convert it
      if (existingData.suggester && !existingSuggestions.some(s => s.suggester === existingData.suggester)) {
        existingSuggestions.unshift({
          suggester: existingData.suggester,
          notes: existingData.notes,
          created_at: existingData.created_at || new Date()
        });
      }

      // Add new suggestion
      existingSuggestions.push(newSuggestion);

      // Update the existing document (also unhide if it was hidden)
      await existingDoc.ref.update({
        suggestions: existingSuggestions,
        hidden: false,
        // Remove old fields if they exist (for migration)
        suggester: admin.firestore.FieldValue.delete(),
        notes: admin.firestore.FieldValue.delete()
      });

      // Return updated movie
      const updatedMovie = await existingDoc.ref.get();
      return res.json({
        id: updatedMovie.id,
        ...updatedMovie.data()
      });
    }

    // Movie doesn't exist — use TMDB detail we already fetched (via tmdb_id
    // path) or look it up now (legacy IMDB-URL path).
    let finalPosterUrl = null;
    let finalGenres = null;
    let finalMetadata = null;

    const movieData = tmdbDetail || await fetchMovieData(poster || title);
    if (movieData) {
      if (movieData.poster) finalPosterUrl = movieData.poster;
      if (movieData.genres) finalGenres = movieData.genres;
      if (movieData.metadata) finalMetadata = movieData.metadata;
    }

    const movieDoc = {
      title,
      poster: finalPosterUrl || null,
      genres: finalGenres || null,
      metadata: finalMetadata || null,
      imdb_id: imdbId,
      suggestions: [{
        suggester: suggester || 'Anonymous',
        notes: notes || null,
        created_at: new Date()
      }],
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await db.collection('movies').add(movieDoc);
    const movie = await docRef.get();
    
    res.json({
      id: movie.id,
      ...movie.data()
    });
  } catch (err) {
    console.error('Error creating/updating movie:', err);
    res.status(500).json({ error: 'Failed to create movie' });
  }
});

// Bulk-hide every currently-visible movie. Used by admin to reset the pool
// between meetings without deleting suggestions.
app.post('/movies/hide-all', requireAdmin, async (req, res) => {
  try {
    // Some old rows have no `hidden` field at all, so we can't rely on
    // where('hidden', '==', false) to catch them. Fetch and filter in-memory.
    const snapshot = await db.collection('movies').select('hidden').get();
    const targets = snapshot.docs.filter(d => !d.data().hidden);
    if (targets.length === 0) return res.json({ hidden: 0 });

    // Firestore write batches cap at 500 ops.
    let hidden = 0;
    for (const group of chunk(targets, 500)) {
      const batch = db.batch();
      for (const doc of group) batch.update(doc.ref, { hidden: true });
      await batch.commit();
      hidden += group.length;
    }
    res.json({ hidden });
  } catch (error) {
    console.error('Error hiding all movies:', error);
    res.status(500).json({ error: 'Failed to hide all movies' });
  }
});

app.patch('/movies/:id/visibility', requireAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    const movieRef = db.collection('movies').doc(id);
    const movieDoc = await movieRef.get();
    if (!movieDoc.exists) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    const currentHidden = movieDoc.data().hidden || false;
    await movieRef.update({ hidden: !currentHidden });
    res.json({ id, hidden: !currentHidden });
  } catch (error) {
    console.error('Error toggling movie visibility:', error);
    res.status(500).json({ error: 'Failed to update movie visibility' });
  }
});

app.delete('/movies/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  
  try {
    // Check if movie exists
    const movieDoc = await db.collection('movies').doc(id).get();
    if (!movieDoc.exists) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    // Check if the movie is currently marked as watched in any meeting
    const watchedMeetings = await db.collection('meetings').where('watched_movie_id', '==', id).get();
    if (!watchedMeetings.empty) {
      return res.status(400).json({ error: 'Cannot delete movie: it is marked as watched in a meeting' });
    }

    // Use batch to delete movie and update meetings
    const batch = db.batch();
    
    // Remove the movie from any meeting's allowed_movie_ids
    const meetings = await db.collection('meetings').get();
    meetings.forEach(meetingDoc => {
      const meetingData = meetingDoc.data();
      if (meetingData.allowed_movie_ids && meetingData.allowed_movie_ids.includes(id)) {
        const newAllowedIds = meetingData.allowed_movie_ids.filter(mid => mid !== id);
        batch.update(meetingDoc.ref, { allowed_movie_ids: newAllowedIds });
      }
    });

    // Delete the movie
    batch.delete(db.collection('movies').doc(id));
    
    await batch.commit();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete movie: ' + err.message });
  }
});

// Meetings endpoints
app.get('/meetings', async (req, res) => {
  try {
    const snapshot = await db.collection('meetings').get();
    const meetings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), watched_movie: null, date_counts: [] }));

    if (meetings.length === 0) return res.json([]);

    // Batch: all watched movies in one round trip, all ballots in chunks of 30
    // (Firestore `in` limit). Previously did O(M) serial reads = ~200ms * M.
    const watchedIds = [...new Set(meetings.map(m => m.watched_movie_id).filter(Boolean))];
    const meetingIds = meetings.map(m => m.id);

    const [watchedDocs, ballotChunks] = await Promise.all([
      watchedIds.length > 0
        ? db.getAll(...watchedIds.map(id => db.collection('movies').doc(id)))
        : Promise.resolve([]),
      Promise.all(chunk(meetingIds, 30).map(ids =>
        db.collection('ballots').where('meeting_id', 'in', ids).get()
      ))
    ]);

    const watchedById = new Map(
      watchedDocs.filter(d => d.exists).map(d => {
        const data = d.data();
        return [d.id, { id: d.id, ...data, poster: optimizePosterUrl(data.poster) }];
      })
    );

    const dateCountsByMeeting = new Map();
    for (const snap of ballotChunks) {
      for (const bDoc of snap.docs) {
        const ballot = bDoc.data();
        const mId = ballot.meeting_id;
        if (!Array.isArray(ballot.availability)) continue;
        let counts = dateCountsByMeeting.get(mId);
        if (!counts) { counts = {}; dateCountsByMeeting.set(mId, counts); }
        for (const date of ballot.availability) counts[date] = (counts[date] || 0) + 1;
      }
    }

    for (const m of meetings) {
      if (m.watched_movie_id) m.watched_movie = watchedById.get(m.watched_movie_id) || null;
      const counts = dateCountsByMeeting.get(m.id) || {};
      m.date_counts = Object.entries(counts).map(([date, count]) => ({ date, count })).sort((a, b) => b.count - a.count);
    }

    meetings.sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date);
      if (a.date && !b.date) return -1;
      if (!a.date && b.date) return 1;
      const aTime = a.created_at && a.created_at._seconds ? a.created_at._seconds : 0;
      const bTime = b.created_at && b.created_at._seconds ? b.created_at._seconds : 0;
      return bTime - aTime;
    });

    res.json(meetings);
  } catch (error) {
    console.error('Error fetching meetings:', error);
    res.status(500).json({ error: 'Failed to fetch meetings' });
  }
});

app.get('/meetings/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const doc = await db.collection('meetings').doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'meeting not found' });
    }
    
    const meeting = {
      id: doc.id,
      ...doc.data()
    };
    
    if (meeting.watched_movie_id) {
      const movieDoc = await db.collection('movies').doc(meeting.watched_movie_id).get();
      meeting.watched_movie = movieDoc.exists ? { id: movieDoc.id, ...movieDoc.data() } : null;
    }
    
    res.json(meeting);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch meeting' });
  }
});

app.post('/meetings', requireAdmin, async (req, res) => {
  const { name, date, candidate_days, allowed_movie_ids, voting_open, watched_movie_id, notes } = req.body;
  
  try {
    const meetingDoc = {
      name: name || null,
      date: date || null,
      candidate_days: candidate_days || [],
      allowed_movie_ids: allowed_movie_ids || null,
      voting_open: voting_open ? true : false,
      watched_movie_id: watched_movie_id || null,
      notes: notes || null,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await db.collection('meetings').add(meetingDoc);
    const meeting = await docRef.get();
    
    res.json({
      id: meeting.id,
      ...meeting.data()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create meeting' });
  }
});

app.patch('/meetings/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  const { voting_open, name, candidate_days, allowed_movie_ids, notes } = req.body || {};
  
  try {
    const meetingDoc = await db.collection('meetings').doc(id).get();
    if (!meetingDoc.exists) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const currentData = meetingDoc.data();
    const updates = {};
    const prevVotingOpen = currentData.voting_open;
    let willCloseVoting = false;

    if (typeof voting_open !== 'undefined') {
      updates.voting_open = voting_open ? true : false;
      if (prevVotingOpen && !voting_open) willCloseVoting = true;
    }
    if (typeof name !== 'undefined') updates.name = name || null;
    if (typeof candidate_days !== 'undefined') updates.candidate_days = candidate_days || [];
    if (typeof allowed_movie_ids !== 'undefined') updates.allowed_movie_ids = allowed_movie_ids || null;
    if (typeof notes !== 'undefined') updates.notes = notes || null;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'no valid fields to update' });
    }

    await db.collection('meetings').doc(id).update(updates);

    // If we're closing voting now, pick the top movie and most popular date
    if (willCloseVoting) {
      try {
        // 1) Determine most-selected candidate day from ballots
        const ballotsSnapshot = await db.collection('ballots')
          .where('meeting_id', '==', id)
          .where('availability', '!=', null)
          .get();
        
        const dateCounts = {};
        ballotsSnapshot.forEach(ballotDoc => {
          const ballot = ballotDoc.data();
          if (ballot.availability && Array.isArray(ballot.availability)) {
            ballot.availability.forEach(date => {
              dateCounts[date] = (dateCounts[date] || 0) + 1;
            });
          }
        });
        
        let chosenDate = null;
        let maxCount = 0;
        for (const [date, count] of Object.entries(dateCounts)) {
          if (count > maxCount) {
            maxCount = count;
            chosenDate = date;
          }
        }
        
        // 2) Compute Borda scores for movies in this meeting
        const movieScores = {};
        const movieVoteCounts = {};
        
        const votesSnapshot = await db.collection('ballots')
          .where('meeting_id', '==', id)
          .get();
        
        for (const ballotDoc of votesSnapshot.docs) {
          const ballot = ballotDoc.data();
          if (ballot.votes && Array.isArray(ballot.votes)) {
            ballot.votes.forEach(vote => {
              const score = 4 - vote.rank; // rank 1 -> 3 pts, rank 2 -> 2 pts, rank 3 -> 1 pt
              movieScores[vote.movie_id] = (movieScores[vote.movie_id] || 0) + score;
              movieVoteCounts[vote.movie_id] = (movieVoteCounts[vote.movie_id] || 0) + 1;
            });
          }
        }
        
        // Find the top movie
        let topMovieId = null;
        let topScore = -1;
        let topVoteCount = 0;
        
        for (const [movieId, score] of Object.entries(movieScores)) {
          const voteCount = movieVoteCounts[movieId] || 0;
          if (score > topScore || (score === topScore && voteCount > topVoteCount)) {
            topScore = score;
            topVoteCount = voteCount;
            topMovieId = movieId;
          }
        }
        
        // Update meeting with chosen date and watched movie
        const autoUpdates = {};
        if (chosenDate) autoUpdates.date = chosenDate;
        if (topMovieId && topVoteCount > 0) autoUpdates.watched_movie_id = topMovieId;
        
        if (Object.keys(autoUpdates).length > 0) {
          await db.collection('meetings').doc(id).update(autoUpdates);
        }
      } catch (e) {
        // ignore selection errors — don't block the update
      }
    }

    // Return updated meeting
    const updatedDoc = await db.collection('meetings').doc(id).get();
    const updated = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };
    
    if (updated.watched_movie_id) {
      const movieDoc = await db.collection('movies').doc(updated.watched_movie_id).get();
      updated.watched_movie = movieDoc.exists ? { id: movieDoc.id, ...movieDoc.data() } : null;
    }
    
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update meeting' });
  }
});

app.delete('/meetings/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  
  try {
    const meetingDoc = await db.collection('meetings').doc(id).get();
    if (!meetingDoc.exists) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Use batch to delete meeting and related ballots
    const batch = db.batch();
    
    // Delete all ballots for this meeting
    const ballotsSnapshot = await db.collection('ballots').where('meeting_id', '==', id).get();
    ballotsSnapshot.forEach(ballotDoc => {
      batch.delete(ballotDoc.ref);
    });
    
    // Delete the meeting
    batch.delete(db.collection('meetings').doc(id));
    
    await batch.commit();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete meeting: ' + err.message });
  }
});

app.post('/meetings/:id/watched', requireAdmin, async (req, res) => {
  const id = req.params.id;
  const { movieId } = req.body;
  
  try {
    const meetingDoc = await db.collection('meetings').doc(id).get();
    if (!meetingDoc.exists) {
      return res.status(404).json({ error: 'meeting not found' });
    }
    
    if (movieId) {
      const movieDoc = await db.collection('movies').doc(movieId).get();
      if (!movieDoc.exists) {
        return res.status(400).json({ error: 'movie not found' });
      }
      await db.collection('meetings').doc(id).update({ watched_movie_id: movieId });
    } else {
      await db.collection('meetings').doc(id).update({ watched_movie_id: null });
    }
    
    const updatedDoc = await db.collection('meetings').doc(id).get();
    const updated = {
      id: updatedDoc.id,
      ...updatedDoc.data()
    };
    
    if (updated.watched_movie_id) {
      const movieDoc = await db.collection('movies').doc(updated.watched_movie_id).get();
      updated.watched_movie = movieDoc.exists ? { id: movieDoc.id, ...movieDoc.data() } : null;
    }
    
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update watched movie' });
  }
});

// Votes endpoints
app.post('/votes', async (req, res) => {
  const { username, ranks, meetingId, availability } = req.body;
  if (!username) return res.status(400).json({ error: 'username is required' });
  if (!Array.isArray(ranks)) return res.status(400).json({ error: 'ranks array is required' });
  if (ranks.length === 0) return res.status(400).json({ error: 'at least one rank required' });
  if (ranks.length > 3) return res.status(400).json({ error: 'maximum 3 ranks allowed' });
  if (!meetingId) return res.status(400).json({ error: 'meetingId is required' });

  try {
    // Ensure meeting is open for voting
    const meetingDoc = await db.collection('meetings').doc(meetingId).get();
    if (!meetingDoc.exists) return res.status(400).json({ error: 'meeting not found' });
    const meeting = meetingDoc.data();
    if (!meeting.voting_open) return res.status(400).json({ error: 'voting is closed for this meeting' });

    // Validate unique movieIds
    const movieIds = ranks.map(r => r.movieId);
    const uniqueIds = new Set(movieIds);
    if (uniqueIds.size !== movieIds.length) return res.status(400).json({ error: 'duplicate movie in ranks' });

    // Validate rank entries
    for (const r of ranks) {
      if (!r.rank || !r.movieId) {
        return res.status(400).json({ error: 'invalid rank entry' });
      }
    }

    const ballotDoc = {
      username,
      meeting_id: meetingId,
      availability: availability || null,
      votes: ranks.map(r => ({
        movie_id: r.movieId,
        rank: r.rank
      })),
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await db.collection('ballots').add(ballotDoc);
    res.json({ success: true, ballotId: docRef.id });
  } catch (err) {
    res.status(400).json({ error: err.message || 'failed to save votes' });
  }
});

// Get votes endpoint
app.get('/votes', async (req, res) => {
  const meetingId = req.query.meetingId;
  if (!meetingId) return res.status(400).json({ error: 'meetingId query parameter is required' });

  try {
    const ballotsSnapshot = await db.collection('ballots').where('meeting_id', '==', meetingId).get();
    const votes = [];
    
    ballotsSnapshot.forEach(doc => {
      const data = doc.data();
      const vote = {
        id: doc.id,
        username: data.username,
        meeting_id: data.meeting_id,
        availability: data.availability,
        created_at: data.created_at,
        ranks: data.votes ? data.votes.map(v => ({
          rank: v.rank,
          movieId: v.movie_id
        })) : []
      };
      votes.push(vote);
    });

    res.json(votes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch votes' });
  }
});

// Delete vote endpoint (admin only)
app.delete('/votes/:id', requireAdmin, async (req, res) => {
  const voteId = req.params.id;
  
  try {
    const voteDoc = await db.collection('ballots').doc(voteId).get();
    if (!voteDoc.exists) {
      return res.status(404).json({ error: 'Vote not found' });
    }
    
    await db.collection('ballots').doc(voteId).delete();
    res.json({ success: true, message: 'Vote deleted successfully' });
    
  } catch (err) {
    console.error('Error deleting vote:', err);
    res.status(500).json({ error: 'Failed to delete vote' });
  }
});

// Results endpoint
app.get('/results', async (req, res) => {
  const meetingId = req.query.meetingId;
  
  try {
    let movies = await getMovies();
    
    // If meetingId is specified, filter movies by meeting's allowed_movie_ids
    if (meetingId) {
      const meetingDoc = await db.collection('meetings').doc(meetingId).get();
      if (meetingDoc.exists) {
        const meeting = meetingDoc.data();
        if (meeting.allowed_movie_ids && Array.isArray(meeting.allowed_movie_ids)) {
          // Filter movies to only those allowed for this meeting
          movies = movies.filter(movie => meeting.allowed_movie_ids.includes(movie.id));
        }
      }
    }
    
    const movieScores = {};
    const movieBallots = {};
    const movieVoteCounts = {};
    
    // Initialize scores
    movies.forEach(movie => {
      movieScores[movie.id] = 0;
      movieBallots[movie.id] = new Set();
      movieVoteCounts[movie.id] = 0;
    });
    
    // Get ballots (filtered by meeting if specified)
    let ballotsQuery = db.collection('ballots');
    if (meetingId) {
      ballotsQuery = ballotsQuery.where('meeting_id', '==', meetingId);
    }
    
    const ballotsSnapshot = await ballotsQuery.get();
    
    ballotsSnapshot.forEach(ballotDoc => {
      const ballot = ballotDoc.data();
      if (ballot.votes && Array.isArray(ballot.votes)) {
        ballot.votes.forEach(vote => {
          const score = 4 - vote.rank; // rank 1 -> 3 pts, rank 2 -> 2 pts, rank 3 -> 1 pt
          if (movieScores[vote.movie_id] !== undefined) {
            movieScores[vote.movie_id] += score;
            movieBallots[vote.movie_id].add(ballotDoc.id);
            movieVoteCounts[vote.movie_id]++;
          }
        });
      }
    });
    
    // Build results
    const results = movies.map(movie => ({
      ...movie,
      score: movieScores[movie.id] || 0,
      ballots: movieBallots[movie.id] ? movieBallots[movie.id].size : 0,
      vote_count: movieVoteCounts[movie.id] || 0
    }));
    
    // Sort by score desc, then vote_count desc
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.vote_count - a.vote_count;
    });
    
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

// Reviews endpoints
app.get('/movies/:id/reviews', async (req, res) => {
  const movieId = req.params.id;
  
  try {
    const reviewsSnapshot = await db.collection('reviews')
      .where('movie_id', '==', movieId)
      .get();
    
    const reviews = reviewsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Sort in memory by created_at desc
    reviews.sort((a, b) => {
      const aTime = a.created_at && a.created_at._seconds ? a.created_at._seconds : 0;
      const bTime = b.created_at && b.created_at._seconds ? b.created_at._seconds : 0;
      return bTime - aTime;
    });
    
    const count = reviews.length;
    const average = count > 0 ? 
      Number((reviews.reduce((sum, r) => sum + r.score, 0) / count).toFixed(2)) : 
      null;
    
    res.json({ count, average, reviews });
  } catch (error) {
    res.status(500).json({ error: 'failed to fetch reviews' });
  }
});

app.post('/movies/:id/reviews', async (req, res) => {
  const movieId = req.params.id;
  const { username, score, comment } = req.body || {};
  
  const s = Number(score);
  if (isNaN(s) || s < 0 || s > 10) {
    return res.status(400).json({ error: 'score must be a number between 0 and 10' });
  }
  
  try {
    const reviewDoc = {
      movie_id: movieId,
      username: username || null,
      score: s,
      comment: comment || null,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };
    
    const docRef = await db.collection('reviews').add(reviewDoc);
    
    // Fetch updated reviews and stats
    const reviewsSnapshot = await db.collection('reviews')
      .where('movie_id', '==', movieId)
      .get();
    
    const reviews = reviewsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Sort in memory by created_at desc
    reviews.sort((a, b) => {
      const aTime = a.created_at && a.created_at._seconds ? a.created_at._seconds : 0;
      const bTime = b.created_at && b.created_at._seconds ? b.created_at._seconds : 0;
      return bTime - aTime;
    });
    
    const count = reviews.length;
    const average = count > 0 ? 
      Number((reviews.reduce((sum, r) => sum + r.score, 0) / count).toFixed(2)) : 
      null;
    
    res.json({ success: true, reviewId: docRef.id, count, average, reviews });
  } catch (error) {
    res.status(500).json({ error: 'failed to save review' });
  }
});

// Delete review endpoint (admin only)
app.delete('/reviews/:id', requireAdmin, async (req, res) => {
  const reviewId = req.params.id;
  
  try {
    const reviewRef = db.collection('reviews').doc(reviewId);
    const reviewDoc = await reviewRef.get();
    
    if (!reviewDoc.exists) {
      return res.status(404).json({ error: 'Review not found' });
    }
    
    const reviewData = reviewDoc.data();
    const movieId = reviewData.movie_id;
    
    // Delete the review
    await reviewRef.delete();
    
    // Fetch updated reviews and stats for this movie
    const reviewsSnapshot = await db.collection('reviews')
      .where('movie_id', '==', movieId)
      .get();
    
    const reviews = reviewsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Sort in memory by created_at desc
    reviews.sort((a, b) => {
      const aTime = a.created_at && a.created_at._seconds ? a.created_at._seconds : 0;
      const bTime = b.created_at && b.created_at._seconds ? b.created_at._seconds : 0;
      return bTime - aTime;
    });
    
    const count = reviews.length;
    const average = count > 0 ? 
      Number((reviews.reduce((sum, r) => sum + r.score, 0) / count).toFixed(2)) : 
      null;
    
    res.json({ success: true, deleted: true, count, average, reviews });
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({ error: 'Failed to delete review' });
  }
});

// Serve cached poster images
app.get('/posters/:movieId', async (req, res) => {
  const movieId = req.params.movieId;
  
  try {
    const movieRef = db.collection('movies').doc(movieId);
    const movieDoc = await movieRef.get();
    
    if (!movieDoc.exists) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    
    const movie = movieDoc.data();
    
    // Check if we have cached poster data
    if (!movie.poster_cached_data) {
      // If no cached data, redirect to original poster URL
      if (movie.poster) {
        return res.redirect(movie.poster);
      } else {
        return res.status(404).json({ error: 'No poster available' });
      }
    }
    
    // Check if cache is still fresh (30 days)
    const CACHE_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
    const cacheDate = movie.poster_cached_date ? movie.poster_cached_date.toDate() : null;
    const isExpired = !cacheDate || (Date.now() - cacheDate.getTime()) > CACHE_DURATION_MS;
    
    if (isExpired && movie.poster_original_url) {
      // Cache expired - redirect to original URL for now
      return res.redirect(movie.poster_original_url);
    }
    
    // Serve cached image
    const imageBuffer = Buffer.from(movie.poster_cached_data, 'base64');
    const contentType = movie.poster_cached_content_type || 'image/jpeg';
    
    // Set appropriate cache headers
    res.set({
      'Content-Type': contentType,
      'Content-Length': imageBuffer.length,
      'Cache-Control': 'public, max-age=2592000', // Cache for 30 days
      'ETag': `"${movie.poster_cached_date ? movie.poster_cached_date.toMillis() : Date.now()}"`
    });
    
    res.send(imageBuffer);
    
  } catch (error) {
    console.error('Error serving cached poster:', error);
    res.status(500).json({ error: 'Failed to serve poster' });
  }
});

// Export the Express app as a Firebase Function  
exports.api = functions.https.onRequest(app);
