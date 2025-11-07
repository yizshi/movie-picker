/**
 * Backfill metadata for movies by searching TMDB with movie title
 * This will work for movies that don't have IMDB URLs stored
 */

const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'moviepicker.db');

async function fetchMovieDataByTitle(movieTitle) {
  const TMDB_API_KEY = process.env.TMDB_API_KEY;
  if (!TMDB_API_KEY) {
    return { poster: null, genres: null, metadata: null };
  }

  try {
    // Search for movie by title
    const searchUrl = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(movieTitle)}`;
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${TMDB_API_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    if (!searchResponse.ok) {
      return { poster: null, genres: null, metadata: null };
    }

    const searchData = await searchResponse.json();
    if (!searchData.results || searchData.results.length === 0) {
      return { poster: null, genres: null, metadata: null };
    }

    // Take the first (most relevant) result
    const movie = searchData.results[0];
    const movieId = movie.id;
    
    // Now fetch detailed movie information
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
      const posterUrl = movie.poster_path ? `https://image.tmdb.org/t/p/original${movie.poster_path}` : null;
      
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

    return { poster: null, genres: null, metadata: null };
  } catch (err) {
    console.error(`Error fetching data for "${movieTitle}":`, err.message);
    return { poster: null, genres: null, metadata: null };
  }
}

async function backfillByTitle() {
  console.log('🔄 Starting metadata backfill by movie title...');
  
  if (!process.env.TMDB_API_KEY) {
    console.log('❌ TMDB_API_KEY not found. Please set it in your .env file.');
    return;
  }

  const db = new Database(DB_PATH);
  
  try {
    // Get movies that don't have metadata
    const movies = db.prepare(`
      SELECT id, title 
      FROM movies 
      WHERE (metadata IS NULL OR metadata = '')
    `).all();
    
    console.log(`📊 Found ${movies.length} movies without metadata`);
    
    if (movies.length === 0) {
      console.log('✅ All movies already have metadata.');
      return;
    }
    
    const updateStmt = db.prepare('UPDATE movies SET metadata = ?, genres = ?, poster = ? WHERE id = ?');
    
    for (let i = 0; i < movies.length; i++) {
      const movie = movies[i];
      console.log(`🎬 Processing ${i + 1}/${movies.length}: ${movie.title}`);
      
      try {
        const movieData = await fetchMovieDataByTitle(movie.title);
        
        if (movieData.metadata) {
          // Update with new poster URL and metadata
          updateStmt.run(
            movieData.metadata, 
            movieData.genres, 
            movieData.poster, 
            movie.id
          );
          console.log(`✅ Updated: ${movie.title}`);
        } else {
          console.log(`⚠️ No data found for: ${movie.title}`);
        }
        
        // Rate limiting - wait 250ms between requests
        await new Promise(resolve => setTimeout(resolve, 250));
        
      } catch (error) {
        console.error(`❌ Error updating ${movie.title}:`, error.message);
      }
    }
    
    console.log('🎉 Backfill by title completed!');
    
  } finally {
    db.close();
  }
}

// Run the backfill
backfillByTitle().catch(console.error);
