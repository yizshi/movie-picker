const Database = require('better-sqlite3');
const admin = require('firebase-admin');
const path = require('path');

require('dotenv').config();

// Initialize Firebase Admin
let serviceAccount;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    // If using service account key from environment
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // If using service account key file
    serviceAccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }
} catch (error) {
  console.error('Error loading Firebase service account:', error.message);
  console.log('Please set FIREBASE_SERVICE_ACCOUNT_KEY or GOOGLE_APPLICATION_CREDENTIALS environment variable');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id
  });
}

const firestore = admin.firestore();

// Open SQLite database
const DB_PATH = path.join(__dirname, 'moviepicker.db');
let sqlite;

try {
  sqlite = new Database(DB_PATH, { readonly: true });
  console.log('✅ Connected to SQLite database');
} catch (error) {
  console.error('❌ Error connecting to SQLite database:', error.message);
  console.log('Make sure moviepicker.db exists in the project root');
  process.exit(1);
}

async function migrateMovies() {
  console.log('\n📽️  Migrating movies...');
  
  try {
    const movies = sqlite.prepare('SELECT * FROM movies ORDER BY created_at ASC').all();
    console.log(`Found ${movies.length} movies to migrate`);
    
    if (movies.length === 0) {
      console.log('No movies to migrate');
      return {};
    }
    
    const movieIdMap = {};
    const batch = firestore.batch();
    
    for (const movie of movies) {
      const movieRef = firestore.collection('movies').doc();
      movieIdMap[movie.id] = movieRef.id;
      
      const movieData = {
        title: movie.title,
        poster: movie.poster,
        genres: movie.genres,
        notes: movie.notes,
        suggester: movie.suggester,
        created_at: movie.created_at ? admin.firestore.Timestamp.fromDate(new Date(movie.created_at)) : admin.firestore.FieldValue.serverTimestamp()
      };
      
      batch.set(movieRef, movieData);
      console.log(`  • ${movie.title} (${movie.id} → ${movieRef.id})`);
    }
    
    await batch.commit();
    console.log(`✅ Successfully migrated ${movies.length} movies`);
    return movieIdMap;
  } catch (error) {
    console.error('❌ Error migrating movies:', error.message);
    throw error;
  }
}

async function migrateMeetings(movieIdMap) {
  console.log('\n📅 Migrating meetings...');
  
  try {
    const meetings = sqlite.prepare('SELECT * FROM meetings ORDER BY created_at ASC').all();
    console.log(`Found ${meetings.length} meetings to migrate`);
    
    if (meetings.length === 0) {
      console.log('No meetings to migrate');
      return {};
    }
    
    const meetingIdMap = {};
    const batch = firestore.batch();
    
    for (const meeting of meetings) {
      const meetingRef = firestore.collection('meetings').doc();
      meetingIdMap[meeting.id] = meetingRef.id;
      
      // Parse JSON fields
      let candidateDays = [];
      let allowedMovieIds = null;
      
      try {
        candidateDays = meeting.candidate_days ? JSON.parse(meeting.candidate_days) : [];
      } catch (e) {
        candidateDays = [];
      }
      
      try {
        if (meeting.allowed_movie_ids) {
          const sqliteMovieIds = JSON.parse(meeting.allowed_movie_ids);
          allowedMovieIds = sqliteMovieIds.map(id => movieIdMap[id]).filter(Boolean);
        }
      } catch (e) {
        allowedMovieIds = null;
      }
      
      const meetingData = {
        name: meeting.name,
        date: meeting.date,
        candidate_days: candidateDays,
        allowed_movie_ids: allowedMovieIds,
        voting_open: Boolean(meeting.voting_open),
        watched_movie_id: meeting.watched_movie_id ? movieIdMap[meeting.watched_movie_id] : null,
        created_at: meeting.created_at ? admin.firestore.Timestamp.fromDate(new Date(meeting.created_at)) : admin.firestore.FieldValue.serverTimestamp()
      };
      
      batch.set(meetingRef, meetingData);
      console.log(`  • ${meeting.name || 'Unnamed Meeting'} (${meeting.id} → ${meetingRef.id})`);
    }
    
    await batch.commit();
    console.log(`✅ Successfully migrated ${meetings.length} meetings`);
    return meetingIdMap;
  } catch (error) {
    console.error('❌ Error migrating meetings:', error.message);
    throw error;
  }
}

