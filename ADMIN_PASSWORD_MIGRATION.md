# Admin Password Migration Guide

## Overview
The admin authentication system has been upgraded from plain text password comparison to secure bcrypt hashing for better security.

## What Changed
- **Before**: Passwords were stored and compared as plain text
- **After**: Passwords are hashed using bcrypt with salt rounds for secure storage and comparison

## Migration Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Generate a Hashed Password
Use the provided script to generate a secure hash of your admin password:

```bash
node generate-password-hash.js
```

This will prompt you to enter your password and generate a secure hash.

### 3. Update Environment Configuration

#### Option A: For Local Development (.env file)
Add the generated hash to your `.env` file:
```
ADMIN_PASSWORD_HASH="$2b$12$your_generated_hash_here"
```

#### Option B: For Firebase Functions
Set the hash in Firebase Functions config:
```bash
firebase functions:config:set app.admin_password_hash="$2b$12$your_generated_hash_here"
```

Or use the updated environment setup script:
```bash
./set-firebase-env.sh
```

### 4. Remove Plaintext Password (Recommended)
For better security, remove the plaintext `ADMIN_PASSWORD` from your environment after confirming the hash works.

## Backward Compatibility
The system supports both methods during migration:
- **New (Secure)**: `ADMIN_PASSWORD_HASH` - Uses bcrypt verification
- **Legacy**: `ADMIN_PASSWORD` - Falls back to plain text comparison

If both are present, the system will prefer the hashed password.

## Security Benefits
- **Salted Hashing**: Each password is hashed with a unique salt
- **Adaptive Cost**: bcrypt automatically adjusts difficulty over time
- **No Plain Text Storage**: Passwords are never stored in readable form
- **Timing Attack Resistant**: bcrypt includes built-in protections

## Files Updated
- `functions/index.js` - Firebase Functions authentication
- `server-firebase.js` - Firebase local server authentication  
- `server.js` - SQLite server authentication
- `package.json` / `functions/package.json` - Added bcrypt dependency
- `set-firebase-env.sh` - Updated environment setup script
- `generate-password-hash.js` - New utility script

## Testing
After migration, test admin login functionality:
1. Start your server (local or Firebase)
2. Attempt admin login with your original password
3. Verify you can perform admin operations (delete movies, manage meetings)

## Troubleshooting
- **"invalid password" errors**: Ensure the hash was generated and set correctly
- **Missing dependencies**: Run `npm install` in both root and `functions/` directories
- **Environment issues**: Verify environment variables are set correctly for your deployment method
