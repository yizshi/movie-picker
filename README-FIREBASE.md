# Movie Picker - Firebase Setup Guide

This guide will help you migrate your Movie Picker app from SQLite to Firebase/Firestore.

## 🔧 Prerequisites

1. **Node.js** (v18 or higher)
2. **Firebase CLI** (already installed)
3. **A Firebase project** (you'll create this)

## 🚀 Setup Instructions

### Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or "Add project"
3. Enter a project name (e.g., "movie-picker-app")
4. Enable Google Analytics if desired
5. Create the project

### Step 2: Enable Firestore Database

1. In your Firebase project console, go to **Firestore Database**
2. Click "Create database"
3. Choose "Start in test mode" (you can change security rules later)
4. Select a location (choose one close to your users)

### Step 3: Get Firebase Credentials

#### Option A: Service Account Key (Recommended for local development)

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Go to **Service Accounts** tab
3. Click "Generate new private key"
4. Download the JSON file and save it securely
5. Either:
   - Copy the entire JSON content for `FIREBASE_SERVICE_ACCOUNT_KEY`
   - Or save the file path for `GOOGLE_APPLICATION_CREDENTIALS`

#### Option B: Firebase Config (For web deployment)

1. In Firebase Console, go to **Project Settings**
2. In **General** tab, scroll down to "Your apps"
3. Click "Add app" and select web (</>) 
4. Register your app and copy the config object

### Step 4: Configure Environment Variables

1. Copy the environment template:
   ```bash
   cp .env.firebase.example .env
   ```

2. Edit `.env` file with your Firebase credentials:
   ```env
   # Admin password for your app
   ADMIN_PASSWORD=your_secure_admin_password

   # TMDB API Key (optional, for movie posters)
   TMDB_API_KEY=your_tmdb_api_key

   # Firebase Service Account Key (paste entire JSON)
   FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"your-project-id",...}

   # OR use file path instead
   # GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json

   # Your Firebase Project ID
   FIREBASE_PROJECT_ID=your-project-id
   ```

### Step 5: Initialize Firebase in Your Project

1. Login to Firebase CLI:
   ```bash
   firebase login
   ```

2. Initialize Firebase in your project:
   ```bash
   firebase init
   ```
   
   Select:
   - **Firestore**: Configure security rules and indexes
   - **Functions**: Configure Cloud Functions
   - **Hosting**: Configure files for Firebase Hosting
   
   When prompted:
   - Use existing project (select your project)
   - Accept default file names
   - Don't overwrite existing files
   - Install dependencies for functions

3. Update `.firebaserc` with your project ID:
   ```bash
   firebase use your-project-id
   ```

### Step 6: Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

### Step 7: Migrate Your SQLite Data (Optional)

If you have existing SQLite data:

```bash
npm run migrate
```

This will transfer all your movies, meetings, ballots, and reviews to Firestore.

## 🏃‍♂️ Running the Application

### Local Development Options

1. **SQLite version** (original):
   ```bash
   npm run start:sqlite
   ```

2. **Firebase version** (local server with Firestore):
   ```bash
   npm run start:firebase
   ```

3. **Firebase Emulators** (local Firebase simulation):
   ```bash
   npm run start:emulator
   ```

### Production Deployment

1. **Deploy everything**:
   ```bash
   npm run deploy
   ```

2. **Deploy only hosting**:
   ```bash
   npm run deploy:hosting
   ```

3. **Deploy only functions**:
   ```bash
   npm run deploy:functions
   ```

## 📋 Information You Need from Firebase

Here's what you need to copy from your Firebase project:

### 🔑 Required Information

1. **Project ID**: Found in Project Settings > General
2. **Service Account Key**: Generated in Project Settings > Service Accounts
3. **Web App Config** (if using client SDK): Found in Project Settings > General > Your apps

### 📝 Example Service Account Key Structure

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com",
  "client_id": "client-id",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40your-project-id.iam.gserviceaccount.com"
}
```

## 🗄️ Database Structure

Your data will be organized in these Firestore collections:

- **movies**: Movie suggestions with posters and genres
- **meetings**: Movie night meetings with voting status
- **ballots**: User votes with rankings and availability
- **reviews**: User reviews and ratings for watched movies

## 🔒 Security Rules

The Firestore security rules are configured to:
- Allow public read access to movies and meetings
- Allow users to create ballots and reviews
- Restrict admin operations to server-side only

## 🆘 Troubleshooting

### Common Issues

1. **"Permission denied" errors**: Check your Firestore security rules
2. **"Invalid credentials" errors**: Verify your service account key
3. **"Project not found" errors**: Ensure your project ID is correct
4. **Migration fails**: Make sure your SQLite database exists

### Getting Help

1. Check the Firebase Console for error logs
2. Review Firestore security rules
3. Verify environment variables are set correctly
4. Check network connectivity to Firebase services

## 🎯 Next Steps

1. Test your Firebase setup locally
2. Deploy to Firebase Hosting
3. Update your domain/DNS settings
4. Monitor usage in Firebase Console
5. Set up backup strategies for your data

---

**Note**: Keep your service account key secure and never commit it to version control!
