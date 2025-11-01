# Movie Picker

Simple suggestion + ranked voting app.

How it works
- People suggest movies with title, optional poster URL and notes.
- Each person can vote up to 3 ranked choices (1st, 2nd, 3rd).
- The server uses a Borda-style scoring: rank 1 = 3 points, rank 2 = 2 points, rank 3 = 1 point.

Run locally
1. Install dependencies:

```powershell
npm install
```

2. Start the server:

```powershell
npm start
```

3. Open http://localhost:3000 in your browser.

Notes and next steps
- This is intentionally minimal and uses a simple username input (no authentication). For production, add auth and CSRF protections.
- You may want to add image uploads instead of poster URLs and add tests.
