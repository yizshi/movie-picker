/**
 * Simple Poster Caching System
 * Downloads smaller TMDB poster images and caches them in Firestore with 30-day refresh policy
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

// Cache configuration
const CACHE_DURATION_DAYS = 30;
const CACHE_DURATION_MS = CACHE_DURATION_DAYS * 24 * 60 * 60 * 1000;

// TMDB image size configurations (from smallest to largest)
const TMDB_POSTER_SIZES = [
  'w92',    // 92px wide
  'w154',   // 154px wide
  'w185',   // 185px wide
  'w342',   // 342px wide (good balance)
  'w500',   // 500px wide
  'w780',   // 780px wide
  'original' // Full size
];

function getOptimizedPosterUrl(originalUrl) {
  // Convert TMDB original URL to w342 (smaller) version
  if (originalUrl && originalUrl.includes('image.tmdb.org') && originalUrl.includes('/original/')) {
    return originalUrl.replace('/original/', '/w342/');
  }
  return originalUrl;
}

async function downloadPosterImage(imageUrl) {
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
    const sizeKB = Math.round(buffer.length / 1024);
    console.log(`    📏 Downloaded ${sizeKB}KB`);
    
    // Check if image is small enough for Firestore (max ~900KB base64)
    const base64Data = buffer.toString('base64');
    const base64SizeKB = Math.round(base64Data.length / 1024);
    
    if (base64Data.length > 900000) { // ~900KB limit
      throw new Error(`Image too large for Firestore: ${base64SizeKB}KB`);
    }
    
    console.log(`    ✅ Base64 size: ${base64SizeKB}KB (within limit)`);
    
    return {
      data: base64Data,
      contentType: contentType,
      size: buffer.length
    };
  } catch (error) {
    console.error(`    ❌ Failed to download image: ${error.message}`);
    return null;
  }
}

function shouldRefreshCache(posterCachedDate) {
  if (!posterCachedDate) return true;
  
  const cacheDate = posterCachedDate.toDate ? posterCachedDate.toDate() : new Date(posterCachedDate);
  const now = new Date();
  const timeDiff = now - cacheDate;
  const daysOld = Math.floor(timeDiff / (24 * 60 * 60 * 1000));
  
  if (daysOld > 0) {
    console.log(`    📅 Cache age: ${daysOld} days`);
  }
  return timeDiff > CACHE_DURATION_MS;
}

async function cacheMoviePosters() {
  console.log('🎬 Starting simple poster caching process...');
  console.log(`📅 Cache refresh policy: ${CACHE_DURATION_DAYS} days`);
  console.log(`🖼️  Using TMDB w342 (342px) poster size for efficiency\n`);
  
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
      const needsCache = !movie.poster_cached_data || shouldRefreshCache(movie.poster_cached_date);
      
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
      
      // Use optimized (smaller) poster URL
      const optimizedUrl = getOptimizedPosterUrl(movie.poster);
      console.log(`    🔄 Using optimized URL: ${optimizedUrl === movie.poster ? 'same' : 'w342'}`);
      
      // Download and cache the image
      const imageData = await downloadPosterImage(optimizedUrl);
      
      if (imageData) {
        // Update movie with cached data
        const updateData = {
          poster_cached_data: imageData.data,
          poster_cached_content_type: imageData.contentType,
          poster_cached_size: imageData.size,
          poster_cached_date: admin.firestore.FieldValue.serverTimestamp(),
          poster_original_url: movie.poster, // Keep original URL for reference
          poster_optimized_url: optimizedUrl // Track which URL was cached
        };
        
        await db.collection('movies').doc(movie.id).update(updateData);
        
        console.log(`    💾 Cached poster (${Math.round(imageData.size / 1024)}KB)`);
        cachedCount++;
      } else {
        console.log(`    ❌ Failed to cache poster`);
        errorCount++;
      }
      
      // Add delay to be nice to servers
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log('\n🎉 Poster caching complete!');
    console.log(`   📥 Cached: ${cachedCount} posters`);
    console.log(`   ⏭️  Skipped: ${skippedCount} posters`);
    console.log(`   ❌ Errors: ${errorCount} posters`);
    
    // Show cache statistics
    if (cachedCount > 0) {
      console.log('\n📊 Cache Statistics:');
      const updatedSnapshot = await db.collection('movies').get();
      const moviesWithCache = updatedSnapshot.docs.map(doc => doc.data()).filter(m => m.poster_cached_data);
      
      if (moviesWithCache.length > 0) {
        const totalSize = moviesWithCache.reduce((sum, m) => sum + (m.poster_cached_size || 0), 0);
        const avgSize = Math.round(totalSize / moviesWithCache.length / 1024);
        console.log(`   Total cached movies: ${moviesWithCache.length}`);
        console.log(`   Average poster size: ${avgSize}KB`);
        console.log(`   Total cache size: ${Math.round(totalSize / 1024)}KB`);
      }
    }
    
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
