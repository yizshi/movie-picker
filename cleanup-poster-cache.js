require('dotenv').config();
const admin = require('firebase-admin');

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './distributed-denial-of-screen-firebase-adminsdk-fbsvc-3df1d3ff64.json';
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = admin.firestore();

async function cleanupPosterCache() {
  const snapshot = await db.collection('movies').get();
  if (snapshot.empty) {
    console.log('No movies found.');
    return;
  }

  let cleaned = 0;
  const batch = db.batch();
  
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    if (data.poster_cached_data || data.poster_cached_date || data.poster_cached_content_type) {
      batch.update(doc.ref, {
        poster_cached_data: admin.firestore.FieldValue.delete(),
        poster_cached_content_type: admin.firestore.FieldValue.delete(),
        poster_cached_date: admin.firestore.FieldValue.delete(),
        poster_original_url: admin.firestore.FieldValue.delete()
      });
      cleaned++;
    }
  });

  if (cleaned > 0) {
    await batch.commit();
    console.log(`Cleaned up poster cache from ${cleaned} movie(s).`);
    console.log('Estimated storage saved: ~1.2 MB');
  } else {
    console.log('No cached poster data found.');
  }
}

cleanupPosterCache().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
