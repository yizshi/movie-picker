/**
 * Backfill metadata for existing movies with IMDB links
 * This will fetch and update metadata for movies that don't have it yet
 */

const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'moviepicker.db');

// Import the fetchMovieData function from server.js
const http = require('http');

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
        
        const findResponse = await fetch(findUrl, {
          headers: {
            'Authorization': `Bearer ${TMDB_API_KEY}`,
            'Accept': 'application/json'
          }
        });
        
        if (findResponse.ok) {
          const findData = await findResponse.json();
          if (findData.movie_results && findData.movie_results.length > 0) {
            const movie = findData.movie_results[0];
            movieId = movie.id;
            posterPath = movie.poster_path;
          }
        }
      }
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
          genres: genres.length > 0 ? JSON.stringify(genres) : null,
          metadata: JSON.stringify(metadata)
        };
      }
    }

    return { poster: null, genres: null, metadata: null };
  } catch (err) {
    return { poster: null, genres: null, metadata: null };
  }
}

async function backfillMetadata() {
  console.log('🔄 Starting metadata backfill...');
  
  if (!process.env.TMDB_API_KEY) {
    console.log('❌ TMDB_API_KEY not found. Please set it in your .env file.');
    return;
  }

  const db = new Database(DB_PATH);
  
  try {
    // Get movies that have IMDB poster URLs but no metadata
    const movies = db.prepare(`
      SELECT id, title, poster 
      FROM movies 
      WHERE (metadata IS NULL OR metadata = '') 
      AND poster LIKE '%imdb.com%'
    `).all();
    
    console.log(`📊 Found ${movies.length} movies to update`);
    
    if (movies.length === 0) {
      console.log('✅ No movies need metadata updates.');
      return;
    }
    
    const updateStmt = db.prepare('UPDATE movies SET metadata = ?, genres = ? WHERE id = ?');
    
    for (let i = 0; i < movies.length; i++) {
      const movie = movies[i];
      console.log(`🎬 Processing ${i + 1}/${movies.length}: ${movie.title}`);
      
      try {
        const movieData = await fetchMovieData(movie.poster);
        
        if (movieData.metadata) {
          updateStmt.run(movieData.metadata, movieData.genres, movie.id);
          console.log(`✅ Updated metadata for: ${movie.title}`);
        } else {
          console.log(`⚠️ No metadata found for: ${movie.title}`);
        }
        
        // Rate limiting - wait 250ms between requests
        await new Promise(resolve => setTimeout(resolve, 250));
        
      } catch (error) {
        console.error(`❌ Error updating ${movie.title}:`, error.message);
      }
    }
    
    console.log('🎉 Backfill completed!');
    
  } finally {
    db.close();
  }
}

// Run the backfill
backfillMetadata().catch(console.error);
