async function fetchMovies() {
  const res = await fetch('/api/movies');
  return await res.json();
}

async function fetchResults(meetingId) {
  const url = meetingId ? `/api/results?meetingId=${encodeURIComponent(meetingId)}` : '/api/results';
  const res = await fetch(url);
  return await res.json();
}

function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }

// Helper function to render genres as tags
function renderGenres(genres) {
  if (!genres) return '';
  
  let genreArray;
  try {
    genreArray = typeof genres === 'string' ? JSON.parse(genres) : genres;
  } catch (e) {
    return '';
  }
  
  if (!Array.isArray(genreArray) || genreArray.length === 0) return '';
  
  const tags = genreArray.map(genre => `<span class="genre-tag">${genre}</span>`).join('');
  return `<div class="genre-tags">${tags}</div>`;
}

// Admin token helpers
function getAdminToken() { try { return localStorage.getItem('adminToken'); } catch(e){ return null; } }
function setAdminToken(t) { try { if (t) localStorage.setItem('adminToken', t); else localStorage.removeItem('adminToken'); } catch(e){} }
async function checkIsAdmin() {
  const token = getAdminToken();
  if (!token) return false;
  const res = await fetch('/api/admin/me', { headers: { 'X-Admin-Token': token } });
  try { const body = await res.json(); return !!body.admin; } catch(e){ return false; }
}

// Store original movies data for filtering
let originalMoviesData = [];
let currentFilteredMovies = [];

async function renderMovies() {
  const movies = await fetchMovies();
  originalMoviesData = movies;
  currentFilteredMovies = movies;
  
  const container = document.getElementById('movies-list');
  if (!container) return; // page doesn't show a movies list
  
  // Check if we're on a page with search controls (vote or suggest page)
  const hasSearchControls = document.getElementById('movie-search');
  
  if (hasSearchControls) {
    // Enhanced rendering for vote and suggest pages
    setupMovieFilters();
    renderFilteredMovies(movies);
  } else {
    // Regular rendering for other pages
    container.innerHTML = '';
    if (!movies.length) {
      container.innerHTML = '<div class="text-muted">No suggestions yet.</div>';
      return;
    }
    for (const m of movies) {
      const col = el('div', 'col-12');
      const card = createBasicMovieCard(m);
      col.appendChild(card);
      container.appendChild(col);
    }
  }
}

function createBasicMovieCard(movie) {
  const card = el('div', 'card flex-row');
  card.style.alignItems = 'stretch';
  
  const imgDiv = el('div', '');
  const img = el('img', 'img-fluid');
  img.src = movie.poster || 'https://via.placeholder.com/120x180?text=No+Poster';
  img.alt = movie.title;
  img.width = 120; img.height = 180;
  img.style.objectFit = 'cover';
  imgDiv.appendChild(img);
  imgDiv.style.padding = '0.5rem';

  const body = el('div', 'card-body');
  const h5 = el('h5', 'card-title'); h5.textContent = movie.title;
  
  // Add genres below title
  const genresHtml = renderGenres(movie.genres);
  if (genresHtml) {
    const genresDiv = el('div');
    genresDiv.innerHTML = genresHtml;
    body.appendChild(h5);
    body.appendChild(genresDiv);
  } else {
    body.appendChild(h5);
  }
  
  const p = el('p', 'card-text'); p.textContent = movie.notes || '';
  const small = el('div', 'text-muted'); small.textContent = movie.suggester ? `Suggested by ${movie.suggester}` : '';
  body.appendChild(p); body.appendChild(small);

  card.appendChild(imgDiv); card.appendChild(body);
  return card;
}

