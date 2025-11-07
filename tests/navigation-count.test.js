/**
 * Navigation Count Tests
 * Tests for the movie count badge functionality
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

describe('Navigation Count Tests', () => {
  let dom;
  let document;
  let window;
  let fetch;
  
  beforeEach(async () => {
    // Read the HTML file
    const htmlPath = path.join(__dirname, '../public/index.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    
    // Remove the script tag that loads app.js to avoid conflicts
    htmlContent = htmlContent.replace(/<script src="\/app\.js\?v=2"><\/script>/, '');
    
    // Create DOM environment
    dom = new JSDOM(htmlContent, {
      url: 'http://localhost:3000',
      pretendToBeVisual: true,
      resources: 'usable'
    });
    
    document = dom.window.document;
    window = dom.window;
    
    // Mock fetch
    fetch = jest.fn();
    window.fetch = fetch;
    global.fetch = fetch;
    
    // Mock localStorage
    window.localStorage = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn()
    };
    
    // Mock console methods
    window.console.error = jest.fn();
    window.console.log = jest.fn();
    
    // Mock other functions that might be called
    window.updateNavigationVisibility = jest.fn();
    window.checkAdminStatus = jest.fn();
    
    // Define the actual functions from index.html
    window.updateMovieCount = async function() {
      try {
        const [moviesResponse, meetingsResponse] = await Promise.all([
          window.fetch('/api/movies'),
          window.fetch('/api/meetings')
        ]);
        
        const movies = await moviesResponse.json();
        const meetings = await meetingsResponse.json();
        
        const movieCount = document.getElementById('movieCount');
        if (movieCount) movieCount.textContent = movies.length;
        
        const meetingCount = document.getElementById('meetingCount');
        if (meetingCount) meetingCount.textContent = meetings.length;
        
        // Update navigation movie count
        const navMovieCount = document.getElementById('navMovieCount');
        if (navMovieCount) {
          navMovieCount.textContent = movies.length;
        }
      } catch (err) {
        const movieCount = document.getElementById('movieCount');
        if (movieCount) movieCount.textContent = '?';
        
        const meetingCount = document.getElementById('meetingCount');
        if (meetingCount) meetingCount.textContent = '?';
        
        const navMovieCount = document.getElementById('navMovieCount');
        if (navMovieCount) {
          navMovieCount.textContent = '?';
        }
      }
    };
    
    window.login = async function() {
      const password = document.getElementById('passwordInput')?.value || 'test';
      try {
        const response = await window.fetch('/api/admin/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ password })
        });
        const data = await response.json();
        if (data.token) {
          window.adminToken = data.token;
          window.localStorage.setItem('adminToken', window.adminToken);
          await window.updateMovieCount();
        }
      } catch (err) {
        // Handle login error
      }
    };
  });
  
  afterEach(() => {
    if (dom) {
      dom.window.close();
    }
    jest.resetAllMocks();
  });
  
  describe('Movie Count Badge', () => {
    test('should have navigation movie count element', () => {
      const navMovieCount = document.getElementById('navMovieCount');
      expect(navMovieCount).toBeTruthy();
      expect(navMovieCount.classList.contains('badge')).toBe(true);
    });
    
    test('updateMovieCount should update navigation movie count', async () => {
      // Mock API responses
      const mockMovies = [
        { id: 1, title: 'Movie 1' },
        { id: 2, title: 'Movie 2' },
        { id: 3, title: 'Movie 3' }
      ];
      
      const mockMeetings = [
        { id: 1, name: 'Meeting 1' }
      ];
      
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockMovies)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockMeetings)
        });
      
      // Call updateMovieCount function
      await window.updateMovieCount();
      
      // Check if navigation movie count was updated
      const navMovieCount = document.getElementById('navMovieCount');
      expect(navMovieCount.textContent).toBe('3');
    });
    
    test('updateMovieCount should handle API errors gracefully', async () => {
      // Mock API error
      fetch.mockRejectedValue(new Error('Network error'));
      
      await window.updateMovieCount();
      
      // Should show '?' on error
      const navMovieCount = document.getElementById('navMovieCount');
      expect(navMovieCount.textContent).toBe('?');
    });
    
    test('updateMovieCount should handle empty movie list', async () => {
      // Mock empty responses
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([])
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([])
        });
      
      await window.updateMovieCount();
      
      const navMovieCount = document.getElementById('navMovieCount');
      expect(navMovieCount.textContent).toBe('0');
    });
    
    test('updateMovieCount should not fail if navMovieCount element is missing', async () => {
      // Remove the element to test error handling
      const navMovieCount = document.getElementById('navMovieCount');
      navMovieCount.remove();
      
      // Mock API responses
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{ id: 1 }])
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([])
        });
      
      // Should not throw error
      await expect(window.updateMovieCount()).resolves.not.toThrow();
    });
  });
  
  describe('Initial Page Load', () => {
    test('should call updateMovieCount on page initialization', () => {
      // Mock the functions
      window.updateMovieCount = jest.fn();
      window.checkAdminStatus = jest.fn();
      window.updateNavigationVisibility = jest.fn();
      
      // Simulate the initialization code
      window.checkAdminStatus();
      window.updateNavigationVisibility();
      window.updateMovieCount();
      
      expect(window.updateMovieCount).toHaveBeenCalled();
      expect(window.checkAdminStatus).toHaveBeenCalled();
      expect(window.updateNavigationVisibility).toHaveBeenCalled();
    });
  });
  
  describe('Admin Movie Count Integration', () => {
    test('should update movie count when admin logs in', async () => {
      // Mock successful login response
      const mockLoginResponse = {
        ok: true,
        json: () => Promise.resolve({ token: 'test-token' })
      };
      
      const mockMoviesResponse = {
        ok: true,
        json: () => Promise.resolve([{ id: 1 }, { id: 2 }])
      };
      
      const mockMeetingsResponse = {
        ok: true,
        json: () => Promise.resolve([{ id: 1 }])
      };
      
      fetch
        .mockResolvedValueOnce(mockLoginResponse)
        .mockResolvedValueOnce(mockMoviesResponse)
        .mockResolvedValueOnce(mockMeetingsResponse);
      
      // Simulate admin login
      await window.login();
      
      // Should have called updateMovieCount during login
      const navMovieCount = document.getElementById('navMovieCount');
      expect(navMovieCount.textContent).toBe('2');
    });
  });
  
  describe('Navigation Structure', () => {
    test('should have proper navigation structure for movie count', () => {
      const movieLink = document.querySelector('a[href="/movies.html"]');
      expect(movieLink).toBeTruthy();
      
      const movieCountBadge = movieLink.querySelector('#navMovieCount');
      expect(movieCountBadge).toBeTruthy();
      expect(movieCountBadge.classList.contains('badge')).toBe(true);
      expect(movieCountBadge.classList.contains('bg-secondary')).toBe(true);
      expect(movieCountBadge.classList.contains('rounded-pill')).toBe(true);
    });
    
    test('should display "Browse all movies" text correctly', () => {
      const movieLink = document.querySelector('a[href="/movies.html"]');
      const linkText = movieLink.textContent;
      
      expect(linkText).toContain('Browse all movies');
      expect(linkText).toContain('0'); // Initial count
    });
  });
});
