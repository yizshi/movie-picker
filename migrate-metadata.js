/**
 * Migration script to add metadata column to existing movies table
 * Run this once to update existing SQLite databases
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'moviepicker.db');

console.log('🔄 Migrating database to add metadata column...');

try {
  const db = new Database(DB_PATH);
  
  // Check if metadata column already exists
  const tableInfo = db.pragma('table_info(movies)');
  const hasMetadataColumn = tableInfo.some(col => col.name === 'metadata');
  
  if (hasMetadataColumn) {
    console.log('✅ Metadata column already exists. No migration needed.');
  } else {
    // Add metadata column
    db.exec('ALTER TABLE movies ADD COLUMN metadata TEXT');
    console.log('✅ Added metadata column to movies table.');
    
    // Optionally backfill metadata for existing movies with IMDB links
    console.log('📊 Checking for movies that could be updated with metadata...');
    const movies = db.prepare('SELECT id, title, poster FROM movies WHERE metadata IS NULL AND poster LIKE ?').all('%imdb.com%');
    
    if (movies.length > 0) {
      console.log(`Found ${movies.length} movies that could benefit from metadata updates.`);
      console.log('💡 Run the app and re-suggest these movies to populate metadata, or implement a backfill script.');
    }
  }
  
  db.close();
  console.log('🎉 Migration completed successfully!');
  
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
}
