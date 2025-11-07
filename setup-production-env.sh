#!/bin/bash

# Production Environment Setup Script for Movie Picker
# This script helps set up TMDB API keys for production deployment

echo "🎬 Movie Picker Production Setup"
echo "================================"

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Install it with: npm install -g firebase-tools"
    exit 1
fi

echo "📝 Setting up TMDB API key for production..."

# Prompt for TMDB API Key
read -p "Enter your TMDB API Key: " TMDB_KEY

if [ -z "$TMDB_KEY" ]; then
    echo "❌ TMDB API Key is required"
    exit 1
fi

echo "🔧 Configuring Firebase environment variables..."

# Set Firebase Functions environment variables
firebase functions:config:set app.tmdb_api_key="$TMDB_KEY"

echo "✅ TMDB API Key configured for Firebase Functions"

echo ""
echo "🚀 Next steps:"
echo "1. Deploy functions: firebase deploy --only functions"
echo "2. Or deploy everything: firebase deploy" 
echo ""
echo "📋 For other platforms (Heroku, Vercel, etc.):"
echo "Set environment variable: TMDB_API_KEY=$TMDB_KEY"
echo ""
echo "🎉 Setup complete!"
