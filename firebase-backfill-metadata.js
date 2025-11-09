/**
 * Backfill metadata for existing movies in Firebase/Firestore
 * This will fetch and update metadata for movies that don't have it yet
 */

require('dotenv').config();
const admin = require('firebase-admin');
const fetch = require('node-fetch');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID
});

const db = admin.firestore();

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
        return { poster: null, genres: null, metadata: null };
      }

      const searchData = await searchResponse.json();
      if (!searchData.results || searchData.results.length === 0) {
        return { poster: null, genres: null, metadata: null };
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
    console.error('Error fetching movie data:', err.message);
    return { poster: null, genres: null, metadata: null };
  }
}

async function backfillFirebaseMetadata() {
  console.log('🔄 Starting Firebase metadata backfill...');
  
  try {
    // Get all movies
    const snapshot = await db.collection('movies').get();
    const movies = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`📊 Found ${movies.length} movies in Firebase`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const movie of movies) {
      // Skip if already has metadata
      if (movie.metadata && typeof movie.metadata === 'object' && movie.metadata.imdb_id) {
        console.log(`⏭️  Skipping "${movie.title}" - already has metadata`);
        skippedCount++;
        continue;
      }
      
      console.log(`🔍 Processing "${movie.title}"...`);
      
      // Try to get metadata from TMDB
      let searchQuery = movie.title;
      
      // If poster is an IMDB URL, use that for better matching
      if (movie.poster && movie.poster.includes('imdb.com')) {
        searchQuery = movie.poster;
      }
      
      const movieData = await fetchMovieData(searchQuery);
      
      if (movieData.metadata && movieData.metadata.imdb_id) {
        // Update the movie with new metadata
        const updates = {};
        
        if (movieData.poster && !movie.poster) {
          updates.poster = movieData.poster;
        }
        
        if (movieData.genres && (!movie.genres || (Array.isArray(movie.genres) && movie.genres.length === 0))) {
          updates.genres = movieData.genres;
        }
        
        if (movieData.metadata) {
          updates.metadata = movieData.metadata;
        }
        
        if (Object.keys(updates).length > 0) {
          await db.collection('movies').doc(movie.id).update(updates);
          console.log(`✅ Updated "${movie.title}" with metadata`);
          console.log(`   IMDB ID: ${movieData.metadata.imdb_id}`);
          console.log(`   Year: ${movieData.metadata.release_year}`);
          console.log(`   Rating: ${movieData.metadata.rating}/10`);
          updatedCount++;
        } else {
          console.log(`ℹ️  "${movie.title}" - no updates needed`);
          skippedCount++;
        }
      } else {
        console.log(`❌ Could not find metadata for "${movie.title}"`);
        skippedCount++;
      }
      
      // Add a small delay to be nice to the API
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    
    console.log('\n🎉 Backfill complete!');
    console.log(`   Updated: ${updatedCount} movies`);
    console.log(`   Skipped: ${skippedCount} movies`);
    
  } catch (error) {
    console.error('❌ Error during backfill:', error);
  }
}

// Run the backfill
backfillFirebaseMetadata()
  .then(() => {
    console.log('✅ Backfill finished');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  });
