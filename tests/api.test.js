const request = require('supertest');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

// Mock SQLite database for testing
const testDbPath = path.join(__dirname, 'test.db');

// Clean up test database before and after tests
beforeAll(() => {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

afterAll(() => {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

describe('API Endpoints', () => {
  let app;
  let adminToken;

  beforeAll(async () => {
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    // Generate hash for password "movie-club"
    process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash('movie-club', 12);
    
    // Override DB path for testing
    process.env.DB_PATH = testDbPath;
    
    // Import app after setting environment
    delete require.cache[require.resolve('../server.js')];
    const { app: serverApp } = require('../server.js');
    app = serverApp;
  }, 15000); // Increase timeout for bcrypt hash generation

  describe('Public Endpoints', () => {
    test('GET /api/movies should return empty array initially', async () => {
      const response = await request(app)
        .get('/api/movies')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });

    test('POST /api/movies should reject invalid IMDB link', async () => {
      const response = await request(app)
        .post('/api/movies')
        .send({
          title: 'Test Movie',
          poster: 'invalid-url',
          suggester: 'Test User'
        })
        .expect(400);

      expect(response.body.error).toContain('IMDB');
    });

    test('POST /api/movies should accept valid IMDB link', async () => {
      const response = await request(app)
        .post('/api/movies')
        .send({
          title: 'The Matrix',
          poster: 'https://www.imdb.com/title/tt0133093/',
          suggester: 'Test User',
          notes: 'Great movie!'
        })
        .expect(200);

      expect(response.body.title).toBe('The Matrix');
      expect(response.body.suggester).toBe('Test User');
      expect(response.body.id).toBeDefined();
    });

    test('GET /api/meetings should return empty array initially', async () => {
      const response = await request(app)
        .get('/api/meetings')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });

    test('GET /api/results should return movie results', async () => {
      const response = await request(app)
        .get('/api/results')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('Admin Authentication', () => {
    test('POST /api/admin/login should reject invalid password', async () => {
      const response = await request(app)
        .post('/api/admin/login')
        .send({ password: 'wrongpassword' })
        .expect(401);

      expect(response.body.error).toBe('invalid password');
    });

    test('POST /api/admin/login should accept valid password', async () => {
      const response = await request(app)
        .post('/api/admin/login')
        .send({ password: 'movie-club' }) // This should match the hash in setup
        .expect(200);

      expect(response.body.token).toBeDefined();
      expect(response.body.expiresIn).toBeDefined();
      
      adminToken = response.body.token;
    });

    test('GET /api/admin/me should return admin status with valid token', async () => {
      const response = await request(app)
        .get('/api/admin/me')
        .set('X-Admin-Token', adminToken)
        .expect(200);

      expect(response.body.admin).toBe(true);
    });

    test('GET /api/admin/me should return false without token', async () => {
      const response = await request(app)
        .get('/api/admin/me')
        .expect(200);

      expect(response.body.admin).toBe(false);
    });
  });

  describe('Admin Endpoints', () => {
    test('POST /api/meetings should require admin authentication', async () => {
      const response = await request(app)
        .post('/api/meetings')
        .send({
          name: 'Test Meeting',
          candidate_days: ['2024-01-15', '2024-01-16']
        })
        .expect(401);

      expect(response.body.error).toBe('admin token required');
    });

    test('POST /api/meetings should create meeting with admin token', async () => {
      const response = await request(app)
        .post('/api/meetings')
        .set('X-Admin-Token', adminToken)
        .send({
          name: 'Test Meeting',
          candidate_days: ['2024-01-15', '2024-01-16'],
          voting_open: true
        })
        .expect(200);

      expect(response.body.name).toBe('Test Meeting');
      expect(response.body.voting_open).toBe(1); // SQLite stores boolean as integer
      expect(response.body.id).toBeDefined();
    });
  });

  describe('Voting System', () => {
    let movieId;
    let meetingId;

    beforeAll(async () => {
      // Create a movie for voting tests
      const movieResponse = await request(app)
        .post('/api/movies')
        .send({
          title: 'Vote Test Movie',
          poster: 'https://www.imdb.com/title/tt0111161/',
          suggester: 'Test User'
        });
      movieId = movieResponse.body.id;

      // Create a meeting for voting tests
      const meetingResponse = await request(app)
        .post('/api/meetings')
        .set('X-Admin-Token', adminToken)
        .send({
          name: 'Vote Test Meeting',
          voting_open: true,
          candidate_days: ['2024-01-15']
        });
      meetingId = meetingResponse.body.id;
    });

    test('POST /api/votes should require username', async () => {
      const response = await request(app)
        .post('/api/votes')
        .send({
          ranks: [{ movieId, rank: 1 }],
          meetingId
        })
        .expect(400);

      expect(response.body.error).toBe('username is required');
    });

    test('POST /api/votes should require valid ranks array', async () => {
      const response = await request(app)
        .post('/api/votes')
        .send({
          username: 'Test Voter',
          ranks: [],
          meetingId
        })
        .expect(400);

      expect(response.body.error).toBe('at least one rank required');
    });

    test('POST /api/votes should accept valid vote', async () => {
      const response = await request(app)
        .post('/api/votes')
        .send({
          username: 'Test Voter',
          ranks: [{ movieId, rank: 1 }],
          meetingId,
          availability: ['2024-01-15']
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.ballotId).toBeDefined();
    });

    test('should not allow voting on closed meetings', async () => {
      // Close the meeting
      await request(app)
        .patch(`/api/meetings/${meetingId}`)
        .set('X-Admin-Token', adminToken)
        .send({ voting_open: false });

      const response = await request(app)
        .post('/api/votes')
        .send({
          username: 'Another Voter',
          ranks: [{ movieId, rank: 1 }],
          meetingId
        })
        .expect(400);

      expect(response.body.error).toBe('voting is closed for this meeting');
    });
  });
});
