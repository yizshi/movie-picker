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

// Admin token helpers
function getAdminToken() { try { return localStorage.getItem('adminToken'); } catch(e){ return null; } }
function setAdminToken(t) { try { if (t) localStorage.setItem('adminToken', t); else localStorage.removeItem('adminToken'); } catch(e){} }
async function checkIsAdmin() {
  const token = getAdminToken();
  if (!token) return false;
  const res = await fetch('/api/admin/me', { headers: { 'X-Admin-Token': token } });
  try { const body = await res.json(); return !!body.admin; } catch(e){ return false; }
}

async function renderMovies() {
  const movies = await fetchMovies();
  const container = document.getElementById('movies-list');
  if (!container) return; // page doesn't show a movies list
  container.innerHTML = '';
  if (!movies.length) {
    container.innerHTML = '<div class="text-muted">No suggestions yet.</div>';
    return;
  }
  for (const m of movies) {
    const col = el('div', 'col-12');
    const card = el('div', 'card flex-row');
    card.style.alignItems = 'stretch';
    const imgDiv = el('div', '');
    const img = el('img', 'img-fluid');
    img.src = m.poster || 'https://via.placeholder.com/120x180?text=No+Poster';
    img.alt = m.title;
    img.width = 120; img.height = 180;
    img.style.objectFit = 'cover';
    imgDiv.appendChild(img);
    imgDiv.style.padding = '0.5rem';

    const body = el('div', 'card-body');
    const h5 = el('h5', 'card-title'); h5.textContent = m.title;
    const p = el('p', 'card-text'); p.textContent = m.notes || '';
    const small = el('div', 'text-muted'); small.textContent = m.suggester ? `Suggested by ${m.suggester}` : '';
    body.appendChild(h5); body.appendChild(p); body.appendChild(small);

    card.appendChild(imgDiv); card.appendChild(body);
    col.appendChild(card);
    container.appendChild(col);
  }
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
    const notes = el('div'); notes.textContent = r.notes || '';
    div.appendChild(title); div.appendChild(notes);
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
      const card = `
        <div class="col-12">
          <div class="card flex-row">
            <div style="padding:0.5rem">
              <img src="${top.poster || 'https://via.placeholder.com/240x360?text=No+Poster'}" alt="${top.title}" width="160" height="240" style="object-fit:cover" />
            </div>
            <div class="card-body">
              <h3 class="card-title">${top.title}</h3>
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
  if (meeting && meeting.candidate_days && meeting.candidate_days.length) {
    const wrap = document.createElement('div');
    meeting.candidate_days.forEach(d => {
      const id = `avail-${d}`.replace(/[^a-z0-9\-]/gi,'');
      const div = document.createElement('div'); div.className = 'form-check';
      const cb = document.createElement('input'); cb.className = 'form-check-input'; cb.type = 'checkbox'; cb.id = id; cb.value = d; cb.name = 'availability';
      const lbl = document.createElement('label'); lbl.className = 'form-check-label'; lbl.htmlFor = id; lbl.textContent = d;
      div.appendChild(cb); div.appendChild(lbl); wrap.appendChild(div);
    });
    container.appendChild(wrap);
  } else {
    const note = document.createElement('small'); note.className = 'form-text text-muted mb-1'; note.textContent = 'No preset days for this meeting — enter dates or days separated by commas.';
    const input = document.createElement('input'); input.type = 'text'; input.className = 'form-control'; input.id = 'availability-free'; input.placeholder = 'e.g. 2025-11-01, 2025-11-02';
    container.appendChild(note); container.appendChild(input);
  }
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
      if (dateCountsElem) {
        if (chosenMeeting.date_counts && chosenMeeting.date_counts.length) {
          // render as a comma-separated list like "2025-10-30: 3 votes, 2025-10-31: 1 vote"
          const parts = chosenMeeting.date_counts.map(dc => `${dc.date}: ${dc.count} vote${dc.count === 1 ? '' : 's'}`);
          dateCountsElem.textContent = `Votes by date: ${parts.join(', ')}`;
        } else {
          dateCountsElem.textContent = '';
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
    selectors.forEach(sel => {
      for (const opt of sel.options) {
        // keep placeholder (empty value) disabled so it can't be chosen once options are shown
        opt.disabled = (opt.value === '');
      }
    });
    for (const sel of selectors) {
      for (const opt of sel.options) {
        if (opt.value && vals.includes(opt.value) && sel.value !== opt.value) {
          opt.disabled = true;
        }
      }
    }
  }
  [rank1, rank2, rank3].forEach(s => { if (s) s.addEventListener('change', syncDisable); });
}

// Handlers
const suggestForm = document.getElementById('suggest-form');
if (suggestForm) {
  suggestForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('suggest-title').value.trim();
  const poster = document.getElementById('suggest-poster').value.trim();
  const notes = document.getElementById('suggest-notes').value.trim();
  const suggester = document.getElementById('suggest-name').value.trim();
  const msg = document.getElementById('suggest-msg');
  msg.textContent = '';
  if (!title) { msg.textContent = 'Title required'; return; }
  // enforce IMDB link
  const imdbRe = /imdb\.com\/title\/(tt\d+)/i;
  if (!poster || !imdbRe.test(poster)) { msg.textContent = 'Poster must be an IMDB movie link (https://www.imdb.com/title/tt...)'; return; }
  try {
    const res = await fetch('/api/movies', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ title, poster, notes, suggester }) });
    if (!res.ok) throw new Error('Failed');
    await renderMovies();
    await populateRankSelectors();
    msg.textContent = 'Suggestion submitted!';
    document.getElementById('suggest-form').reset();
  } catch (err) {
    msg.textContent = 'Error submitting suggestion';
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
  const ranks = [
    { rank: 1, movieId: Number(r1) },
    { rank: 2, movieId: Number(r2) },
    { rank: 3, movieId: Number(r3) }
  ];
  // collect availability
  let availability = [];
  const availChecks = document.querySelectorAll('input[name="availability"]');
  if (availChecks && availChecks.length) {
    availChecks.forEach(cb => { if (cb.checked) availability.push(cb.value); });
  } else {
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