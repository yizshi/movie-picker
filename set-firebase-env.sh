#!/bin/bash
#
# Writes functions/.env from the root .env so the next `firebase deploy`
# picks up ADMIN_PASSWORD_HASH + TMDB_API_KEY as runtime env vars.
#
# Firebase Functions now reads runtime env from a functions/.env file at
# deploy time. The old `firebase functions:config:set` command is
# deprecated and hard-fails on current CLI versions.

set -e

if [ ! -f .env ]; then
    echo "❌ .env file not found at repo root!"
    exit 1
fi

# shellcheck disable=SC2046
export $(grep -v '^#' .env | xargs)

if [ -z "$ADMIN_PASSWORD_HASH" ] && [ -z "$ADMIN_PASSWORD" ]; then
    echo "⚠️  Neither ADMIN_PASSWORD_HASH nor ADMIN_PASSWORD found in .env"
    exit 1
fi

echo "🔧 Writing functions/.env..."
{
    [ -n "$ADMIN_PASSWORD_HASH" ] && echo "ADMIN_PASSWORD_HASH=$ADMIN_PASSWORD_HASH"
    [ -n "$ADMIN_PASSWORD" ]      && echo "ADMIN_PASSWORD=$ADMIN_PASSWORD"
    [ -n "$TMDB_API_KEY" ]        && echo "TMDB_API_KEY=$TMDB_API_KEY"
} > functions/.env

echo "✅ functions/.env written."
echo "🔄 Deploy with: firebase deploy --only functions"