function createDetailedMovieCard(movie) {
  const col = el('div', 'col-lg-6 col-xl-4');
  col.dataset.movieId = movie.id;
  col.dataset.title = movie.title.toLowerCase();
  col.dataset.suggester = (movie.suggester || '').toLowerCase();
  
  // Extract genres for filtering
  let movieGenres = [];
  try {
    movieGenres = movie.genres ? JSON.parse(movie.genres) : [];
  } catch (e) {}
  col.dataset.genres = movieGenres.join(',').toLowerCase();
  
  const card = el('div', 'card h-100');
  card.style.cursor = 'pointer';
  
  // Movie poster
  const imgContainer = el('div', 'position-relative');
  const img = el('img', 'card-img-top');
  img.src = movie.poster || 'https://via.placeholder.com/300x450?text=No+Poster';
  img.alt = movie.title;
  img.style.height = '200px';
  img.style.objectFit = 'cover';
  imgContainer.appendChild(img);
  
  // Expand/collapse indicator
  const expandIcon = el('div', 'position-absolute top-0 end-0 m-2');
  expandIcon.innerHTML = '<span class="badge bg-dark bg-opacity-75">▼</span>';
  imgContainer.appendChild(expandIcon);
  
  const cardBody = el('div', 'card-body d-flex flex-column');
  
  // Title
  const title = el('h6', 'card-title mb-2'); 
  title.textContent = movie.title;
  
  // Genres
  const genresHtml = renderGenres(movie.genres);
  if (genresHtml) {
    const genresDiv = el('div', 'mb-2');
    genresDiv.innerHTML = genresHtml;
    cardBody.appendChild(title);
    cardBody.appendChild(genresDiv);
  } else {
    cardBody.appendChild(title);
  }
  
  // Suggester
  const suggester = el('small', 'text-muted mb-2');
  suggester.textContent = movie.suggester ? `Suggested by ${movie.suggester}` : 'Anonymous';
  cardBody.appendChild(suggester);
  
  // Collapsible details
  const details = el('div', 'movie-details');
  details.style.display = 'none';
  
  if (movie.notes) {
    const notesLabel = el('strong', 'd-block mt-2'); 
    notesLabel.textContent = 'Notes:';
    const notes = el('p', 'card-text small');
    notes.textContent = movie.notes;
    details.appendChild(notesLabel);
    details.appendChild(notes);
  }
  
  // Quick select buttons (only on vote page)
  const isVotePage = window.location.pathname.includes('vote');
  if (isVotePage) {
    const quickSelect = el('div', 'mt-auto');
    quickSelect.innerHTML = `
      <div class="btn-group w-100" role="group">
        <button class="btn btn-outline-primary btn-sm" onclick="selectMovieForRank('${movie.id}', 1)">1st</button>
        <button class="btn btn-outline-secondary btn-sm" onclick="selectMovieForRank('${movie.id}', 2)">2nd</button>
        <button class="btn btn-outline-info btn-sm" onclick="selectMovieForRank('${movie.id}', 3)">3rd</button>
      </div>
    `;
    details.appendChild(quickSelect);
  }
  
  cardBody.appendChild(details);
  
  // Click to expand/collapse
  card.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') return; // Don't toggle on button clicks
    
    const isExpanded = details.style.display !== 'none';
    details.style.display = isExpanded ? 'none' : 'block';
    expandIcon.innerHTML = `<span class="badge bg-dark bg-opacity-75">${isExpanded ? '▼' : '▲'}</span>`;
  });
  
  card.appendChild(imgContainer);
  card.appendChild(cardBody);
  col.appendChild(card);
  
  return col;
}

function renderFilteredMovies(movies) {
  const container = document.getElementById('movies-list');
  const countElement = document.getElementById('movie-count');
  
  container.innerHTML = '';
  
  if (!movies.length) {
    container.innerHTML = '<div class="col-12 text-center text-muted py-4">No movies match your search criteria.</div>';
    if (countElement) countElement.textContent = 'No movies found';
    return;
  }
  
  movies.forEach(movie => {
    const movieCard = createDetailedMovieCard(movie);
    container.appendChild(movieCard);
  });
  
  if (countElement) {
    countElement.textContent = `Showing ${movies.length} of ${originalMoviesData.length} movies`;
  }
}

// Quick select function for vote dropdowns
function selectMovieForRank(movieId, rank) {
  const dropdown = document.getElementById(`rank${rank}`);
  if (!dropdown) return;
  
  // Check if this movie is already selected in another rank
  const otherRanks = [1, 2, 3].filter(r => r !== rank);
  for (const otherRank of otherRanks) {
    const otherDropdown = document.getElementById(`rank${otherRank}`);
    if (otherDropdown && otherDropdown.value === movieId) {
      // Movie is already selected, show message and don't proceed
      const msg = document.getElementById('vote-msg');
      if (msg) {
        msg.textContent = `"${dropdown.options[dropdown.selectedIndex]?.textContent || 'This movie'}" is already selected for ${getOrdinalRank(otherRank)} choice. Please choose a different movie.`;
        msg.className = 'mt-2 text-warning';
        setTimeout(() => {
          msg.textContent = '';
          msg.className = 'mt-2';
        }, 3000);
      }
      return;
    }
  }
  
  dropdown.value = movieId;
  dropdown.dispatchEvent(new Event('change')); // Trigger validation
  
  // Clear any previous warning messages
  const msg = document.getElementById('vote-msg');
  if (msg && msg.textContent.includes('already selected')) {
    msg.textContent = '';
    msg.className = 'mt-2';
  }
}

// Helper function to get ordinal rank names
function getOrdinalRank(rank) {
  const ordinals = { 1: '1st', 2: '2nd', 3: '3rd' };
  return ordinals[rank] || `${rank}th`;
}

