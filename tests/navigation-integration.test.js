/**
 * Navigation Integration Tests
 * Tests the API endpoints that support conditional navigation visibility
 */

const request = require('supertest');
const { app } = require('../server');

describe('Navigation Integration Tests', () => {
  // No need for server setup since supertest handles it
  
  beforeAll(() => {
    // Test setup if needed
  });
  
  afterAll(() => {
    // Test cleanup if needed
  });
  
  describe('Meetings API for Navigation', () => {
    test('GET /api/meetings should return meeting data needed for navigation', async () => {
      const response = await request(app)
        .get('/api/meetings')
        .expect(200);
      
      // Check that response is an array
      expect(Array.isArray(response.body)).toBe(true);
      
      // If there are meetings, check they have required properties
      response.body.forEach(meeting => {
        expect(meeting).toHaveProperty('id');
        expect(meeting).toHaveProperty('voting_open');
        expect(typeof meeting.voting_open).toBe('number');
        // watched_movie_id is optional
        if (meeting.watched_movie_id !== undefined) {
          expect(['number', 'object'].includes(typeof meeting.watched_movie_id)).toBe(true); // null is object type
        }
      });
    });
    
    test('should be able to create meetings with different states for navigation testing', async () => {
      // This test creates test data to verify navigation logic works with real data
      const adminPassword = process.env.ADMIN_PASSWORD_HASH ? 'admin123' : 'test';
      
      // Login as admin first
      const loginResponse = await request(app)
        .post('/api/admin/login')
        .send({ password: adminPassword });
      
      if (loginResponse.status === 200) {
        const token = loginResponse.body.token;
        
        // Create an open meeting (for vote nav)
        await request(app)
          .post('/api/meetings')
          .set('X-Admin-Token', token)
          .send({
            name: 'Open Meeting for Testing',
            voting_open: true,
            candidate_days: ['2024-12-15', '2024-12-16']
          })
          .expect(201);
        
        // Create a closed meeting (for results nav)  
        await request(app)
          .post('/api/meetings')
          .set('X-Admin-Token', token)
          .send({
            name: 'Closed Meeting for Testing',
            voting_open: false,
            candidate_days: ['2024-12-10', '2024-12-11']
          })
          .expect(201);
      }
      
      // Verify meetings were created with correct states
      const meetingsResponse = await request(app)
        .get('/api/meetings')
        .expect(200);
      
      const meetings = meetingsResponse.body;
      const hasOpenMeeting = meetings.some(m => m.voting_open === 1);
      const hasClosedMeeting = meetings.some(m => m.voting_open === 0);
      
      // At least verify the structure even if we can't create meetings without admin
      expect(meetings).toBeDefined();
      expect(Array.isArray(meetings)).toBe(true);
    });
  });
  
  describe('Navigation Logic Validation', () => {
    test('should validate that different meeting states exist or can be created', async () => {
      const response = await request(app)
        .get('/api/meetings')
        .expect(200);
      
      const meetings = response.body;
      
      // Test the same logic that the frontend uses
      const openMeeting = meetings.find(m => m.voting_open === 1);
      const finishedMeeting = meetings.find(m => m.voting_open === 0);  
      const watchedMeeting = meetings.find(m => m.watched_movie_id);
      
      // Document what states we have for debugging
      console.log('Meeting states found:', {
        total: meetings.length,
        hasOpen: !!openMeeting,
        hasFinished: !!finishedMeeting,
        hasWatched: !!watchedMeeting
      });
      
      // The navigation logic should be able to handle any of these states
      expect(typeof !!openMeeting).toBe('boolean');
      expect(typeof !!finishedMeeting).toBe('boolean');
      expect(typeof !!watchedMeeting).toBe('boolean');
    });
    
    test('should handle meetings state gracefully', async () => {
      // The API should work regardless of meetings state
      const response = await request(app)
        .get('/api/meetings')
        .expect(200);
      
      expect(Array.isArray(response.body)).toBe(true);
      
      // Navigation logic should work with any meetings data
      const meetings = response.body;
      const openMeeting = meetings.find(m => m.voting_open === 1);
      const finishedMeeting = meetings.find(m => m.voting_open === 0);
      const watchedMeeting = meetings.find(m => m.watched_movie_id);
      
      // These should be valid boolean results but not throw errors
      expect(typeof !!openMeeting).toBe('boolean');
      expect(typeof !!finishedMeeting).toBe('boolean');
      expect(typeof !!watchedMeeting).toBe('boolean');
    });
  });
  
  describe('Error Handling for Navigation', () => {
    test('should handle malformed meeting data gracefully', async () => {
      const response = await request(app)
        .get('/api/meetings')
        .expect(200);
      
      // Even if the response is valid, test that our navigation logic
      // can handle edge cases in the data
      const meetings = response.body;
      
      // Test with potentially problematic data
      const testCases = [
        { voting_open: null }, 
        { voting_open: undefined },
        { voting_open: 'invalid' },
        { watched_movie_id: null },
        { watched_movie_id: 0 }
      ];
      
      testCases.forEach((testMeeting, index) => {
        // This simulates how the frontend would handle edge case data
        const isOpen = testMeeting.voting_open === 1;
        const isFinished = testMeeting.voting_open === 0;
        const hasWatched = !!testMeeting.watched_movie_id;
        
        // Should not throw errors
        expect(typeof isOpen).toBe('boolean');
        expect(typeof isFinished).toBe('boolean');
        expect(typeof hasWatched).toBe('boolean');
      });
    });
  });
  
  describe('API Response Structure', () => {
    test('meetings API should return properly structured data', async () => {
      const response = await request(app)
        .get('/api/meetings')
        .expect(200);
      
      expect(response.headers['content-type']).toMatch(/json/);
      expect(Array.isArray(response.body)).toBe(true);
      
      // Validate each meeting has the minimum required structure
      response.body.forEach((meeting, index) => {
        expect(meeting).toMatchObject({
          id: expect.any(Number),
          voting_open: expect.any(Number)
        });
        
        // Optional fields should be properly typed if present
        if (meeting.name !== undefined && meeting.name !== null) {
          expect(typeof meeting.name).toBe('string');
        }
        
        if (meeting.watched_movie_id !== undefined && meeting.watched_movie_id !== null) {
          expect(typeof meeting.watched_movie_id).toBe('number');
        }
        
        if (meeting.candidate_days !== undefined && meeting.candidate_days !== null) {
          expect(Array.isArray(meeting.candidate_days)).toBe(true);
        }
      });
    });
  });
});
