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

// Load environment variables (Firebase Functions supports .env files)
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Helper function to get movies from Firestore
async function getMovies() {
  try {
    // Remove orderBy to avoid index requirement issues, sort in memory instead
    const snapshot = await db.collection('movies').get();
    const movies = snapshot.docs.map(doc => {
      const data = doc.data();
      
      // Convert Firestore Timestamp to JavaScript Date string
      let created_at = null;
      if (data.created_at) {
        if (data.created_at._seconds) {
          // Firestore Timestamp format
          created_at = new Date(data.created_at._seconds * 1000).toISOString();
        } else if (data.created_at.toDate) {
          // Firestore Timestamp object with toDate method
          created_at = data.created_at.toDate().toISOString();
        } else if (typeof data.created_at === 'string') {
          // Already a string
          created_at = data.created_at;
        }
      }
      
      return {
        id: doc.id,
        ...data,
        created_at
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
    console.log('⚠️ TMDB_API_KEY not found in environment variables');
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
        const posterUrl = posterPath ? `https://image.tmdb.org/t/p/original${posterPath}` : null;
        
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
    const posterUrl = posterPath ? `https://image.tmdb.org/t/p/original${posterPath}` : null;
    return { poster: posterUrl, genres: null, metadata: null };
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

const adminTokens = new Map();
function genToken() { return crypto.randomBytes(24).toString('hex'); }

function requireAdmin(req, res, next) {
  const token = req.get('X-Admin-Token') || (req.get('Authorization') || '').replace(/^Bearer\s+/, '');
  if (!token) return res.status(401).json({ error: 'admin token required' });
  const exp = adminTokens.get(token);
  if (!exp) return res.status(401).json({ error: 'invalid token' });
  if (Date.now() > exp) { 
    adminTokens.delete(token); 
    return res.status(401).json({ error: 'token expired' }); 
  }
  req.admin = true;
  next();
}

// Admin login
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
  if (!exp || Date.now() > exp) { 
    if (exp) adminTokens.delete(token); 
    return res.json({ admin: false }); 
  }
  res.json({ admin: true });
});

// Movies endpoints
app.get('/api/movies', async (req, res) => {
  try {
    const movies = await getMovies();
    res.json(movies);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch movies' });
  }
});

app.post('/api/movies', async (req, res) => {
  const { title, poster, notes, suggester } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  const imdbMatch = poster && typeof poster === 'string' && poster.match(/imdb\.com\/title\/(tt\d+)/i);
  if (!imdbMatch) {
    return res.status(400).json({ error: 'poster must be an IMDB movie link (https://www.imdb.com/title/tt...)' });
  }

  try {
    let finalPosterUrl = poster;
    let finalGenres = null;
    let finalMetadata = null;

    if (poster && typeof poster === 'string' && poster.includes('imdb.com')) {
      const movieData = await fetchMovieData(poster);
      if (movieData.poster) finalPosterUrl = movieData.poster;
      if (movieData.genres) finalGenres = movieData.genres;
      if (movieData.metadata) finalMetadata = movieData.metadata;
    }

    if (!finalPosterUrl) {
      const movieData = await fetchMovieData(title);
      if (movieData.poster) finalPosterUrl = movieData.poster;
      if (movieData.genres) finalGenres = movieData.genres;
      if (movieData.metadata) finalMetadata = movieData.metadata;
    }

    const movieDoc = {
      title,
      poster: finalPosterUrl || null,
      genres: finalGenres || null,
      metadata: finalMetadata || null,
      notes: notes || null,
      suggester: suggester || null,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await db.collection('movies').add(movieDoc);
    const movie = await docRef.get();
    
    res.json({
      id: movie.id,
      ...movie.data()
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create movie' });
  }
});

app.delete('/api/movies/:id', requireAdmin, async (req, res) => {
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
app.get('/api/meetings', async (req, res) => {
  try {
    // Remove orderBy to avoid index requirement issues, sort in memory instead
    const snapshot = await db.collection('meetings').get();
    const meetings = [];
    
    for (const doc of snapshot.docs) {
      const meeting = {
        id: doc.id,
        ...doc.data()
      };
      
      // Get watched movie data if exists
      if (meeting.watched_movie_id) {
        try {
          const movieDoc = await db.collection('movies').doc(meeting.watched_movie_id).get();
          meeting.watched_movie = movieDoc.exists ? { id: movieDoc.id, ...movieDoc.data() } : null;
        } catch (e) {
          meeting.watched_movie = null;
        }
      } else {
        meeting.watched_movie = null;
      }
      
      // Compute vote counts per candidate day
      try {
        const ballotsSnapshot = await db.collection('ballots')
          .where('meeting_id', '==', doc.id)
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
        
        meeting.date_counts = Object.entries(dateCounts)
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => b.count - a.count);
      } catch (e) {
        meeting.date_counts = [];
      }
      
      meetings.push(meeting);
    }
    
    // Sort meetings in memory by date desc, then created_at desc
    meetings.sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date);
      if (a.date && !b.date) return -1;
      if (!a.date && b.date) return 1;
      
      // Fallback to created_at if available
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

app.get('/api/meetings/:id', async (req, res) => {
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

app.post('/api/meetings', requireAdmin, async (req, res) => {
  const { name, date, candidate_days, allowed_movie_ids, voting_open, watched_movie_id } = req.body;
  
  try {
    const meetingDoc = {
      name: name || null,
      date: date || null,
      candidate_days: candidate_days || [],
      allowed_movie_ids: allowed_movie_ids || null,
      voting_open: voting_open ? true : false,
      watched_movie_id: watched_movie_id || null,
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

app.patch('/api/meetings/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  const { voting_open, name, candidate_days, allowed_movie_ids } = req.body || {};
  
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

app.delete('/api/meetings/:id', requireAdmin, async (req, res) => {
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

app.post('/api/meetings/:id/watched', requireAdmin, async (req, res) => {
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
app.post('/api/votes', async (req, res) => {
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

// Results endpoint
app.get('/api/results', async (req, res) => {
  const meetingId = req.query.meetingId;
  
  try {
    const movies = await getMovies();
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
app.get('/api/movies/:id/reviews', async (req, res) => {
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

app.post('/api/movies/:id/reviews', async (req, res) => {
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

// Export the Express app as a Firebase Function
exports.api = functions.https.onRequest(app);
