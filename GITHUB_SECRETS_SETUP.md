# GitHub Secrets Setup for CI/CD

To enable the automated testing and deployment pipeline, you need to configure the following secrets in your GitHub repository.

## Required Secrets

### 1. ADMIN_PASSWORD_HASH
- **Description**: Bcrypt hash of your admin password
- **How to get**: Run `node generate-password-hash.js` locally
- **Example**: `$2b$12$S.Jo18Lri3jsFPCejvS2IuLM3LGMrKOZSs3b6dU8JYOrckI6a2hqG`

### 2. FIREBASE_SERVICE_ACCOUNT_KEY
- **Description**: Firebase service account JSON key
- **How to get**: 
  1. Go to Firebase Console → Project Settings → Service Accounts
  2. Generate new private key
  3. Copy the entire JSON content
- **Example**: `{"type":"service_account","project_id":"your-project",...}`

### 3. FIREBASE_PROJECT_ID
- **Description**: Your Firebase project ID
- **How to get**: Found in Firebase Console → Project Settings
- **Example**: `distributed-denial-of-screen`

### 4. FIREBASE_TOKEN
- **Description**: Firebase CLI token for deployment
- **How to get**: Run `firebase login:ci` locally
- **Example**: `1//0Gdd...token_string`

### 5. TMDB_API_KEY (Optional but recommended)
- **Description**: TMDB API Bearer token for movie data
- **How to get**: 
  1. Create account at [TMDB](https://www.themoviedb.org/)
  2. Go to Settings → API
  3. Copy API Read Access Token
- **Example**: `eyJhbGciOiJIUzI1NiJ9...`

## How to Add Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret with the exact name and value

## Security Notes

- ⚠️  **Never commit these secrets to your repository**
- ✅ **Secrets are encrypted and only accessible during GitHub Actions runs**
- ✅ **Rotate secrets regularly, especially Firebase tokens**
- ✅ **Use separate Firebase projects for staging/production if needed**

## Testing the Setup

After adding secrets, push to the `main` branch to trigger the CI/CD pipeline:

```bash
git add .
git commit -m "Setup CI/CD pipeline"
git push origin main
```

Check the **Actions** tab in your GitHub repository to see the pipeline running.

## Troubleshooting

### Common Issues:

**Pipeline fails with "Authentication failed":**
- Check that `FIREBASE_TOKEN` is valid (regenerate with `firebase login:ci`)
- Verify `FIREBASE_PROJECT_ID` matches your project

**Tests fail with password errors:**
- Ensure `ADMIN_PASSWORD_HASH` is properly formatted bcrypt hash
- Verify hash was generated for the correct password

**Deployment fails:**
- Check Firebase billing is enabled
- Verify service account has necessary permissions
- Ensure all required secrets are set

### Getting Help:

- Check GitHub Actions logs for detailed error messages
- Verify secrets are correctly named (case-sensitive)
- Ensure Firebase project has necessary APIs enabled
