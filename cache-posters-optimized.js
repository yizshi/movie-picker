/**
 * Optimized Poster Caching System
 * Downloads, compresses, and caches poster thumbnails in Firestore with 30-day refresh policy
 */

require('dotenv').config();
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const sharp = require('sharp');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID
});

const db = admin.firestore();

// Cache configuration
const CACHE_DURATION_DAYS = 30;
const CACHE_DURATION_MS = CACHE_DURATION_DAYS * 24 * 60 * 60 * 1000;

// Image compression settings (to stay under Firestore's 1MB limit)
const MAX_WIDTH = 300;  // Poster width in pixels
const MAX_HEIGHT = 450; // Poster height in pixels  
const QUALITY = 70;     // JPEG quality (1-100)

async function downloadAndCompressImage(imageUrl) {
  try {
    console.log(`    📥 Downloading and compressing image...`);
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      throw new Error(`Invalid content type: ${contentType}`);
    }
    
    const buffer = await response.buffer();
    console.log(`    📏 Original size: ${Math.round(buffer.length / 1024)}KB`);
    
    // Compress and resize the image
    const compressedBuffer = await sharp(buffer)
      .resize(MAX_WIDTH, MAX_HEIGHT, { 
        fit: 'inside',
        withoutEnlargement: true 
      })
      .jpeg({ quality: QUALITY })
      .toBuffer();
    
    const base64Data = compressedBuffer.toString('base64');
    
    // Check if compressed image is under Firestore's limit (~1MB for base64)
    const sizeKB = Math.round(compressedBuffer.length / 1024);
    console.log(`    📦 Compressed size: ${sizeKB}KB`);
    
    if (compressedBuffer.length > 900000) { // 900KB limit (leave buffer for other fields)
      throw new Error(`Compressed image still too large: ${sizeKB}KB`);
    }
    
    return {
      data: base64Data,
      contentType: 'image/jpeg',
      size: compressedBuffer.length,
      dimensions: await sharp(compressedBuffer).metadata()
    };
  } catch (error) {
    console.error(`    ❌ Failed to process image: ${error.message}`);
    return null;
  }
}

function shouldRefreshCache(posterCachedDate) {
  if (!posterCachedDate) return true;
  
  const cacheDate = posterCachedDate.toDate ? posterCachedDate.toDate() : new Date(posterCachedDate);
  const now = new Date();
  const timeDiff = now - cacheDate;
  const daysOld = Math.floor(timeDiff / (24 * 60 * 60 * 1000));
  
  console.log(`    📅 Cache age: ${daysOld} days`);
  return timeDiff > CACHE_DURATION_MS;
}

async function cacheMoviePosters() {
  console.log('🎬 Starting optimized poster caching process...');
  console.log(`📅 Cache refresh policy: ${CACHE_DURATION_DAYS} days`);
  console.log(`🖼️  Compression settings: ${MAX_WIDTH}×${MAX_HEIGHT}px, ${QUALITY}% quality\n`);
  
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
      
      // Download, compress, and cache the image
      const imageData = await downloadAndCompressImage(movie.poster);
      
      if (imageData) {
        // Update movie with cached data
        const updateData = {
          poster_cached_data: imageData.data,
          poster_cached_content_type: imageData.contentType,
          poster_cached_size: imageData.size,
          poster_cached_width: imageData.dimensions.width,
          poster_cached_height: imageData.dimensions.height,
          poster_cached_date: admin.firestore.FieldValue.serverTimestamp(),
          poster_original_url: movie.poster // Keep original URL for reference
        };
        
        await db.collection('movies').doc(movie.id).update(updateData);
        
        console.log(`    💾 Cached optimized poster (${Math.round(imageData.size / 1024)}KB)`);
        cachedCount++;
      } else {
        console.log(`    ❌ Failed to cache poster`);
        errorCount++;
      }
      
      // Add delay to be nice to servers
      await new Promise(resolve => setTimeout(resolve, 500));
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
