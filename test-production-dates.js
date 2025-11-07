/**
 * Test script to verify production date format is fixed
 */

// Try both Firebase Functions URL and Firebase Hosting URL
const FUNCTIONS_URL = 'https://us-central1-distributed-denial-of-screen.cloudfunctions.net/api';
const HOSTING_URL = 'https://distributed-denial-of-screen.web.app/api';

async function testProductionDates() {
  console.log('🔄 Testing production date format...');
  
  // Try Functions URL first, then Hosting URL
  const urls = [FUNCTIONS_URL, HOSTING_URL];
  
  for (const url of urls) {
    console.log(`\n📡 Testing ${url}...`);
    
    try {
      const response = await fetch(`${url}/movies`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const movies = await response.json();
    
    console.log(`📊 Found ${movies.length} movies`);
    
    if (movies.length > 0) {
      const sampleMovie = movies[0];
      console.log('\n📽️ Sample Movie:');
      console.log(`Title: ${sampleMovie.title}`);
      console.log(`ID: ${sampleMovie.id}`);
      console.log(`Created At: ${sampleMovie.created_at}`);
      console.log(`Created At Type: ${typeof sampleMovie.created_at}`);
      
      // Check if created_at is a proper date string
      if (sampleMovie.created_at) {
        const date = new Date(sampleMovie.created_at);
        if (isNaN(date.getTime())) {
          console.log('❌ created_at is not a valid date');
        } else {
          console.log(`✅ created_at is valid: ${date.toLocaleDateString()}`);
        }
      } else {
        console.log('⚠️ No created_at field found');
      }
      
      // Check metadata
      if (sampleMovie.metadata) {
        console.log(`✅ Has metadata: ${typeof sampleMovie.metadata}`);
        try {
          const metadata = JSON.parse(sampleMovie.metadata);
          console.log(`📅 Release year: ${metadata.release_year}`);
          console.log(`⏱️ Runtime: ${metadata.runtime}`);
          console.log(`⭐ Rating: ${metadata.rating}`);
          console.log(`🔗 IMDB ID: ${metadata.imdb_id}`);
        } catch (e) {
          console.log('⚠️ Metadata exists but not valid JSON');
        }
      } else {
        console.log('⚠️ No metadata found');
      }
    }
    
      console.log('\n🎉 Production API test complete!');
      return; // Exit after successful test
      
    } catch (error) {
      console.log(`❌ Error with ${url}: ${error.message}`);
      continue; // Try next URL
    }
  }
  
  console.log('❌ All URLs failed');
}

// Run the test
testProductionDates();
