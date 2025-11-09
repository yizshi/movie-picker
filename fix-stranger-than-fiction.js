/**
 * Fix "Stranger than Fiction" metadata by targeting the correct Will Ferrell movie (2006)
 */

require('dotenv').config();
const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID
});

const db = admin.firestore();

async function fixStrangerThanFiction() {
  console.log('🔄 Fixing "Stranger than Fiction" metadata...');
  
  try {
    // Find the movie in Firebase
    const snapshot = await db.collection('movies')
      .where('title', '==', 'Stranger than Fiction')
      .get();
    
    if (snapshot.empty) {
      console.log('❌ Movie not found in database');
      return;
    }
    
    const movieDoc = snapshot.docs[0];
    const movie = { id: movieDoc.id, ...movieDoc.data() };
    
    console.log(`📽️ Found movie: "${movie.title}"`);
    console.log(`   Current metadata: ${movie.metadata ? 'Yes' : 'No'}`);
    
    // Manually set the correct metadata for Will Ferrell's "Stranger than Fiction" (2006)
    const correctMetadata = {
      release_year: 2006,
      runtime: 113,
      rating: 7.3,
      overview: "Harold Crick is a lonely IRS agent whose mundane existence is transformed when he hears a mysterious voice narrating his life.",
      imdb_id: "tt0420223"
    };
    
    // Update the movie
    await db.collection('movies').doc(movie.id).update({
      metadata: correctMetadata
    });
    
    console.log('✅ Successfully updated "Stranger than Fiction" with correct metadata');
    console.log(`   IMDB ID: ${correctMetadata.imdb_id}`);
    console.log(`   Year: ${correctMetadata.release_year}`);
    console.log(`   Rating: ${correctMetadata.rating}/10`);
    console.log(`   Runtime: ${correctMetadata.runtime} minutes`);
    
  } catch (error) {
    console.error('❌ Error fixing movie:', error);
  }
}

// Run the fix
fixStrangerThanFiction()
  .then(() => {
    console.log('✅ Fix completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Fix failed:', error);
    process.exit(1);
  });
