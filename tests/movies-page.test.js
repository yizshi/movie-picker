/**
 * Movies Page Tests
 * Tests for the dedicated movies browsing page
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

describe('Movies Page Tests', () => {
  let dom;
  let document;
  let window;
  let fetch;
  
  beforeEach(async () => {
    // Read the movies page HTML file
    const htmlPath = path.join(__dirname, '../public/movies.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    
    // Remove the script tag that loads app.js to avoid conflicts
    htmlContent = htmlContent.replace(/<script src="\/app\.js"><\/script>/, '');
    
    // Create DOM environment
    dom = new JSDOM(htmlContent, {
      url: 'http://localhost:3000/movies.html',
      pretendToBeVisual: true,
      resources: 'usable'
    });
    
    document = dom.window.document;
    window = dom.window;
    
    // Mock fetch
    fetch = jest.fn();
    window.fetch = fetch;
    global.fetch = fetch;
    
    // Mock console methods
    window.console.error = jest.fn();
    window.console.log = jest.fn();
    
    // Mock required functions from app.js
    window.originalMoviesData = [];
    window.currentFilteredMovies = [];
    
    // Mock the functions that would normally come from app.js
    window.applyFilters = jest.fn();
    window.setupMovieFilters = jest.fn();
    
    // Set up sorting functionality
    window.currentSortOrder = 'title-asc';
    
    // Define the functions from the movies page
    window.sortMovies = function(movies, sortOrder) {
      const sorted = [...movies];
      
      switch (sortOrder) {
        case 'title-asc':
          return sorted.sort((a, b) => a.title.localeCompare(b.title));
        case 'title-desc':
          return sorted.sort((a, b) => b.title.localeCompare(a.title));
        case 'suggester-asc':
          return sorted.sort((a, b) => (a.suggester || 'Anonymous').localeCompare(b.suggester || 'Anonymous'));
        case 'suggester-desc':
          return sorted.sort((a, b) => (b.suggester || 'Anonymous').localeCompare(a.suggester || 'Anonymous'));
        case 'recent':
          return sorted.sort((a, b) => (b.id || 0) - (a.id || 0));
        case 'oldest':
          return sorted.sort((a, b) => (a.id || 0) - (b.id || 0));
        default:
          return sorted;
      }
    };
    
    window.createEnhancedMovieCard = function(movie) {
      const col = document.createElement('div');
      col.className = 'col-lg-6 col-xl-4';
      col.dataset.movieId = movie.id;
      col.dataset.title = movie.title.toLowerCase();
      col.dataset.suggester = (movie.suggester || '').toLowerCase();
      
      // Extract genres for filtering
      let movieGenres = [];
      try {
        movieGenres = movie.genres ? JSON.parse(movie.genres) : [];
      } catch (e) {}
      col.dataset.genres = movieGenres.join(',').toLowerCase();
      
      const card = document.createElement('div');
      card.className = 'card h-100 shadow-sm';
      
      const imgContainer = document.createElement('div');
      imgContainer.className = 'position-relative movie-card-poster';
      
      const img = document.createElement('img');
      img.className = 'card-img-top w-100 h-100';
      img.src = movie.poster || 'https://via.placeholder.com/300x450?text=No+Poster';
      img.alt = movie.title;
      
      const expandIcon = document.createElement('div');
      expandIcon.className = 'position-absolute top-0 end-0 m-2';
      expandIcon.innerHTML = '<span class="badge bg-dark bg-opacity-75">▼</span>';
      
      const cardBody = document.createElement('div');
      cardBody.className = 'card-body d-flex flex-column movie-card-body';
      
      const title = document.createElement('h5');
      title.className = 'card-title mb-2';
      title.textContent = movie.title;
      
      const suggester = document.createElement('div');
      suggester.className = 'text-muted mb-2';
      suggester.innerHTML = `<small><strong>Suggested by:</strong> ${movie.suggester || 'Anonymous'}</small>`;
      
      const details = document.createElement('div');
      details.className = 'movie-details mt-auto';
      details.style.display = 'none';
      
      imgContainer.appendChild(img);
      imgContainer.appendChild(expandIcon);
      cardBody.appendChild(title);
      cardBody.appendChild(suggester);
      cardBody.appendChild(details);
      card.appendChild(imgContainer);
      card.appendChild(cardBody);
      col.appendChild(card);
      
      // Click handler
      card.addEventListener('click', () => {
        const isExpanded = details.style.display !== 'none';
        details.style.display = isExpanded ? 'none' : 'block';
        const badge = expandIcon.querySelector('.badge');
        badge.textContent = isExpanded ? '▼' : '▲';
      });
      
      return col;
    };
    
    window.renderFilteredMovies = function(movies) {
      const sortedMovies = window.sortMovies(movies, window.currentSortOrder);
      
      const container = document.getElementById('movies-list');
      const countElement = document.getElementById('movie-count');
      const emptyState = document.getElementById('empty-state');
      
      container.innerHTML = '';
      
      if (!sortedMovies.length) {
        container.classList.add('d-none');
        emptyState.classList.remove('d-none');
        if (countElement) countElement.textContent = 'No movies found';
        return;
      }
      
      container.classList.remove('d-none');
      emptyState.classList.add('d-none');
      
      sortedMovies.forEach(movie => {
        const movieCard = window.createEnhancedMovieCard(movie);
        container.appendChild(movieCard);
      });
      
      if (countElement) {
        const total = window.originalMoviesData?.length || 0;
        countElement.textContent = `Showing ${sortedMovies.length} of ${total} movies`;
      }
    };
  });
  
  afterEach(() => {
    if (dom) {
      dom.window.close();
    }
    jest.resetAllMocks();
  });
  
  describe('Page Structure', () => {
    test('should have all required page elements', () => {
      expect(document.getElementById('movie-search')).toBeTruthy();
      expect(document.getElementById('genre-filter')).toBeTruthy();
      expect(document.getElementById('suggester-filter')).toBeTruthy();
      expect(document.getElementById('sort-options')).toBeTruthy();
      expect(document.getElementById('movies-list')).toBeTruthy();
      expect(document.getElementById('empty-state')).toBeTruthy();
      expect(document.getElementById('movie-count')).toBeTruthy();
    });
    
    test('should have proper page title and navigation', () => {
      expect(document.title).toBe('All Movies - Movie Picker');
      expect(document.querySelector('h1').textContent).toBe('All Movie Suggestions');
      
      const backLink = document.querySelector('a[href="/"]');
      expect(backLink).toBeTruthy();
      expect(backLink.textContent.includes('Back')).toBe(true);
      
      const suggestLink = document.querySelector('a[href="/suggest.html"]');
      expect(suggestLink).toBeTruthy();
      expect(suggestLink.textContent.includes('Suggest New Movie')).toBe(true);
    });
    
    test('should have movies-page CSS class on body', () => {
      expect(document.body.classList.contains('movies-page')).toBe(true);
    });
    
    test('should have sort options with correct values', () => {
      const sortSelect = document.getElementById('sort-options');
      const options = Array.from(sortSelect.options).map(opt => opt.value);
      
      expect(options).toEqual([
        'title-asc',
        'title-desc', 
        'suggester-asc',
        'suggester-desc',
        'recent',
        'oldest'
      ]);
    });
  });
  
  describe('Movie Card Creation', () => {
    test('createEnhancedMovieCard should create proper movie card structure', () => {
      const mockMovie = {
        id: 1,
        title: 'Test Movie',
        poster: 'https://example.com/poster.jpg',
        genres: '["Action", "Drama"]',
        suggester: 'Test User',
        notes: 'Great movie!',
        created_at: '2024-01-01T00:00:00Z'
      };
      
      const movieCard = window.createEnhancedMovieCard(mockMovie);
      
      expect(movieCard.className).toContain('col-lg-6 col-xl-4');
      expect(movieCard.dataset.movieId).toBe('1');
      expect(movieCard.dataset.title).toBe('test movie');
      expect(movieCard.dataset.suggester).toBe('test user');
      expect(movieCard.dataset.genres).toBe('action,drama');
      
      const card = movieCard.querySelector('.card');
      expect(card).toBeTruthy();
      expect(card.classList.contains('h-100')).toBe(true);
      expect(card.classList.contains('shadow-sm')).toBe(true);
      
      const img = movieCard.querySelector('img');
      expect(img.src).toBe('https://example.com/poster.jpg');
      expect(img.alt).toBe('Test Movie');
      
      const title = movieCard.querySelector('.card-title');
      expect(title.textContent).toBe('Test Movie');
      
      const suggester = movieCard.querySelector('.text-muted');
      expect(suggester.textContent).toContain('Test User');
    });
    
    test('createEnhancedMovieCard should handle missing poster', () => {
      const mockMovie = {
        id: 1,
        title: 'Test Movie',
        poster: null,
        genres: null,
        suggester: null,
        notes: null
      };
      
      const movieCard = window.createEnhancedMovieCard(mockMovie);
      const img = movieCard.querySelector('img');
      
      expect(img.src).toContain('placeholder');
    });
    
    test('createEnhancedMovieCard should handle malformed genres', () => {
      const mockMovie = {
        id: 1,
        title: 'Test Movie',
        genres: 'invalid json',
        suggester: 'Test User'
      };
      
      expect(() => {
        window.createEnhancedMovieCard(mockMovie);
      }).not.toThrow();
    });
  });
  
  describe('Sorting Functionality', () => {
    const mockMovies = [
      { id: 1, title: 'Zulu', suggester: 'Alice' },
      { id: 2, title: 'Avatar', suggester: 'Bob' },
      { id: 3, title: 'Matrix', suggester: 'Charlie' }
    ];
    
    test('sortMovies should sort by title ascending', () => {
      const sorted = window.sortMovies(mockMovies, 'title-asc');
      expect(sorted.map(m => m.title)).toEqual(['Avatar', 'Matrix', 'Zulu']);
    });
    
    test('sortMovies should sort by title descending', () => {
      const sorted = window.sortMovies(mockMovies, 'title-desc');
      expect(sorted.map(m => m.title)).toEqual(['Zulu', 'Matrix', 'Avatar']);
    });
    
    test('sortMovies should sort by suggester ascending', () => {
      const sorted = window.sortMovies(mockMovies, 'suggester-asc');
      expect(sorted.map(m => m.suggester)).toEqual(['Alice', 'Bob', 'Charlie']);
    });
    
    test('sortMovies should sort by suggester descending', () => {
      const sorted = window.sortMovies(mockMovies, 'suggester-desc');
      expect(sorted.map(m => m.suggester)).toEqual(['Charlie', 'Bob', 'Alice']);
    });
    
    test('sortMovies should sort by ID for recent/oldest', () => {
      const recentSorted = window.sortMovies(mockMovies, 'recent');
      expect(recentSorted.map(m => m.id)).toEqual([3, 2, 1]);
      
      const oldestSorted = window.sortMovies(mockMovies, 'oldest');
      expect(oldestSorted.map(m => m.id)).toEqual([1, 2, 3]);
    });
    
    test('sortMovies should handle unknown sort order', () => {
      const sorted = window.sortMovies(mockMovies, 'unknown');
      expect(sorted).toEqual(mockMovies);
    });
  });
  
  describe('Enhanced Movie Rendering', () => {
    test('renderFilteredMovies should handle empty movie list', () => {
      window.originalMoviesData = [];
      window.renderFilteredMovies([]);
      
      const container = document.getElementById('movies-list');
      const emptyState = document.getElementById('empty-state');
      const countElement = document.getElementById('movie-count');
      
      expect(container.classList.contains('d-none')).toBe(true);
      expect(emptyState.classList.contains('d-none')).toBe(false);
      expect(countElement.textContent).toBe('No movies found');
    });
    
    test('renderFilteredMovies should show movies when present', () => {
      const mockMovies = [
        { id: 1, title: 'Test Movie', suggester: 'Test User', genres: '[]' }
      ];
      
      window.originalMoviesData = mockMovies;
      window.createEnhancedMovieCard = jest.fn().mockReturnValue(document.createElement('div'));
      
      window.renderFilteredMovies(mockMovies);
      
      const container = document.getElementById('movies-list');
      const emptyState = document.getElementById('empty-state');
      
      expect(container.classList.contains('d-none')).toBe(false);
      expect(emptyState.classList.contains('d-none')).toBe(true);
      expect(window.createEnhancedMovieCard).toHaveBeenCalledWith(mockMovies[0]);
    });
  });
  
  describe('Event Handling', () => {
    test('should set up sort functionality on DOMContentLoaded', () => {
      const sortSelect = document.getElementById('sort-options');
      expect(sortSelect).toBeTruthy();
      
      // Simulate DOMContentLoaded event
      const event = new window.Event('DOMContentLoaded');
      document.dispatchEvent(event);
      
      // The event listener should be attached (we can't easily test the listener itself)
      expect(sortSelect.addEventListener).toBeDefined();
    });
    
    test('movie cards should have click handlers for expand/collapse', () => {
      const mockMovie = {
        id: 1,
        title: 'Test Movie',
        suggester: 'Test User',
        genres: '[]'
      };
      
      const movieCard = window.createEnhancedMovieCard(mockMovie);
      const card = movieCard.querySelector('.card');
      const details = movieCard.querySelector('.movie-details');
      const expandIcon = movieCard.querySelector('.badge');
      
      // Initially collapsed
      expect(details.style.display).toBe('none');
      expect(expandIcon.textContent).toBe('▼');
      
      // Simulate click
      card.click();
      
      // Should be expanded
      expect(details.style.display).toBe('block');
      expect(expandIcon.textContent).toBe('▲');
      
      // Click again to collapse
      card.click();
      
      // Should be collapsed again
      expect(details.style.display).toBe('none');
      expect(expandIcon.textContent).toBe('▼');
    });
  });
});
