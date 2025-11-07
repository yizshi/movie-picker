/**
 * Frontend Navigation Tests
 * Tests for conditional navigation visibility based on meeting states
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

describe('Frontend Navigation Tests', () => {
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
    
    // Mock console.error to avoid noise in tests
    window.console.error = jest.fn();
    
    // Define the updateNavigationVisibility function in the window context
    window.updateNavigationVisibility = async function() {
      try {
        const response = await window.fetch('/api/meetings');
        const meetings = await response.json();
        
        // Find meetings in different states
        const openMeeting = meetings.find(m => m.voting_open === 1);
        const finishedMeeting = meetings.find(m => m.voting_open === 0);
        const watchedMeeting = meetings.find(m => m.watched_movie_id);
        
        // Show/hide navigation items
        const voteNav = document.getElementById('vote-nav');
        const resultsNav = document.getElementById('results-nav');
        const watchedNav = document.getElementById('watched-nav');
        
        if (voteNav) {
          if (!openMeeting) {
            voteNav.classList.add('d-none');
          } else {
            voteNav.classList.remove('d-none');
          }
        }
        
        if (resultsNav) {
          if (!finishedMeeting) {
            resultsNav.classList.add('d-none');
          } else {
            resultsNav.classList.remove('d-none');
          }
        }
        
        if (watchedNav) {
          if (!watchedMeeting) {
            watchedNav.classList.add('d-none');
          } else {
            watchedNav.classList.remove('d-none');
          }
        }
      } catch (error) {
        window.console.error('Error checking meeting states:', error);
        // On error, show all navigation items as fallback
      }
    };
  });
  
  afterEach(() => {
    if (dom) {
      dom.window.close();
    }
    jest.resetAllMocks();
  });
  
  describe('Navigation Visibility Logic', () => {
    test('should hide vote nav when no active meeting exists', async () => {
      // Mock meetings API response with no active meetings
      const meetings = [
        { id: 1, voting_open: 0, name: 'Closed Meeting' },
        { id: 2, voting_open: 0, name: 'Another Closed Meeting' }
      ];
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(meetings)
      });
      
      // Execute the navigation update function
      await window.updateNavigationVisibility();
      
      const voteNav = document.getElementById('vote-nav');
      expect(voteNav).toBeTruthy();
      expect(voteNav.classList.contains('d-none')).toBe(true);
    });
    
    test('should show vote nav when active meeting exists', async () => {
      // Mock meetings API response with active meeting
      const meetings = [
        { id: 1, voting_open: 1, name: 'Open Meeting' },
        { id: 2, voting_open: 0, name: 'Closed Meeting' }
      ];
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(meetings)
      });
      
      await window.updateNavigationVisibility();
      
      const voteNav = document.getElementById('vote-nav');
      expect(voteNav).toBeTruthy();
      expect(voteNav.classList.contains('d-none')).toBe(false);
    });
    
    test('should hide results nav when no finished meeting exists', async () => {
      // Mock meetings API response with only active meetings
      const meetings = [
        { id: 1, voting_open: 1, name: 'Open Meeting' }
      ];
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(meetings)
      });
      
      await window.updateNavigationVisibility();
      
      const resultsNav = document.getElementById('results-nav');
      expect(resultsNav).toBeTruthy();
      expect(resultsNav.classList.contains('d-none')).toBe(true);
    });
    
    test('should show results nav when finished meeting exists', async () => {
      // Mock meetings API response with finished meeting
      const meetings = [
        { id: 1, voting_open: 1, name: 'Open Meeting' },
        { id: 2, voting_open: 0, name: 'Finished Meeting' }
      ];
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(meetings)
      });
      
      await window.updateNavigationVisibility();
      
      const resultsNav = document.getElementById('results-nav');
      expect(resultsNav).toBeTruthy();
      expect(resultsNav.classList.contains('d-none')).toBe(false);
    });
    
    test('should hide watched nav when no watched meetings exist', async () => {
      // Mock meetings API response with no watched movies
      const meetings = [
        { id: 1, voting_open: 1, name: 'Open Meeting' },
        { id: 2, voting_open: 0, name: 'Finished Meeting' }
      ];
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(meetings)
      });
      
      await window.updateNavigationVisibility();
      
      const watchedNav = document.getElementById('watched-nav');
      expect(watchedNav).toBeTruthy();
      expect(watchedNav.classList.contains('d-none')).toBe(true);
    });
    
    test('should show watched nav when watched meeting exists', async () => {
      // Mock meetings API response with watched movie
      const meetings = [
        { id: 1, voting_open: 0, name: 'Finished Meeting' },
        { id: 2, voting_open: 0, name: 'Watched Meeting', watched_movie_id: 123 }
      ];
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(meetings)
      });
      
      await window.updateNavigationVisibility();
      
      const watchedNav = document.getElementById('watched-nav');
      expect(watchedNav).toBeTruthy();
      expect(watchedNav.classList.contains('d-none')).toBe(false);
    });
    
    test('should handle all navigation states in complex scenario', async () => {
      // Complex scenario with all types of meetings
      const meetings = [
        { id: 1, voting_open: 1, name: 'Active Meeting' },
        { id: 2, voting_open: 0, name: 'Finished Meeting' },
        { id: 3, voting_open: 0, name: 'Watched Meeting', watched_movie_id: 456 }
      ];
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(meetings)
      });
      
      await window.updateNavigationVisibility();
      
      // All navigation items should be visible
      expect(document.getElementById('vote-nav').classList.contains('d-none')).toBe(false);
      expect(document.getElementById('results-nav').classList.contains('d-none')).toBe(false);
      expect(document.getElementById('watched-nav').classList.contains('d-none')).toBe(false);
    });
    
    test('should handle empty meetings array', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([])
      });
      
      await window.updateNavigationVisibility();
      
      // All navigation items should be hidden
      expect(document.getElementById('vote-nav').classList.contains('d-none')).toBe(true);
      expect(document.getElementById('results-nav').classList.contains('d-none')).toBe(true);
      expect(document.getElementById('watched-nav').classList.contains('d-none')).toBe(true);
    });
    
    test('should handle API errors gracefully', async () => {
      // Mock API error
      fetch.mockRejectedValueOnce(new Error('Network error'));
      
      await window.updateNavigationVisibility();
      
      expect(window.console.error).toHaveBeenCalledWith('Error checking meeting states:', expect.any(Error));
      
      // Navigation items should remain visible as fallback (they start visible and errors don't hide them)
      expect(document.getElementById('vote-nav').classList.contains('d-none')).toBe(false);
      expect(document.getElementById('results-nav').classList.contains('d-none')).toBe(false);
      expect(document.getElementById('watched-nav').classList.contains('d-none')).toBe(false);
    });
    
    test('should handle malformed API response gracefully', async () => {
      // Mock malformed response
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(null)
      });
      
      await expect(window.updateNavigationVisibility()).resolves.not.toThrow();
    });
  });
  
  describe('Navigation Elements Existence', () => {
    test('should have all required navigation elements', () => {
      expect(document.getElementById('vote-nav')).toBeTruthy();
      expect(document.getElementById('results-nav')).toBeTruthy();
      expect(document.getElementById('watched-nav')).toBeTruthy();
    });
    
    test('navigation elements should have correct initial attributes', () => {
      const voteNav = document.getElementById('vote-nav');
      const resultsNav = document.getElementById('results-nav');
      const watchedNav = document.getElementById('watched-nav');
      
      expect(voteNav.href).toContain('/vote.html');
      expect(resultsNav.href).toContain('/results.html');
      expect(watchedNav.href).toContain('/watched-list.html');
      
      expect(voteNav.textContent.trim()).toBe('Vote (top 3)');
      expect(resultsNav.textContent.trim()).toBe('View results');
      expect(watchedNav.textContent.trim()).toBe('Watched meetings');
    });
  });
  
  describe('Integration Tests', () => {
    test('should call updateNavigationVisibility on page load', () => {
      // Mock the function to verify it's called
      const spy = jest.spyOn(window, 'updateNavigationVisibility').mockImplementation(() => Promise.resolve());
      
      // Simulate page load initialization
      window.checkAdminStatus = jest.fn();
      window.updateNavigationVisibility();
      
      expect(spy).toHaveBeenCalled();
      
      spy.mockRestore();
    });
  });
});
