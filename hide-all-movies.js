require('dotenv').config();
const admin = require('firebase-admin');

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './distributed-denial-of-screen-firebase-adminsdk-fbsvc-3df1d3ff64.json';
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = admin.firestore();

async function hideAllMovies() {
  const snapshot = await db.collection('movies').get();
  if (snapshot.empty) {
    console.log('No movies found.');
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    batch.update(doc.ref, { hidden: true });
  });

  await batch.commit();
  console.log(`Hidden ${snapshot.size} movie(s).`);
}

hideAllMovies().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