// Render date voting results with highlighting
function renderDateVotingResults(dateCounts, container) {
  container.innerHTML = '';
  
  if (!dateCounts || dateCounts.length === 0) {
    return;
  }
  
  // Find the highest vote count
  const maxVotes = Math.max(...dateCounts.map(dc => dc.count));
  
  // Create a wrapper for the badges
  const badgeContainer = el('div', 'd-flex flex-wrap gap-2 align-items-center');
  
  dateCounts.forEach((dateCount, index) => {
    const isHighest = dateCount.count === maxVotes;
    const isWinner = dateCounts.length > 1 && isHighest; // Only highlight if there are multiple dates and this is highest
    
    // Create badge
    const badge = el('span', `badge ${isWinner ? 'bg-success' : 'bg-secondary'} position-relative`);
    badge.style.fontSize = '0.9rem';
    badge.style.padding = '0.5rem 0.75rem';
    
    // Format date nicely
    const dateObj = new Date(dateCount.date + 'T00:00:00');
    const formattedDate = dateObj.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
    
    // Badge content
    const voteText = dateCount.count === 1 ? 'vote' : 'votes';
    badge.innerHTML = `${formattedDate} <strong>${dateCount.count}</strong> ${voteText}`;
    
    // Add crown icon for winner
    if (isWinner && dateCounts.length > 1) {
      const crown = el('span', 'position-absolute top-0 start-100 translate-middle');
      crown.innerHTML = '👑';
      crown.style.fontSize = '1rem';
      crown.title = 'Most popular date';
      badge.appendChild(crown);
      badge.classList.add('winner-badge');
    }
    
    // Add tooltip for ties
    if (isHighest && dateCounts.filter(dc => dc.count === maxVotes).length > 1) {
      badge.title = 'Tied for most votes';
    }
    
    badgeContainer.appendChild(badge);
  });
  
  // Add summary text if there are multiple dates
  if (dateCounts.length > 1) {
    const summary = el('small', 'text-muted ms-2');
    const winners = dateCounts.filter(dc => dc.count === maxVotes);
    
    if (winners.length === 1) {
      summary.textContent = `${winners[0].date} is the preferred date`;
    } else {
      const winnerDates = winners.map(w => {
        const dateObj = new Date(w.date + 'T00:00:00');
        return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }).join(', ');
      summary.textContent = `Tie between: ${winnerDates}`;
    }
    
    badgeContainer.appendChild(summary);
  }
  
  container.appendChild(badgeContainer);
}

function setupMovieFilters() {
  const searchInput = document.getElementById('movie-search');
  const genreFilter = document.getElementById('genre-filter');
  const suggesterFilter = document.getElementById('suggester-filter');
  const clearButton = document.getElementById('clear-search');
  const expandAllButton = document.getElementById('expand-all');
  const collapseAllButton = document.getElementById('collapse-all');
  
  // Populate filter options
  populateFilterOptions();
  
  // Search functionality
  if (searchInput) {
    searchInput.addEventListener('input', applyFilters);
  }
  
  if (genreFilter) {
    genreFilter.addEventListener('change', applyFilters);
  }
  
  if (suggesterFilter) {
    suggesterFilter.addEventListener('change', applyFilters);
  }
  
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      searchInput.value = '';
      genreFilter.value = '';
      suggesterFilter.value = '';
      applyFilters();
    });
  }
  
  if (expandAllButton) {
    expandAllButton.addEventListener('click', () => {
      document.querySelectorAll('.movie-details').forEach(details => {
        details.style.display = 'block';
      });
      document.querySelectorAll('#movies-list .badge').forEach(badge => {
        badge.textContent = '▲';
      });
    });
  }
  
  if (collapseAllButton) {
    collapseAllButton.addEventListener('click', () => {
      document.querySelectorAll('.movie-details').forEach(details => {
        details.style.display = 'none';
      });
      document.querySelectorAll('#movies-list .badge').forEach(badge => {
        badge.textContent = '▼';
      });
    });
  }
}

function populateFilterOptions() {
  const genreFilter = document.getElementById('genre-filter');
  const suggesterFilter = document.getElementById('suggester-filter');
  
  // Collect all unique genres
  const allGenres = new Set();
  const allSuggesters = new Set();
  
  originalMoviesData.forEach(movie => {
    try {
      const genres = movie.genres ? JSON.parse(movie.genres) : [];
      genres.forEach(genre => allGenres.add(genre));
    } catch (e) {}
    
    if (movie.suggester) {
      allSuggesters.add(movie.suggester);
    }
  });
  
  // Populate genre filter
  if (genreFilter) {
    genreFilter.innerHTML = '<option value="">All Genres</option>';
    Array.from(allGenres).sort().forEach(genre => {
      const option = el('option');
      option.value = genre;
      option.textContent = genre;
      genreFilter.appendChild(option);
    });
  }
  
  // Populate suggester filter
  if (suggesterFilter) {
    suggesterFilter.innerHTML = '<option value="">All Suggesters</option>';
    Array.from(allSuggesters).sort().forEach(suggester => {
      const option = el('option');
      option.value = suggester;
      option.textContent = suggester;
      suggesterFilter.appendChild(option);
    });
  }
}

function applyFilters() {
  const searchTerm = document.getElementById('movie-search')?.value.toLowerCase() || '';
  const selectedGenre = document.getElementById('genre-filter')?.value || '';
  const selectedSuggester = document.getElementById('suggester-filter')?.value || '';
  
  const filteredMovies = originalMoviesData.filter(movie => {
    // Search by title
    const matchesSearch = movie.title.toLowerCase().includes(searchTerm);
    
    // Filter by genre
    let matchesGenre = true;
    if (selectedGenre) {
      try {
        const genres = movie.genres ? JSON.parse(movie.genres) : [];
        matchesGenre = genres.includes(selectedGenre);
      } catch (e) {
        matchesGenre = false;
      }
    }
    
    // Filter by suggester
    const matchesSuggester = !selectedSuggester || movie.suggester === selectedSuggester;
    
    return matchesSearch && matchesGenre && matchesSuggester;
  });
  
  currentFilteredMovies = filteredMovies;
  renderFilteredMovies(filteredMovies);
}

