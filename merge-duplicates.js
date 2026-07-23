const admin = require('firebase-admin');
require('dotenv').config();

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

async function findAndMergeDuplicates() {
  console.log('🔍 Looking for duplicate movies...');
  
  const snapshot = await db.collection('movies').get();
  const moviesByImdbId = {};
  
  // Group movies by IMDB ID
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const imdbId = data.imdb_id;
    
    if (imdbId) {
      if (!moviesByImdbId[imdbId]) {
        moviesByImdbId[imdbId] = [];
      }
      moviesByImdbId[imdbId].push({
        id: doc.id,
        ref: doc.ref,
        data: data
      });
    }
  });
  
  const duplicates = [];
  
  // Find duplicates
  for (const [imdbId, movies] of Object.entries(moviesByImdbId)) {
    if (movies.length > 1) {
      console.log(`\n📽️  DUPLICATE: ${movies[0].data.title} (${imdbId})`);
      movies.forEach((movie, index) => {
        const suggester = movie.data.suggestions?.length > 0 
          ? movie.data.suggestions[0].suggester 
          : (movie.data.suggester || 'Unknown');
        console.log(`   ${index + 1}. ID: ${movie.id} - Suggested by: ${suggester}`);
      });
      duplicates.push({ imdbId, movies });
    }
  }
  
  console.log(`\n📊 Found ${duplicates.length} sets of duplicates`);
  
  if (duplicates.length === 0) {
    console.log('✅ No duplicates found!');
    return;
  }
  
  console.log('\n🔄 Merging duplicates...');
  
  for (const duplicate of duplicates) {
    await mergeDuplicateMovies(duplicate.movies);
  }
  
  console.log('\n✅ All duplicates merged successfully!');
}

async function mergeDuplicateMovies(movies) {
  // Keep the first movie as the primary
  const primaryMovie = movies[0];
  const duplicateMovies = movies.slice(1);
  
  console.log(`\n🔄 Merging ${movies.length} copies of "${primaryMovie.data.title}"`);
  
  // Collect all suggestions
  const allSuggestions = [];
  
  // Add suggestions from primary movie
  if (primaryMovie.data.suggestions && Array.isArray(primaryMovie.data.suggestions)) {
    allSuggestions.push(...primaryMovie.data.suggestions);
  } else if (primaryMovie.data.suggester || primaryMovie.data.notes) {
    // Convert old format to new format
    allSuggestions.push({
      suggester: primaryMovie.data.suggester || 'Anonymous',
      notes: primaryMovie.data.notes || null,
      created_at: primaryMovie.data.created_at || new Date()
    });
  }
  
  // Add suggestions from duplicate movies
  for (const movie of duplicateMovies) {
    if (movie.data.suggestions && Array.isArray(movie.data.suggestions)) {
      allSuggestions.push(...movie.data.suggestions);
    } else if (movie.data.suggester || movie.data.notes) {
      // Convert old format to new format
      allSuggestions.push({
        suggester: movie.data.suggester || 'Anonymous',
        notes: movie.data.notes || null,
        created_at: movie.data.created_at || new Date()
      });
    }
  }
  
  // Remove duplicate suggestions (same suggester)
  const uniqueSuggestions = [];
  const seenSuggesters = new Set();
  
  for (const suggestion of allSuggestions) {
    const key = `${suggestion.suggester}`;
    if (!seenSuggesters.has(key)) {
      seenSuggesters.add(key);
      uniqueSuggestions.push(suggestion);
    }
  }
  
  console.log(`   📝 Merging ${uniqueSuggestions.length} unique suggestions`);
  
  // Update primary movie with all suggestions
  const updateData = {
    suggestions: uniqueSuggestions
  };
  
  // Remove old fields if they exist
  if (primaryMovie.data.suggester !== undefined) {
    updateData.suggester = admin.firestore.FieldValue.delete();
  }
  if (primaryMovie.data.notes !== undefined) {
    updateData.notes = admin.firestore.FieldValue.delete();
  }
  
  await primaryMovie.ref.update(updateData);
  
  // Delete duplicate movies
  for (const movie of duplicateMovies) {
    console.log(`   🗑️  Deleting duplicate: ${movie.id}`);
    await movie.ref.delete();
  }
  
  console.log(`   ✅ Kept primary movie: ${primaryMovie.id} with ${uniqueSuggestions.length} suggestions`);
}

// Run the script
findAndMergeDuplicates()
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