async function migrateBallots(movieIdMap, meetingIdMap) {
  console.log('\n🗳️  Migrating ballots...');
  
  try {
    const ballots = sqlite.prepare(`
      SELECT b.*, GROUP_CONCAT(bv.movie_id || ':' || bv.rank) as votes_data
      FROM ballots b
      LEFT JOIN ballot_votes bv ON b.id = bv.ballot_id
      GROUP BY b.id
      ORDER BY b.created_at ASC
    `).all();
    
    console.log(`Found ${ballots.length} ballots to migrate`);
    
    if (ballots.length === 0) {
      console.log('No ballots to migrate');
      return;
    }
    
    const batch = firestore.batch();
    
    for (const ballot of ballots) {
      const ballotRef = firestore.collection('ballots').doc();
      
      // Parse votes data
      const votes = [];
      if (ballot.votes_data) {
        const voteEntries = ballot.votes_data.split(',');
        for (const entry of voteEntries) {
          const [movieId, rank] = entry.split(':');
          if (movieId && rank && movieIdMap[movieId]) {
            votes.push({
              movie_id: movieIdMap[movieId],
              rank: parseInt(rank)
            });
          }
        }
      }
      
      // Parse availability
      let availability = null;
      try {
        availability = ballot.availability ? JSON.parse(ballot.availability) : null;
      } catch (e) {
        availability = null;
      }
      
      const ballotData = {
        username: ballot.username,
        meeting_id: ballot.meeting_id ? meetingIdMap[ballot.meeting_id] : null,
        availability: availability,
        votes: votes,
        created_at: ballot.created_at ? admin.firestore.Timestamp.fromDate(new Date(ballot.created_at)) : admin.firestore.FieldValue.serverTimestamp()
      };
      
      batch.set(ballotRef, ballotData);
      console.log(`  • ${ballot.username}'s ballot with ${votes.length} votes`);
    }
    
    await batch.commit();
    console.log(`✅ Successfully migrated ${ballots.length} ballots`);
  } catch (error) {
    console.error('❌ Error migrating ballots:', error.message);
    throw error;
  }
}

async function migrateReviews(movieIdMap) {
  console.log('\n⭐ Migrating reviews...');
  
  try {
    const reviews = sqlite.prepare('SELECT * FROM reviews ORDER BY created_at ASC').all();
    console.log(`Found ${reviews.length} reviews to migrate`);
    
    if (reviews.length === 0) {
      console.log('No reviews to migrate');
      return;
    }
    
    const batch = firestore.batch();
    
    for (const review of reviews) {
      if (!movieIdMap[review.movie_id]) {
        console.log(`  ⚠️  Skipping review for unknown movie ID ${review.movie_id}`);
        continue;
      }
      
      const reviewRef = firestore.collection('reviews').doc();
      
      const reviewData = {
        movie_id: movieIdMap[review.movie_id],
        username: review.username,
        score: review.score,
        comment: review.comment,
        created_at: review.created_at ? admin.firestore.Timestamp.fromDate(new Date(review.created_at)) : admin.firestore.FieldValue.serverTimestamp()
      };
      
      batch.set(reviewRef, reviewData);
      console.log(`  • ${review.username}'s review (${review.score}/10) for movie ${review.movie_id}`);
    }
    
    await batch.commit();
    console.log(`✅ Successfully migrated ${reviews.length} reviews`);
  } catch (error) {
    console.error('❌ Error migrating reviews:', error.message);
    throw error;
  }
}

async function main() {
  console.log('🚀 Starting migration from SQLite to Firestore...\n');
  
  try {
    // Step 1: Migrate movies (and get ID mapping)
    const movieIdMap = await migrateMovies();
    
    // Step 2: Migrate meetings (using movie ID mapping)
    const meetingIdMap = await migrateMeetings(movieIdMap);
    
    // Step 3: Migrate ballots (using both movie and meeting ID mappings)
    await migrateBallots(movieIdMap, meetingIdMap);
    
    // Step 4: Migrate reviews (using movie ID mapping)
    await migrateReviews(movieIdMap);
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Set up your Firebase project and credentials');
    console.log('2. Test the Firebase version with: npm run start:firebase');
    console.log('3. Deploy to Firebase with: npm run deploy');
    
  } catch (error) {
    console.error('\n💥 Migration failed:', error.message);
    process.exit(1);
  } finally {
    sqlite.close();
    console.log('\n🔐 SQLite connection closed');
  }
}

// Run the migration
main();