async function renderResults() {
  // optionally take a meetingId via arguments
  const meetingId = arguments[0];
  const results = meetingId ? await fetchResults(meetingId) : await fetchResults();
  const container = document.getElementById('results-list');
  if (!container) return; // no results area on this page
  container.innerHTML = '';
  // hide movies with zero votes
  const nonZeroResults = (results || []).filter(r => (r.score || 0) > 0);
  if (!nonZeroResults.length) {
    container.innerHTML = '<div class="text-muted">No votes yet.</div>';
    // also clear winner area if present
    const moviesContainerEmpty = document.getElementById('movies-list');
    if (moviesContainerEmpty) moviesContainerEmpty.innerHTML = '<div class="text-muted">No winning suggestion yet.</div>';
    return;
  }
  const list = el('ol', 'list-group list-group-numbered');
  for (const r of nonZeroResults) {
    const li = el('li', 'list-group-item d-flex justify-content-between align-items-start');
    const div = el('div');
    const title = el('div', 'fw-bold'); title.textContent = r.title;
    
    // Add genres below title
    const genresHtml = renderGenres(r.genres);
    if (genresHtml) {
      const genresDiv = el('div');
      genresDiv.innerHTML = genresHtml;
      div.appendChild(title);
      div.appendChild(genresDiv);
    } else {
      div.appendChild(title);
    }
    
    const notes = el('div'); notes.textContent = r.notes || '';
    div.appendChild(notes);
    const badge = el('span', 'badge bg-primary rounded-pill'); badge.textContent = r.score || 0;
    li.appendChild(div);
    li.appendChild(badge);
    list.appendChild(li);
  }
  container.appendChild(list);

  // Render top winner in the suggestions area (if present on this page)
  const moviesContainer = document.getElementById('movies-list');
  if (moviesContainer) {
    const top = nonZeroResults[0];
    if (!top) {
      moviesContainer.innerHTML = '<div class="text-muted">No winning suggestion yet.</div>';
    } else {
      const genresHtml = renderGenres(top.genres);
      const card = `
        <div class="col-12">
          <div class="card flex-row">
            <div style="padding:0.5rem">
              <img src="${top.poster || 'https://via.placeholder.com/240x360?text=No+Poster'}" alt="${top.title}" width="160" height="240" style="object-fit:cover" />
            </div>
            <div class="card-body">
              <h3 class="card-title">${top.title}</h3>
              ${genresHtml}
              <p class="card-text">${top.notes || ''}</p>
              <div class="text-muted">Suggested by: ${top.suggester || 'Anonymous'}</div>
              <div class="mt-2"><strong>Score: ${top.score || 0}</strong></div>
            </div>
          </div>
        </div>
      `;
      moviesContainer.innerHTML = card;
    }
  }
}

// Fetch meetings
async function fetchMeetings() {
  const res = await fetch('/api/meetings');
  return await res.json();
}

