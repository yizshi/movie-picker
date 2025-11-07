/**
 * Production-safe metadata backfill script
 * Can be run safely in production environments
 */

require('dotenv').config();

// Import appropriate server module based on environment
const isFirebase = process.env.NODE_ENV === 'firebase' || process.env.FUNCTIONS_EMULATOR;

async function productionBackfill() {
  console.log('🔄 Starting production metadata backfill...');
  
  if (!process.env.TMDB_API_KEY) {
    console.log('❌ TMDB_API_KEY not found in environment variables.');
    console.log('💡 Set it with: export TMDB_API_KEY=your_key_here');
    return;
  }

  if (isFirebase) {
    await backfillFirebase();
  } else {
    await backfillSQLite();
  }
}

async function backfillSQLite() {
  const Database = require('better-sqlite3');
  const path = require('path');
  
  const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'moviepicker.db');
  const db = new Database(DB_PATH);
  
  try {
    const movies = db.prepare(`
      SELECT id, title 
      FROM movies 
      WHERE (metadata IS NULL OR metadata = '')
      LIMIT 50
    `).all();
    
    console.log(`📊 Found ${movies.length} movies to update`);
    
    if (movies.length === 0) {
      console.log('✅ All movies already have metadata.');
      return;
    }
    
    const updateStmt = db.prepare('UPDATE movies SET metadata = ? WHERE id = ?');
    
    for (let i = 0; i < movies.length; i++) {
      const movie = movies[i];
      console.log(`🎬 Processing ${i + 1}/${movies.length}: ${movie.title}`);
      
      try {
        const metadata = await fetchMetadataFromTMDB(movie.title);
        
        if (metadata) {
          updateStmt.run(JSON.stringify(metadata), movie.id);
          console.log(`✅ Updated: ${movie.title}`);
        } else {
          console.log(`⚠️ No metadata found for: ${movie.title}`);
        }
        
        // Rate limiting - be nice to TMDB API
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`❌ Error updating ${movie.title}:`, error.message);
      }
    }
    
  } finally {
    db.close();
  }
}

async function backfillFirebase() {
  // Firebase backfill would go here
  console.log('🔥 Firebase backfill not implemented yet');
  console.log('💡 Use the Firebase Functions approach instead');
}

async function fetchMetadataFromTMDB(movieTitle) {
  const TMDB_API_KEY = process.env.TMDB_API_KEY;
  
  try {
    // Search for movie by title
    const searchUrl = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(movieTitle)}`;
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${TMDB_API_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    if (!searchResponse.ok) return null;

    const searchData = await searchResponse.json();
    if (!searchData.results || searchData.results.length === 0) return null;

    const movie = searchData.results[0];
    
    // Fetch detailed information
    const detailUrl = `https://api.themoviedb.org/3/movie/${movie.id}`;
    const detailResponse = await fetch(detailUrl, {
      headers: {
        'Authorization': `Bearer ${TMDB_API_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    if (detailResponse.ok) {
      const detailData = await detailResponse.json();
      
      return {
        release_year: detailData.release_date ? new Date(detailData.release_date).getFullYear() : null,
        runtime: detailData.runtime || null,
        rating: detailData.vote_average ? parseFloat(detailData.vote_average.toFixed(1)) : null,
        overview: detailData.overview || null,
        imdb_id: detailData.imdb_id || null
      };
    }

    return null;
  } catch (err) {
    console.error(`Error fetching metadata for "${movieTitle}":`, err.message);
    return null;
  }
}

// Check if this script is being run directly
if (require.main === module) {
  productionBackfill().catch(console.error);
}

module.exports = { productionBackfill, fetchMetadataFromTMDB };
