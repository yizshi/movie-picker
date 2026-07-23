const admin = require('firebase-admin');
require('dotenv').config();

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

async function checkMovies() {
  console.log('🔍 Checking all movies in database...');
  
  const snapshot = await db.collection('movies').get();
  console.log(`📊 Total movies in database: ${snapshot.docs.length}`);
  
  const moviesByTitle = {};
  const moviesByImdbId = {};
  
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    
    console.log(`\n🎬 Movie ID: ${doc.id}`);
    console.log(`   Title: ${data.title}`);
    console.log(`   IMDB ID: ${data.imdb_id || 'MISSING'}`);
    
    if (data.suggestions && Array.isArray(data.suggestions)) {
      console.log(`   Suggestions (${data.suggestions.length}):`);
      data.suggestions.forEach((suggestion, index) => {
        console.log(`     ${index + 1}. ${suggestion.suggester}: "${suggestion.notes || 'No notes'}"`);
      });
    } else {
      console.log(`   Old format - Suggester: ${data.suggester || 'None'}, Notes: ${data.notes || 'None'}`);
    }
    
    // Track by title
    const titleKey = data.title?.toLowerCase();
    if (titleKey) {
      if (!moviesByTitle[titleKey]) moviesByTitle[titleKey] = [];
      moviesByTitle[titleKey].push({id: doc.id, imdb_id: data.imdb_id});
    }
    
    // Track by IMDB ID
    if (data.imdb_id) {
      if (!moviesByImdbId[data.imdb_id]) moviesByImdbId[data.imdb_id] = [];
      moviesByImdbId[data.imdb_id].push({id: doc.id, title: data.title});
    }
  });
  
  // Check for title duplicates
  console.log('\n🔍 Checking for duplicate titles...');
  let titleDuplicates = 0;
  for (const [title, movies] of Object.entries(moviesByTitle)) {
    if (movies.length > 1) {
      console.log(`⚠️  DUPLICATE TITLE: "${title}"`);
      movies.forEach(movie => {
        console.log(`   - ${movie.id} (IMDB: ${movie.imdb_id || 'MISSING'})`);
      });
      titleDuplicates++;
    }
  }
  
  // Check for IMDB ID duplicates
  console.log('\n🔍 Checking for duplicate IMDB IDs...');
  let imdbDuplicates = 0;
  for (const [imdbId, movies] of Object.entries(moviesByImdbId)) {
    if (movies.length > 1) {
      console.log(`⚠️  DUPLICATE IMDB ID: ${imdbId}`);
      movies.forEach(movie => {
        console.log(`   - ${movie.id}: "${movie.title}"`);
      });
      imdbDuplicates++;
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Total movies: ${snapshot.docs.length}`);
  console.log(`   Title duplicates: ${titleDuplicates}`);
  console.log(`   IMDB ID duplicates: ${imdbDuplicates}`);
}

// Run the script
checkMovies()
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