function renderAvailabilityInputs(container, meeting) {
  container.innerHTML = '';
  const heading = document.createElement('label'); heading.className = 'form-label';
  heading.textContent = 'Which days can you attend?';
  container.appendChild(heading);
  
  // Create date picker interface
  const calendarContainer = document.createElement('div');
  calendarContainer.className = 'availability-calendar mb-3';
  
  if (meeting && meeting.candidate_days && meeting.candidate_days.length) {
    // Show preset candidate days as date inputs
    const note = document.createElement('small'); 
    note.className = 'form-text text-muted mb-2'; 
    note.textContent = 'Select from the candidate dates below:';
    container.appendChild(note);
    
    const datesGrid = document.createElement('div');
    datesGrid.className = 'candidate-dates-grid mb-3';
    datesGrid.style.display = 'grid';
    datesGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(200px, 1fr))';
    datesGrid.style.gap = '0.5rem';
    
    meeting.candidate_days.forEach(d => {
      const dateCard = document.createElement('div');
      dateCard.className = 'candidate-date-card p-2 border rounded';
      dateCard.style.cursor = 'pointer';
      dateCard.style.transition = 'all 0.2s';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'form-check-input me-2';
      checkbox.value = d;
      checkbox.name = 'availability';
      checkbox.id = `avail-${d}`.replace(/[^a-z0-9\-]/gi,'');
      
      const label = document.createElement('label');
      label.className = 'form-check-label';
      label.htmlFor = checkbox.id;
      label.textContent = new Date(d + 'T00:00:00').toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      });
      label.style.cursor = 'pointer';
      
      dateCard.appendChild(checkbox);
      dateCard.appendChild(label);
      
      // Add click handler for the card
      dateCard.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
        }
        updateDateCardStyle(dateCard, checkbox.checked);
      });
      
      // Style the card based on selection
      checkbox.addEventListener('change', () => {
        updateDateCardStyle(dateCard, checkbox.checked);
      });
      
      datesGrid.appendChild(dateCard);
    });
    
    container.appendChild(datesGrid);
    
    // Add option to select custom dates
    const customSection = document.createElement('div');
    customSection.className = 'custom-dates-section';
    
    const customHeading = document.createElement('small');
    customHeading.className = 'form-text text-muted mb-2 d-block';
    customHeading.textContent = 'Or add additional dates:';
    
    const customInput = document.createElement('input');
    customInput.type = 'date';
    customInput.className = 'form-control mb-2';
    customInput.id = 'custom-date-picker';
    
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'btn btn-outline-secondary btn-sm mb-2';
    addButton.textContent = 'Add Date';
    
    const selectedCustomDates = document.createElement('div');
    selectedCustomDates.id = 'selected-custom-dates';
    selectedCustomDates.className = 'selected-custom-dates';
    
    customSection.appendChild(customHeading);
    customSection.appendChild(customInput);
    customSection.appendChild(addButton);
    customSection.appendChild(selectedCustomDates);
    
    // Add custom date functionality
    addButton.addEventListener('click', () => {
      const dateValue = customInput.value;
      if (dateValue && !isDateAlreadySelected(dateValue)) {
        addCustomDate(dateValue, selectedCustomDates);
        customInput.value = '';
      }
    });
    
    customInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addButton.click();
      }
    });
    
    container.appendChild(customSection);
    
  } else {
    // Fallback to free-form date input with enhanced date picker
    const note = document.createElement('small'); 
    note.className = 'form-text text-muted mb-2'; 
    note.textContent = 'Select dates you can attend:';
    container.appendChild(note);
    
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'form-control mb-2';
    dateInput.id = 'date-picker';
    
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'btn btn-outline-primary btn-sm mb-2';
    addButton.textContent = 'Add Date';
    
    const selectedDates = document.createElement('div');
    selectedDates.id = 'selected-dates';
    selectedDates.className = 'selected-dates';
    
    container.appendChild(dateInput);
    container.appendChild(addButton);
    container.appendChild(selectedDates);
    
    // Add date functionality
    addButton.addEventListener('click', () => {
      const dateValue = dateInput.value;
      if (dateValue) {
        addSelectedDate(dateValue, selectedDates);
        dateInput.value = '';
      }
    });
    
    dateInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addButton.click();
      }
    });
  }
}

// Helper function to update date card styling
function updateDateCardStyle(card, isSelected) {
  if (isSelected) {
    card.style.backgroundColor = '#e7f3ff';
    card.style.borderColor = '#0d6efd';
    card.style.fontWeight = '500';
  } else {
    card.style.backgroundColor = '';
    card.style.borderColor = '#dee2e6';
    card.style.fontWeight = '';
  }
}

// Helper function to check if date is already selected
function isDateAlreadySelected(dateValue) {
  const existingCheckboxes = document.querySelectorAll('input[name="availability"]');
  return Array.from(existingCheckboxes).some(cb => cb.value === dateValue);
}

// Helper function to add custom date
function addCustomDate(dateValue, container) {
  const dateTag = document.createElement('span');
  dateTag.className = 'badge bg-primary me-2 mb-1';
  dateTag.style.fontSize = '0.875rem';
  
  const dateText = new Date(dateValue + 'T00:00:00').toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });
  
  dateTag.innerHTML = `${dateText} <button type="button" class="btn-close btn-close-white ms-1" style="font-size: 0.7rem;"></button>`;
  
  // Create hidden input for form submission
  const hiddenInput = document.createElement('input');
  hiddenInput.type = 'hidden';
  hiddenInput.name = 'availability';
  hiddenInput.value = dateValue;
  
  // Add remove functionality
  const removeBtn = dateTag.querySelector('.btn-close');
  removeBtn.addEventListener('click', () => {
    dateTag.remove();
    hiddenInput.remove();
  });
  
  container.appendChild(dateTag);
  container.appendChild(hiddenInput);
}

// Helper function to add selected date (fallback mode)
function addSelectedDate(dateValue, container) {
  const dateTag = document.createElement('span');
  dateTag.className = 'badge bg-success me-2 mb-1';
  dateTag.style.fontSize = '0.875rem';
  
  const dateText = new Date(dateValue + 'T00:00:00').toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });
  
  dateTag.innerHTML = `${dateText} <button type="button" class="btn-close btn-close-white ms-1" style="font-size: 0.7rem;"></button>`;
  dateTag.dataset.value = dateValue;
  
  // Add remove functionality
  const removeBtn = dateTag.querySelector('.btn-close');
  removeBtn.addEventListener('click', () => {
    dateTag.remove();
  });
  
  container.appendChild(dateTag);
}

