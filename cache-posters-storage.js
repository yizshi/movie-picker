/**
 * Poster Caching System with Firebase Storage
 * Downloads and caches poster images in Firebase Storage with 30-day refresh policy
 */

require('dotenv').config();
const admin = require('firebase-admin');
const fetch = require('node-fetch');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: 'distributed-denial-of-screen.appspot.com'
});

const db = admin.firestore();
const storage = admin.storage();
const bucket = storage.bucket(); // Uses default bucket

// Cache configuration
const CACHE_DURATION_DAYS = 30;
const CACHE_DURATION_MS = CACHE_DURATION_DAYS * 24 * 60 * 60 * 1000;

async function downloadAndCacheImage(imageUrl, movieId, movieTitle) {
  try {
    console.log(`    📥 Downloading image from: ${imageUrl}`);
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      throw new Error(`Invalid content type: ${contentType}`);
    }
    
    const buffer = await response.buffer();
    
    // Generate storage path
    const fileExtension = contentType.includes('jpeg') ? 'jpg' : 
                         contentType.includes('png') ? 'png' : 
                         contentType.includes('webp') ? 'webp' : 'jpg';
    const storagePath = `movie-posters/${movieId}.${fileExtension}`;
    
    // Upload to Firebase Storage
    const file = bucket.file(storagePath);
    
    await file.save(buffer, {
      metadata: {
        contentType: contentType,
        metadata: {
          movieId: movieId,
          movieTitle: movieTitle,
          cachedDate: new Date().toISOString(),
          originalUrl: imageUrl
        }
      }
    });
    
    // Make the file publicly readable
    await file.makePublic();
    
    // Get the public URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
    
    console.log(`    ✅ Cached to Storage: ${storagePath} (${Math.round(buffer.length / 1024)}KB)`);
    
    return {
      cachedUrl: publicUrl,
      storagePath: storagePath,
      contentType: contentType,
      size: buffer.length
    };
  } catch (error) {
    console.error(`    ❌ Failed to cache image: ${error.message}`);
    return null;
  }
}

function shouldRefreshCache(posterCachedDate) {
  if (!posterCachedDate) return true;
  
  const cacheDate = posterCachedDate.toDate ? posterCachedDate.toDate() : new Date(posterCachedDate);
  const now = new Date();
  const timeDiff = now - cacheDate;
  
  return timeDiff > CACHE_DURATION_MS;
}

async function cacheMoviePosters() {
  console.log('🎬 Starting poster caching process with Firebase Storage...');
  console.log(`📅 Cache refresh policy: ${CACHE_DURATION_DAYS} days\n`);
  
  try {
    // Get all movies
    const snapshot = await db.collection('movies').get();
    const movies = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`📊 Found ${movies.length} movies to process\n`);
    
    let cachedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const movie of movies) {
      console.log(`🎭 Processing: "${movie.title}"`);
      
      // Check if poster needs caching/refresh
      const needsCache = !movie.poster_cached_url || shouldRefreshCache(movie.poster_cached_date);
      
      if (!needsCache) {
        console.log(`    ⏭️  Skipping - cached poster is still fresh`);
        skippedCount++;
        continue;
      }
      
      if (!movie.poster || !movie.poster.startsWith('http')) {
        console.log(`    ⚠️  Skipping - no valid poster URL`);
        skippedCount++;
        continue;
      }
      
      // Download and cache the image
      const cacheResult = await downloadAndCacheImage(movie.poster, movie.id, movie.title);
      
      if (cacheResult) {
        // Update movie with cached data
        const updateData = {
          poster_cached_url: cacheResult.cachedUrl,
          poster_cached_storage_path: cacheResult.storagePath,
          poster_cached_content_type: cacheResult.contentType,
          poster_cached_size: cacheResult.size,
          poster_cached_date: admin.firestore.FieldValue.serverTimestamp(),
          poster_original_url: movie.poster // Keep original URL for reference
        };
        
        await db.collection('movies').doc(movie.id).update(updateData);
        
        console.log(`    💾 Updated movie record with cached URL`);
        cachedCount++;
      } else {
        console.log(`    ❌ Failed to cache poster`);
        errorCount++;
      }
      
      // Add small delay to be nice to servers
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log('\n🎉 Poster caching complete!');
    console.log(`   📥 Cached: ${cachedCount} posters`);
    console.log(`   ⏭️  Skipped: ${skippedCount} posters`);
    console.log(`   ❌ Errors: ${errorCount} posters`);
    
  } catch (error) {
    console.error('❌ Error during poster caching:', error);
  }
}

// Run the caching process
cacheMoviePosters()
  .then(() => {
    console.log('✅ Poster caching finished');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Poster caching failed:', error);
    process.exit(1);
  });
