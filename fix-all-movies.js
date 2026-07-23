const admin = require('firebase-admin');
const fetch = require('node-fetch');
require('dotenv').config();

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// TMDB API for getting IMDB IDs
const TMDB_API_KEY = process.env.TMDB_API_KEY;

async function searchTMDBForImdbId(title) {
  if (!TMDB_API_KEY) {
    console.log('⚠️  No TMDB API key found');
    return null;
  }
  
  try {
    const searchUrl = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(title)}`;
    const response = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${TMDB_API_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.results || data.results.length === 0) return null;
    
    // Get the first result's details to get IMDB ID
    const movieId = data.results[0].id;
    const detailUrl = `https://api.themoviedb.org/3/movie/${movieId}`;
    const detailResponse = await fetch(detailUrl, {
      headers: {
        'Authorization': `Bearer ${TMDB_API_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    if (!detailResponse.ok) return null;
    
    const detailData = await detailResponse.json();
    return detailData.imdb_id || null;
  } catch (error) {
    console.log(`❌ Error searching for ${title}:`, error.message);
    return null;
  }
}

async function fixAllMovies() {
  console.log('🔧 Starting comprehensive movie fix...');
  
  const snapshot = await db.collection('movies').get();
  console.log(`📊 Total movies to process: ${snapshot.docs.length}`);
  
  // Step 1: Merge title duplicates
  console.log('\n📚 Step 1: Merging title duplicates...');
  await mergeTitleDuplicates(snapshot.docs);
  
  // Step 2: Add missing IMDB IDs and convert to new format
  console.log('\n🆔 Step 2: Adding missing IMDB IDs and converting format...');
  const freshSnapshot = await db.collection('movies').get();
  await fixMissingImdbIds(freshSnapshot.docs);
  
  // Step 3: Final check for IMDB ID duplicates
  console.log('\n🔍 Step 3: Final check and merge any IMDB duplicates...');
  const finalSnapshot = await db.collection('movies').get();
  await mergeImdbDuplicates(finalSnapshot.docs);
  
  console.log('\n✅ All movies fixed!');
}

async function mergeTitleDuplicates(docs) {
  const moviesByTitle = {};
  
  // Group by title (case insensitive)
  docs.forEach(doc => {
    const data = doc.data();
    const titleKey = data.title?.toLowerCase().trim();
    if (titleKey) {
      if (!moviesByTitle[titleKey]) moviesByTitle[titleKey] = [];
      moviesByTitle[titleKey].push({ id: doc.id, ref: doc.ref, data });
    }
  });
  
  // Find and merge duplicates
  for (const [title, movies] of Object.entries(moviesByTitle)) {
    if (movies.length > 1) {
      console.log(`🎬 Merging ${movies.length} copies of "${title}"`);
      await mergeMovieGroup(movies);
    }
  }
}

async function fixMissingImdbIds(docs) {
  for (const doc of docs) {
    const data = doc.data();
    
    // Skip if already has IMDB ID
    if (data.imdb_id) {
      console.log(`✓ "${data.title}" already has IMDB ID`);
      continue;
    }
    
    console.log(`🔍 Searching IMDB ID for "${data.title}"...`);
    
    // Try to get IMDB ID from TMDB
    const imdbId = await searchTMDBForImdbId(data.title);
    
    const updates = {};
    
    // Add IMDB ID if found
    if (imdbId) {
      updates.imdb_id = imdbId;
      console.log(`   ✅ Found IMDB ID: ${imdbId}`);
    } else {
      console.log(`   ⚠️  No IMDB ID found`);
    }
    
    // Convert to new suggestions format if needed
    if (!data.suggestions && (data.suggester || data.notes)) {
      console.log(`   🔄 Converting to new suggestions format`);
      updates.suggestions = [{
        suggester: data.suggester || 'Anonymous',
        notes: data.notes || null,
        created_at: data.created_at || new Date()
      }];
      updates.suggester = admin.firestore.FieldValue.delete();
      updates.notes = admin.firestore.FieldValue.delete();
    }
    
    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      await doc.ref.update(updates);
      console.log(`   ✅ Updated "${data.title}"`);
    }
    
    // Rate limit to avoid hitting TMDB API limits
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function mergeImdbDuplicates(docs) {
  const moviesByImdbId = {};
  
  // Group by IMDB ID
  docs.forEach(doc => {
    const data = doc.data();
    if (data.imdb_id) {
      if (!moviesByImdbId[data.imdb_id]) moviesByImdbId[data.imdb_id] = [];
      moviesByImdbId[data.imdb_id].push({ id: doc.id, ref: doc.ref, data });
    }
  });
  
  // Find and merge duplicates
  for (const [imdbId, movies] of Object.entries(moviesByImdbId)) {
    if (movies.length > 1) {
      console.log(`🎬 Merging ${movies.length} copies with IMDB ID ${imdbId}`);
      await mergeMovieGroup(movies);
    }
  }
}

async function mergeMovieGroup(movies) {
  // Keep the movie with the most complete data as primary
  const primaryMovie = movies.reduce((best, current) => {
    const bestScore = scoreMovie(best.data);
    const currentScore = scoreMovie(current.data);
    return currentScore > bestScore ? current : best;
  });
  
  const duplicateMovies = movies.filter(m => m.id !== primaryMovie.id);
  
  console.log(`   📝 Keeping primary: ${primaryMovie.id} - "${primaryMovie.data.title}"`);
  
  // Collect all suggestions
  const allSuggestions = [];
  
  // Add suggestions from all movies
  for (const movie of movies) {
    if (movie.data.suggestions && Array.isArray(movie.data.suggestions)) {
      allSuggestions.push(...movie.data.suggestions);
    } else if (movie.data.suggester || movie.data.notes) {
      // Convert old format
      allSuggestions.push({
        suggester: movie.data.suggester || 'Anonymous',
        notes: movie.data.notes || null,
        created_at: movie.data.created_at || new Date()
      });
    }
  }
  
  // Remove duplicate suggestions (by suggester name)
  const uniqueSuggestions = [];
  const seenSuggesters = new Set();
  
  for (const suggestion of allSuggestions) {
    const key = suggestion.suggester?.toLowerCase() || 'anonymous';
    if (!seenSuggesters.has(key)) {
      seenSuggesters.add(key);
      uniqueSuggestions.push(suggestion);
    }
  }
  
  console.log(`   👥 Merged ${uniqueSuggestions.length} unique suggestions`);
  
  // Update primary movie
  const updateData = {
    suggestions: uniqueSuggestions
  };
  
  // Remove old format fields if they exist
  if (primaryMovie.data.suggester !== undefined) {
    updateData.suggester = admin.firestore.FieldValue.delete();
  }
  if (primaryMovie.data.notes !== undefined) {
    updateData.notes = admin.firestore.FieldValue.delete();
  }
  
  await primaryMovie.ref.update(updateData);
  
  // Delete duplicates
  for (const movie of duplicateMovies) {
    console.log(`   🗑️  Deleting duplicate: ${movie.id}`);
    await movie.ref.delete();
  }
}

// Score a movie's completeness (higher = better)
function scoreMovie(data) {
  let score = 0;
  if (data.imdb_id) score += 10;
  if (data.poster) score += 5;
  if (data.genres) score += 3;
  if (data.metadata) score += 3;
  if (data.suggestions && Array.isArray(data.suggestions)) score += 2;
  if (data.created_at) score += 1;
  return score;
}

// Run the script
fixAllMovies()
  .then(() => {
    console.log('\n🎉 All done! Movies should now be properly deduplicated.');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