async function populateMeetingSelectors() {
  const meetings = await fetchMeetings();

  // Determine the single open meeting (if any). If none open, fall back to the last finished meeting.
  const openMeeting = meetings.find(m => m.voting_open == 1) || null;
  const lastFinished = (!openMeeting) ? meetings.find(m => m.voting_open == 0) || null : null;
  // Expose globally for vote submission to use
  window.currentOpenMeeting = openMeeting || lastFinished || null;

  // Update vote page UI (meeting name) and prepare availability + ranks
  const meetingNameElem = document.getElementById('meeting-name');
  const voteAvailabilityContainer = document.getElementById('availability-container');
  if (meetingNameElem) {
    if (window.currentOpenMeeting) {
      meetingNameElem.textContent = window.currentOpenMeeting.name || window.currentOpenMeeting.date || `Meeting ${window.currentOpenMeeting.id}`;
    } else {
      meetingNameElem.textContent = '(no meeting currently open for voting)';
    }
  }
  if (voteAvailabilityContainer) {
    if (window.currentOpenMeeting) {
      renderAvailabilityInputs(voteAvailabilityContainer, window.currentOpenMeeting);
      await populateRankSelectors(window.currentOpenMeeting.allowed_movie_ids || null);
      await renderMovies();
    } else {
      voteAvailabilityContainer.innerHTML = '<div class="text-muted">No open meeting for voting.</div>';
      await populateRankSelectors();
    }
  }

  // Update results page: show chosen meeting name and load its results
  const resultsNameElem = document.getElementById('results-meeting-name');
  const chosenMeeting = window.currentOpenMeeting || null;
  if (resultsNameElem) {
    if (chosenMeeting) {
      resultsNameElem.textContent = chosenMeeting.name || `Meeting ${chosenMeeting.id}`;
      const dateElem = document.getElementById('results-meeting-date');
      if (dateElem) {
        dateElem.textContent = chosenMeeting.date ? `Selected date: ${chosenMeeting.date}` : '';
      }
      const dateCountsElem = document.getElementById('results-meeting-date-counts');
      const dateResultsElem = document.getElementById('date-voting-results');
      
      if (dateCountsElem && dateResultsElem) {
        if (chosenMeeting.date_counts && chosenMeeting.date_counts.length) {
          // Show text summary
          dateCountsElem.textContent = 'Availability voting results:';
          
          // Render visual badges with highlighting
          renderDateVotingResults(chosenMeeting.date_counts, dateResultsElem);
        } else {
          dateCountsElem.textContent = '';
          dateResultsElem.innerHTML = '';
        }
      }
    } else {
      resultsNameElem.textContent = '(no meeting data)';
      const dateElem = document.getElementById('results-meeting-date');
      if (dateElem) dateElem.textContent = '';
      const dateCountsElem = document.getElementById('results-meeting-date-counts');
      if (dateCountsElem) dateCountsElem.textContent = '';
    }
  }
  // Render results for the chosen meeting (or global if none)
  if (chosenMeeting) {
    await renderResults(chosenMeeting.id);
    // mark-watched removed from results page — handled on watched page
  } else {
    // no chosen meeting: render global results
    await renderResults();
  }
}

// Render meeting list for meetings.html
async function renderMeetingsList() {
  const list = document.getElementById('meetings-list');
  if (!list) return;
  const meetings = await fetchMeetings();
  list.innerHTML = '';
  if (!meetings.length) {
    list.innerHTML = '<div class="text-muted">No meetings yet.</div>';
    return;
  }
  for (const m of meetings) {
    const item = document.createElement('div'); item.className = 'list-group-item';
    const title = m.name || m.date || (`Meeting ${m.id}`);
    const days = m.candidate_days && m.candidate_days.length ? m.candidate_days.join(', ') : '—';
    const watched = m.watched_movie ? m.watched_movie.title : (m.watched_movie_id ? `movie id ${m.watched_movie_id}` : '—');
    item.innerHTML = `<div class="d-flex w-100 justify-content-between"><h5 class="mb-1">${title}</h5><small>Voting ${m.voting_open ? 'open' : 'closed'}</small></div>
      <p class="mb-1">Days: ${days}</p>
      <small>Watched: ${watched}</small>`;
    list.appendChild(item);
  }
}

// Handle meeting creation form
const meetingForm = document.getElementById('meeting-form');
if (meetingForm) {
  meetingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // First check if user is admin
    const isAdmin = await checkIsAdmin();
    if (!isAdmin) {
      const msg = document.getElementById('meeting-msg');
      msg.textContent = 'Please login as admin first';
      return;
    }
    
    const name = document.getElementById('meeting-name').value.trim();
    const date = document.getElementById('meeting-date').value || null;
    const daysRaw = document.getElementById('meeting-days').value.trim();
    const allowedRaw = document.getElementById('meeting-allowed').value.trim();
    const voting_open = document.getElementById('meeting-open').checked;
    const msg = document.getElementById('meeting-msg');
    msg.textContent = '';
    const candidate_days = daysRaw ? daysRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    const allowed_movie_ids = allowedRaw ? allowedRaw.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n)) : null;
    try {
      const headers = { 'Content-Type':'application/json' };
      const token = getAdminToken(); if (token) headers['X-Admin-Token'] = token;
      const res = await fetch('/api/meetings', { method: 'POST', headers, body: JSON.stringify({ name, date, candidate_days, allowed_movie_ids, voting_open }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const errMsg = body && body.error ? body.error : `Failed to create meeting (status ${res.status})`;
        throw new Error(errMsg);
      }
      msg.textContent = 'Meeting created';
      meetingForm.reset();
      // refresh selectors and list
      await populateMeetingSelectors();
      await renderMeetingsList();
    } catch (err) {
      msg.textContent = err.message || 'Error creating meeting';
    }
  });
}

