#!/usr/bin/env node

const bcrypt = require('bcrypt');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function generateHash() {
  rl.question('Enter the password to hash: ', async (password) => {
    if (!password) {
      console.log('❌ Password cannot be empty');
      rl.close();
      return;
    }

    try {
      console.log('\n🔒 Generating secure hash...');
      
      // Generate salt rounds (12 is a good balance of security and performance)
      const saltRounds = 12;
      const hash = await bcrypt.hash(password, saltRounds);
      
      console.log('\n✅ Password hash generated successfully!');
      console.log('\n📋 Add this to your .env file:');
      console.log(`ADMIN_PASSWORD_HASH="${hash}"`);
      
      console.log('\n📋 Or set it directly in Firebase Functions config:');
      console.log(`firebase functions:config:set app.admin_password_hash="${hash}"`);
      
      console.log('\n⚠️  Keep this hash secure and never expose it in your code!');
      console.log('💡 You can now remove the plaintext ADMIN_PASSWORD from your config for better security.');
      
    } catch (error) {
      console.error('❌ Error generating hash:', error);
    }
    
    rl.close();
  });
}

generateHash();
