#!/bin/bash

echo "🔧 Setting Firebase Functions environment variables..."

# Read from .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "❌ .env file not found!"
    exit 1
fi

# Set Firebase Functions config
if [ ! -z "$ADMIN_PASSWORD_HASH" ]; then
    echo "Setting ADMIN_PASSWORD_HASH (secure)..."
    firebase functions:config:set app.admin_password_hash="$ADMIN_PASSWORD_HASH"
elif [ ! -z "$ADMIN_PASSWORD" ]; then
    echo "Setting ADMIN_PASSWORD (legacy - consider using ADMIN_PASSWORD_HASH)..."
    firebase functions:config:set app.admin_password="$ADMIN_PASSWORD"
else
    echo "⚠️  Neither ADMIN_PASSWORD_HASH nor ADMIN_PASSWORD found in .env"
fi

if [ ! -z "$TMDB_API_KEY" ]; then
    echo "Setting TMDB_API_KEY..."
    firebase functions:config:set app.tmdb_api_key="$TMDB_API_KEY"
fi

echo "✅ Environment variables set successfully!"
echo "🔄 You can now deploy functions with: firebase deploy --only functions"