async function populateRankSelectors(allowedMovieIds) {
  let movies = await fetchMovies();
  if (allowedMovieIds && Array.isArray(allowedMovieIds)) {
    const allowedSet = new Set(allowedMovieIds.map(String));
    movies = movies.filter(m => allowedSet.has(String(m.id)));
  }
  const rank1 = document.getElementById('rank1');
  const rank2 = document.getElementById('rank2');
  const rank3 = document.getElementById('rank3');
  // If there are no rank selectors on the page, nothing to do
  if (!rank1 && !rank2 && !rank3) return;
  [rank1, rank2, rank3].forEach(s => { if (s) s.innerHTML = ''; });

  const defaultOpt = (text) => { const o = document.createElement('option'); o.value = ''; o.textContent = text; o.disabled = true; o.selected = true; return o; };
  // Add 'Undecided' placeholder to all three selects so users must actively choose
  if (rank1) rank1.appendChild(defaultOpt('Undecided'));
  if (rank2) rank2.appendChild(defaultOpt('Undecided'));
  if (rank3) rank3.appendChild(defaultOpt('Undecided'));

  for (const m of movies) {
    const o1 = document.createElement('option'); o1.value = m.id; o1.textContent = m.title;
    const o2 = o1.cloneNode(true);
    const o3 = o1.cloneNode(true);
    if (rank1) rank1.appendChild(o1);
    if (rank2) rank2.appendChild(o2);
    if (rank3) rank3.appendChild(o3);
  }

  // Prevent selecting same movie for multiple ranks
  function syncDisable() {
    const selectors = [rank1, rank2, rank3].filter(Boolean);
    const vals = selectors.map(s => s.value).filter(v => v);
    
    // Reset all options first
    selectors.forEach(sel => {
      for (const opt of sel.options) {
        // keep placeholder (empty value) disabled so it can't be chosen once options are shown
        opt.disabled = (opt.value === '');
      }
    });
    
    // Disable options that are already selected in other dropdowns
    for (const sel of selectors) {
      for (const opt of sel.options) {
        if (opt.value && vals.includes(opt.value) && sel.value !== opt.value) {
          opt.disabled = true;
        }
      }
    }
    
    // Add visual feedback for disabled options
    selectors.forEach(sel => {
      for (const opt of sel.options) {
        if (opt.disabled && opt.value) {
          opt.textContent = opt.textContent.replace(' (selected)', '') + ' (selected)';
        } else if (opt.value) {
          opt.textContent = opt.textContent.replace(' (selected)', '');
        }
      }
    });
  }
  
  // Enhanced validation on dropdown changes
  function validateSelection() {
    syncDisable();
    
    // Clear any previous duplicate warnings
    const msg = document.getElementById('vote-msg');
    if (msg && msg.textContent.includes('same movie')) {
      msg.textContent = '';
      msg.className = 'mt-2';
    }
  }
  
  [rank1, rank2, rank3].forEach(s => { 
    if (s) {
      s.addEventListener('change', validateSelection);
      // Also validate on focus out to catch edge cases
      s.addEventListener('blur', validateSelection);
    }
  });
}

// Handlers
const suggestForm = document.getElementById('suggest-form');
if (suggestForm) {
  suggestForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  // Get the submit button
  const submitBtn = suggestForm.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn ? submitBtn.textContent : '';
  
  try {
    // Disable the submit button and show loading state
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
    }
    
    const title = document.getElementById('suggest-title').value.trim();
    const poster = document.getElementById('suggest-poster').value.trim();
    const notes = document.getElementById('suggest-notes').value.trim();
    const suggester = document.getElementById('suggest-name').value.trim();
    const msg = document.getElementById('suggest-msg');
    msg.textContent = '';
    
    if (!title) { 
      msg.textContent = 'Title required'; 
      return; 
    }
    
    // enforce IMDB link
    const imdbRe = /imdb\.com\/title\/(tt\d+)/i;
    if (!poster || !imdbRe.test(poster)) { 
      msg.textContent = 'Poster must be an IMDB movie link (https://www.imdb.com/title/tt...)'; 
      return; 
    }
    
    // Update button text to indicate poster loading
    if (submitBtn) {
      submitBtn.textContent = 'Loading poster...';
    }
    
    const res = await fetch('/api/movies', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ title, poster, notes, suggester }) });
    if (!res.ok) throw new Error('Failed');
    
    await renderMovies();
    await populateRankSelectors();
    msg.textContent = 'Suggestion submitted!';
    document.getElementById('suggest-form').reset();
  } catch (err) {
    const msg = document.getElementById('suggest-msg');
    msg.textContent = 'Error submitting suggestion';
  } finally {
    // Always re-enable the submit button and restore original text
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  }
  });
}

const voteForm = document.getElementById('vote-form');
if (voteForm) {
  voteForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('vote-name').value.trim();
  const meetingSelectElem = document.getElementById('meeting-select');
  const meetingId = meetingSelectElem ? meetingSelectElem.value : (window.currentOpenMeeting ? String(window.currentOpenMeeting.id) : null);
  const r1 = document.getElementById('rank1').value;
  const r2 = document.getElementById('rank2').value;
  const r3 = document.getElementById('rank3').value;
  const msg = document.getElementById('vote-msg');
  msg.textContent = '';
  if (!username) { msg.textContent = 'Name is required'; return; }
  if (!r1) { msg.textContent = 'Please select a 1st choice'; return; }
  if (!r2) { msg.textContent = 'Please select a 2nd choice'; return; }
  if (!r3) { msg.textContent = 'Please select a 3rd choice'; return; }
  if (!meetingId) { msg.textContent = 'No meeting available to vote for'; return; }
  
  // Check for duplicate movie selections
  const selectedMovies = [r1, r2, r3];
  const uniqueMovies = new Set(selectedMovies);
  if (uniqueMovies.size !== selectedMovies.length) {
    msg.textContent = 'You cannot select the same movie for multiple choices. Please choose three different movies.';
    return;
  }
  const ranks = [
    { rank: 1, movieId: Number(r1) },
    { rank: 2, movieId: Number(r2) },
    { rank: 3, movieId: Number(r3) }
  ];
  // collect availability
  let availability = [];
  
  // Collect from checkboxes (candidate dates and custom dates)
  const availChecks = document.querySelectorAll('input[name="availability"]');
  availChecks.forEach(cb => { 
    if (cb.type === 'checkbox' && cb.checked) {
      availability.push(cb.value);
    } else if (cb.type === 'hidden') {
      availability.push(cb.value);
    }
  });
  
  // Collect from selected date badges (fallback mode)
  const selectedDateBadges = document.querySelectorAll('#selected-dates .badge[data-value]');
  selectedDateBadges.forEach(badge => {
    availability.push(badge.dataset.value);
  });
  
  // Fallback to free text input (legacy support)
  if (availability.length === 0) {
    const free = document.getElementById('availability-free');
    if (free && free.value.trim()) {
      availability = free.value.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  try {
    const res = await fetch('/api/votes', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ username, ranks, meetingId, availability }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to submit votes');
    msg.textContent = 'Votes submitted!';
    document.getElementById('vote-form').reset();
    await renderResults();
    await populateRankSelectors();
  } catch (err) {
    msg.textContent = err.message || 'Error submitting votes';
  }
  });
}

// Initial load
(async function init() {
  // Run only the parts needed on the current page
  await populateMeetingSelectors();
  await renderMovies();
  await populateRankSelectors();
  await renderResults();
  // if there is a meetings list on the page, render it now
  if (document.getElementById('meetings-list')) await renderMeetingsList();
  // Admin UI setup for meetings page
  const adminArea = document.getElementById('admin-area');
  if (adminArea) {
    const passInput = document.getElementById('admin-pass');
    const loginBtn = document.getElementById('admin-login-btn');
    const logoutBtn = document.getElementById('admin-logout-btn');
    const adminMsg = document.getElementById('admin-msg');
      async function refreshAdminUI() {
      const isAdmin = await checkIsAdmin();
      const meetingFormContent = document.getElementById('meeting-form-content');
      if (isAdmin) {
        passInput.classList.add('d-none');
        loginBtn.classList.add('d-none');
        logoutBtn.classList.remove('d-none');
        // show meeting form
        if (meetingFormContent) meetingFormContent.classList.remove('d-none');
      } else {
        passInput.classList.remove('d-none');
        loginBtn.classList.remove('d-none');
        logoutBtn.classList.add('d-none');
        if (meetingFormContent) meetingFormContent.classList.add('d-none');
      }
    }
    loginBtn.addEventListener('click', async (e) => {
      e.preventDefault(); // Prevent form submission
      adminMsg.textContent = '';
      const pw = passInput.value || '';
      try {
        const res = await fetch('/api/admin/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ password: pw }) });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body && body.error ? body.error : 'login failed');
        setAdminToken(body.token);
        await refreshAdminUI();
        await populateMeetingSelectors();
        await renderMeetingsList();
      } catch (err) {
        adminMsg.textContent = err.message || 'Login failed';
      }
    });
    logoutBtn.addEventListener('click', async () => {
      try {
        const token = getAdminToken();
        await fetch('/api/admin/logout', { method: 'POST', headers: { 'X-Admin-Token': token } }).catch(()=>{});
      } catch(e){}
      setAdminToken(null);
      await refreshAdminUI();
      await populateMeetingSelectors();
      await renderMeetingsList();
    });
    // initial state
    await refreshAdminUI();
  }
  
})();