// =========================================================
// CHRONA — HIGH-PRECISION TEMPORAL ENGINE
// Architecture:
// 1. Core Mathematical Temporal Primitives (Zero-latency Intl)
// 2. 0ms Fast In-Memory Location Search with Typo & Prefix Scoring
// 3. Bidirectional Double-Bezel Time Converter
// 4. Real-Time World Observatory (Bento Grid)
// 5. Temporal Calculator (Delta Interval & Duration Offset)
// =========================================================

// ── TEMPORAL MATH & INTL PRIMITIVES ──────────────────────
function getTimezoneParts(date, tz) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false
    });
    const parts = {};
    formatter.formatToParts(date).forEach(p => {
      if (p.type !== 'literal') parts[p.type] = parseInt(p.value, 10);
    });
    parts.hour = parts.hour % 24;
    return parts;
  } catch (e) {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds()
    };
  }
}

function getTimezoneOffsetMs(date, tz) {
  const parts = getTimezoneParts(date, tz);
  const wallClockUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return wallClockUtc - date.getTime();
}

function wallClockToEpoch(year, month, day, hour, minute, tz) {
  const guessUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset1 = getTimezoneOffsetMs(new Date(guessUtc), tz);
  let targetMs = guessUtc - offset1;
  const offset2 = getTimezoneOffsetMs(new Date(targetMs), tz);
  if (offset1 !== offset2) {
    targetMs = guessUtc - offset2;
  }
  return targetMs;
}

function getAbbreviation(tz, date) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short'
    });
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    return tzPart ? tzPart.value : '';
  } catch {
    return '';
  }
}

function getOffsetLabel(tz, date) {
  try {
    const offMs = getTimezoneOffsetMs(date, tz);
    const totalMinutes = Math.round(offMs / 60000);
    const sign = totalMinutes >= 0 ? '+' : '-';
    const absM = Math.abs(totalMinutes);
    const h = Math.floor(absM / 60);
    const m = absM % 60;
    return `UTC${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  } catch {
    return 'UTC';
  }
}

function parseNaturalTime(str, currentParts) {
  if (!str) return null;
  const s = str.trim().toLowerCase();

  if (s === 'now') {
    const d = new Date();
    return { hour: d.getHours(), minute: d.getMinutes(), isNow: true };
  }
  if (s === 'noon' || s === 'midday') return { hour: 12, minute: 0 };
  if (s === 'midnight') return { hour: 0, minute: 0 };

  // Compact 3-4 digits e.g. 830, 1545, 930p
  const compact = s.match(/^(\d{3,4})\s*([ap]m?)?$/i);
  if (compact) {
    const rawNum = compact[1];
    const mer = compact[2] ? compact[2].toLowerCase() : null;
    let h = parseInt(rawNum.slice(0, rawNum.length - 2), 10);
    const m = parseInt(rawNum.slice(-2), 10);
    if (m >= 60 || h > 24) return null;
    if (mer) {
      const isPm = mer.startsWith('p');
      if (isPm && h < 12) h += 12;
      else if (!isPm && h === 12) h = 0;
    }
    return { hour: h % 24, minute: m };
  }

  // Standard: 3, 3:30, 3p, 3:30pm, 15:45, 9.30
  const standard = s.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*([ap]m?|am|pm)?$/i);
  if (standard) {
    let h = parseInt(standard[1], 10);
    const m = standard[2] ? parseInt(standard[2], 10) : 0;
    const mer = standard[3] ? standard[3].toLowerCase() : null;
    if (m >= 60) return null;

    if (mer) {
      const isPm = mer.startsWith('p');
      if (isPm && h < 12) h += 12;
      else if (!isPm && h === 12) h = 0;
    } else if (h <= 12 && standard[2] === undefined && currentParts) {
      if (currentParts.hour >= 12 && h < 12) h += 12;
    }
    return { hour: h % 24, minute: m };
  }
  return null;
}

// ── NAVIGATION TABS (CONVERTER, WORLD CLOCK, CALCULATOR) ──
const viewTabs = [
  { btnId: 'tabConverter', viewId: 'viewConverter' },
  { btnId: 'tabWorldClock', viewId: 'viewWorldClock' },
  { btnId: 'tabTimeCalc', viewId: 'viewTimeCalc' }
];

function activateView(targetViewId) {
  viewTabs.forEach(({ btnId, viewId }) => {
    const btn = document.getElementById(btnId);
    const view = document.getElementById(viewId);
    const isActive = viewId === targetViewId;
    if (btn) btn.classList.toggle('active', isActive);
    if (view) view.hidden = !isActive;
  });

  if (targetViewId === 'viewWorldClock') renderWorldBento();
  if (targetViewId === 'viewTimeCalc') runCalculator();
}

viewTabs.forEach(({ btnId, viewId }) => {
  const btn = document.getElementById(btnId);
  if (btn) btn.addEventListener('click', () => activateView(viewId));
});

const footLinks = [
  { id: 'footBtnConv', view: 'viewConverter' },
  { id: 'footBtnWorld', view: 'viewWorldClock' },
  { id: 'footBtnCalc', view: 'viewTimeCalc' }
];
footLinks.forEach(({ id, view }) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', (e) => { e.preventDefault(); activateView(view); });
});

const brandBtn = document.getElementById('brandBtn');
if (brandBtn) {
  brandBtn.addEventListener('click', () => activateView('viewConverter'));
}

// ── 0MS IN-MEMORY SEARCH ENGINE ──────────────────────────
let masterLocationList = [];

function initMasterLocations() {
  const base = Array.isArray(globalThis.TZ_LIST) ? [...globalThis.TZ_LIST] : [];
  const knownTzs = new Set(base.map(entry => entry.tz));

  // Merge in all 420 IANA zones
  if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
    try {
      const allIana = Intl.supportedValuesOf('timeZone');
      for (const tz of allIana) {
        if (!knownTzs.has(tz)) {
          const parts = tz.split('/');
          const cityRaw = parts[parts.length - 1].replace(/_/g, ' ');
          const regionRaw = parts.length > 2 ? parts[1].replace(/_/g, ' ') : '';
          const friendlyCity = regionRaw ? `${cityRaw} (${regionRaw})` : cityRaw;
          base.push({
            city: friendlyCity,
            tz: tz,
            country: parts[0] || ''
          });
          knownTzs.add(tz);
        }
      }
    } catch {}
  }
  masterLocationList = base;
}

function findLocation(tzName) {
  const found = masterLocationList.find(t => t.tz === tzName);
  if (found) return found;
  const parts = tzName.split('/');
  return {
    city: parts[parts.length - 1].replace(/_/g, ' '),
    tz: tzName,
    country: parts[0] || ''
  };
}

// High-speed 0ms In-Memory Fuzzy & Prefix Ranker
function filterLocationsInMemory(rawQuery) {
  if (!rawQuery) return masterLocationList.slice(0, 40);
  const q = rawQuery.trim().toLowerCase();
  if (!q) return masterLocationList.slice(0, 40);

  const scored = [];
  const now = new Date();

  for (const item of masterLocationList) {
    const city = item.city.toLowerCase();
    const tz = item.tz.toLowerCase();
    const country = (item.country || '').toLowerCase();
    const aliases = Array.isArray(item.aliases) ? item.aliases.map(a => a.toLowerCase()) : [];
    const offset = getOffsetLabel(item.tz, now).toLowerCase();

    let score = 0;

    // Exact match
    if (city === q) score += 200;
    if (aliases.some(a => a === q)) score += 190;
    if (country === q) score += 140;

    // Word boundary start
    if (city.startsWith(q)) score += 110;
    else if (aliases.some(a => a.startsWith(q))) score += 100;
    else if (city.includes(' ' + q) || city.includes('(' + q)) score += 80;

    // Substring match
    if (city.includes(q)) score += 35;
    if (aliases.some(a => a.includes(q))) score += 30;
    if (tz.includes(q)) score += 25;
    if (offset.includes(q)) score += 30;

    if (score > 0) {
      scored.push({ item, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 45).map(s => s.item);
}

// Async Remote Fallback (Non-blocking Typesense search)
const TYPESENSE_URL = 'https://dateful.com/app2/collections/timezones-en/documents/search';
const TYPESENSE_KEY = 'ywkaaYXX39trymoVSUgMNeLFGnbE4Kae';
let activeAbortController = null;

async function fetchRemoteLocations(rawQuery) {
  if (activeAbortController) activeAbortController.abort();
  activeAbortController = new AbortController();

  try {
    const resp = await fetch(`${TYPESENSE_URL}?q=${encodeURIComponent(rawQuery)}&query_by=name&per_page=25`, {
      headers: { 'x-typesense-api-key': TYPESENSE_KEY },
      signal: activeAbortController.signal
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    if (!json || !json.hits) return [];

    return json.hits.map(hit => {
      const doc = hit.document || {};
      const d = doc.data || {};
      let tz = d.iana_zone_name || d.warning_iana;
      if (!tz && typeof d.offset === 'number') {
        if (d.name && d.name.includes('Indian Standard Time')) tz = 'Asia/Kolkata';
        else if (d.name && (d.name.includes('Israel') || d.name.includes('Jerusalem'))) tz = 'Asia/Jerusalem';
        else if (d.name && (d.name.includes('Irish') || d.name.includes('Ireland'))) tz = 'Europe/Dublin';
        else {
          const offH = d.offset / 3600;
          tz = 'Etc/GMT' + (offH >= 0 ? '-' : '+') + Math.floor(Math.abs(offH));
        }
      }
      return {
        city: d.name || doc.name,
        tz: tz || 'UTC',
        country: d.country || ''
      };
    });
  } catch (e) {
    return [];
  }
}

// ── TIME ZONE CONVERTER (Double-Bezel Architecture) ───────
let baseEpochMs = Date.now();
let activeClockId = 0;
let is24HourFormat = false;
let converterMode = 'time'; // 'time' or 'date'
let clockCounter = 1;
let activeScrub = 'now'; // tracks last scrub action: 'now' | '-3600000' | '3600000'

let converterClocks = [];

// World Observatory state (declared here so loadState can populate before render)
let bentoWorldHubs = [
  { city: 'London', tz: 'Europe/London', country: 'United Kingdom' },
  { city: 'New York', tz: 'America/New_York', country: 'United States' },
  { city: 'Tokyo', tz: 'Asia/Tokyo', country: 'Japan' },
  { city: 'Sydney', tz: 'Australia/Sydney', country: 'Australia' },
  { city: 'Paris', tz: 'Europe/Paris', country: 'France' },
  { city: 'Dubai', tz: 'Asia/Dubai', country: 'United Arab Emirates' },
  { city: 'Singapore', tz: 'Asia/Singapore', country: 'Singapore' },
  { city: 'Zurich', tz: 'Europe/Zurich', country: 'Switzerland' }
];
let isWc24Hour = false;

// ── PERSISTENCE ──────────────────────────────────────────
const STORAGE_KEY = 'chrona-state-v1';

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      converterClocks: converterClocks.map(c => ({ city: c.city, tz: c.tz, country: c.country, tag: c.tag })),
      is24HourFormat,
      converterMode,
      bentoWorldHubs,
      isWc24Hour
    }));
  } catch {}
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setupInitialConverterClocks() {
  const saved = loadState();

  if (saved && Array.isArray(saved.converterClocks) && saved.converterClocks.length >= 2) {
    // Restore saved zones
    converterClocks = saved.converterClocks.map(c => ({ ...c, id: clockCounter++ }));
    is24HourFormat = !!saved.is24HourFormat;
    converterMode = saved.converterMode === 'date' ? 'date' : 'time';

    // Restore world clock hubs if present
    if (Array.isArray(saved.bentoWorldHubs) && saved.bentoWorldHubs.length > 0) {
      bentoWorldHubs = saved.bentoWorldHubs;
    }
    isWc24Hour = !!saved.isWc24Hour;
  } else {
    // Fresh defaults
    let localTz = 'UTC';
    try {
      localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {}

    const localInfo = findLocation(localTz);
    converterClocks.push({
      id: clockCounter++,
      city: localInfo.city,
      tz: localInfo.tz,
      country: localInfo.country || '',
      tag: 'LOCAL SYSTEM'
    });

    const comparisonTz = (localTz === 'America/New_York') ? 'Europe/London' : 'America/New_York';
    const compInfo = findLocation(comparisonTz);
    converterClocks.push({
      id: clockCounter++,
      city: compInfo.city,
      tz: compInfo.tz,
      country: compInfo.country || '',
      tag: 'REFERENCE'
    });
  }

  activeClockId = converterClocks[0].id;
}

const converterClockGrid = document.getElementById('converterClockGrid');

function renderConverterGrid() {
  if (!converterClockGrid) return;
  saveState();
  converterClockGrid.innerHTML = '';

  const refClock = converterClocks.find(c => c.id === activeClockId) || converterClocks[0];
  const refParts = getTimezoneParts(new Date(baseEpochMs), refClock.tz);

  converterClocks.forEach((clock, index) => {
    const cell = document.createElement('div');
    cell.className = 'clock-cell';
    cell.id = `clock-cell-${clock.id}`;
    cell.setAttribute('data-clock-id', clock.id);

    const parts = getTimezoneParts(new Date(baseEpochMs), clock.tz);
    const abbrev = getAbbreviation(clock.tz, new Date(baseEpochMs));
    const offset = getOffsetLabel(clock.tz, new Date(baseEpochMs));

    // Daytime vs Nighttime (6 AM to 6 PM)
    const isDay = parts.hour >= 6 && parts.hour < 18;

    // Relative day badge
    const refDayUtc = Date.UTC(refParts.year, refParts.month - 1, refParts.day);
    const targetDayUtc = Date.UTC(parts.year, parts.month - 1, parts.day);
    const diffDays = Math.round((targetDayUtc - refDayUtc) / 86400000);

    let relBadgeHtml = '<span class="relative-day-chip is-same">TODAY</span>';
    if (diffDays === 1) relBadgeHtml = '<span class="relative-day-chip is-next">+1 DAY</span>';
    else if (diffDays === -1) relBadgeHtml = '<span class="relative-day-chip is-prev">-1 DAY</span>';
    else if (diffDays > 1) relBadgeHtml = `<span class="relative-day-chip is-next">+${diffDays} DAYS</span>`;
    else if (diffDays < -1) relBadgeHtml = `<span class="relative-day-chip is-prev">${diffDays} DAYS</span>`;

    // Time value formatting – AM/PM rendered as overlay, not in input value
    let timeVal = '';
    let ampmOverlay = '';
    const mStr = String(parts.minute).padStart(2, '0');
    if (is24HourFormat) {
      timeVal = `${String(parts.hour).padStart(2, '0')}:${mStr}`;
    } else {
      ampmOverlay = parts.hour >= 12 ? 'PM' : 'AM';
      let h12 = parts.hour % 12;
      if (h12 === 0) h12 = 12;
      timeVal = `${h12}:${mStr}`;
    }

    const dateVal = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    let formattedFullDate = '';
    try {
      formattedFullDate = new Date(baseEpochMs).toLocaleDateString('en-US', {
        timeZone: clock.tz,
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      formattedFullDate = dateVal;
    }

    cell.innerHTML = `
      <div class="clock-cell-header">
        <span class="clock-tag-pill">${clock.tag}</span>
        <div class="cell-actions">
          <span class="daynight-indicator ${isDay ? 'day' : 'night'}">
            ${isDay ? '☀️ DAY' : '🌙 NIGHT'}
          </span>
          ${converterClocks.length > 2 ? `<button type="button" class="btn-cell-delete" data-action="delete" title="Remove">&times;</button>` : ''}
        </div>
      </div>

      <div class="time-input-plate">
        ${converterMode === 'time' ? `
          <input
            type="search"
            class="chrono-time-input ${clock.id === activeClockId ? 'is-focused-origin' : ''}"
            id="cell-input-${clock.id}"
            value="${timeVal}"
            spellcheck="false"
            autocomplete="off"
            aria-label="Time in ${clock.city}"
          />
          ${ampmOverlay ? `<span class="ampm-overlay">${ampmOverlay}</span>` : ''}
          ${relBadgeHtml}
        ` : `
          <input
            type="date"
            class="chrono-date-input ${clock.id === activeClockId ? 'is-focused-origin' : ''}"
            id="cell-date-${clock.id}"
            value="${dateVal}"
            aria-label="Date in ${clock.city}"
          />
          ${relBadgeHtml}
        `}
      </div>

      <!-- Quick Step Scrub Row -->
      <div class="scrub-row">
        <button type="button" class="scrub-btn ${activeScrub === '-3600000' ? 'is-active' : ''}" data-scrub="-3600000">&minus;1h</button>
        <button type="button" class="scrub-btn ${activeScrub === '3600000' ? 'is-active' : ''}" data-scrub="3600000">+1h</button>
        <button type="button" class="scrub-btn ${activeScrub === 'now' ? 'is-active' : ''}" data-scrub="now">NOW</button>
      </div>

      <!-- City Selector Trigger -->
      <button type="button" class="city-picker-trigger" data-action="choose-city">
        <div class="city-meta-block">
          <div class="city-title-row">
            <span class="city-name-text" title="${clock.city}">${clock.city}</span>
          </div>
          <span class="city-sub-text" title="${offset} · ${clock.tz}">${offset} &middot; ${clock.tz}</span>
        </div>
        <div class="city-picker-right">
          <span class="abbrev-badge">${abbrev || 'UTC'}</span>
          <svg class="city-picker-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
      </button>

      <div class="cell-date-display">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
        <span>${formattedFullDate}</span>
      </div>
    `;

    // Hook inputs
    if (converterMode === 'time') {
      const timeInp = cell.querySelector('.chrono-time-input');
      timeInp.addEventListener('focus', () => {
        activeClockId = clock.id;
        timeInp.classList.add('is-focused-origin');
      });
      timeInp.addEventListener('input', (e) => onConverterTimeTyping(clock.id, e.target.value));
      timeInp.addEventListener('change', (e) => onConverterTimeCommit(clock.id, e.target.value));
    } else {
      const dateInp = cell.querySelector('.chrono-date-input');
      dateInp.addEventListener('focus', () => { activeClockId = clock.id; });
      dateInp.addEventListener('change', (e) => onConverterDateCommit(clock.id, e.target.value));
    }

    // Scrub buttons
    cell.querySelectorAll('.scrub-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const scrubVal = btn.getAttribute('data-scrub');
        if (scrubVal === 'now') {
          baseEpochMs = Date.now();
        } else {
          baseEpochMs += parseInt(scrubVal, 10);
        }
        activeScrub = scrubVal;
        activeClockId = clock.id;
        renderConverterGrid();
      });
    });

    // Pick city trigger
    const chooseCityBtn = cell.querySelector('[data-action="choose-city"]');
    chooseCityBtn.addEventListener('click', () => {
      openSearchDropdown(chooseCityBtn, selected => {
        clock.city = selected.city;
        clock.tz = selected.tz;
        clock.country = selected.country || '';
        renderConverterGrid();
      });
    });

    // Delete cell
    const delBtn = cell.querySelector('[data-action="delete"]');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        if (converterClocks.length <= 2) return;
        converterClocks = converterClocks.filter(c => c.id !== clock.id);
        if (activeClockId === clock.id) activeClockId = converterClocks[0].id;
        renderConverterGrid();
      });
    }

    converterClockGrid.appendChild(cell);
  });

  // Show tooltip only when text is actually truncated (overflowing)
  converterClockGrid.querySelectorAll('.city-name-text, .city-sub-text').forEach(el => {
    if (el.scrollWidth <= el.clientWidth) el.removeAttribute('title');
  });
}

function onConverterTimeTyping(clockId, val) {
  const clock = converterClocks.find(c => c.id === clockId);
  if (!clock) return;

  const currentParts = getTimezoneParts(new Date(baseEpochMs), clock.tz);
  const parsed = parseNaturalTime(val, currentParts);
  if (!parsed) return;

  activeClockId = clockId;
  if (parsed.isNow) {
    baseEpochMs = Date.now();
    activeScrub = 'now';
  } else {
    activeScrub = null;
    baseEpochMs = wallClockToEpoch(
      currentParts.year,
      currentParts.month,
      currentParts.day,
      parsed.hour,
      parsed.minute,
      clock.tz
    );
  }
  updateSiblingClocks(clockId);
}

function onConverterTimeCommit(clockId, val) {
  onConverterTimeTyping(clockId, val);
  renderConverterGrid();
}

function onConverterDateCommit(clockId, dateStr) {
  const clock = converterClocks.find(c => c.id === clockId);
  if (!clock || !dateStr) return;

  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return;

  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const d = parseInt(match[3], 10);

  const currentParts = getTimezoneParts(new Date(baseEpochMs), clock.tz);
  activeClockId = clockId;
  baseEpochMs = wallClockToEpoch(y, m, d, currentParts.hour, currentParts.minute, clock.tz);
  renderConverterGrid();
}

function updateSiblingClocks(sourceClockId) {
  const refClock = converterClocks.find(c => c.id === sourceClockId) || converterClocks[0];
  const refParts = getTimezoneParts(new Date(baseEpochMs), refClock.tz);

  converterClocks.forEach(clock => {
    if (clock.id === sourceClockId) return;
    const cell = document.getElementById(`clock-cell-${clock.id}`);
    if (!cell) return;

    const parts = getTimezoneParts(new Date(baseEpochMs), clock.tz);
    const mStr = String(parts.minute).padStart(2, '0');
    let timeVal = '';
    let ampmText = '';
    if (is24HourFormat) {
      timeVal = `${String(parts.hour).padStart(2, '0')}:${mStr}`;
    } else {
      ampmText = parts.hour >= 12 ? 'PM' : 'AM';
      let h12 = parts.hour % 12;
      if (h12 === 0) h12 = 12;
      timeVal = `${h12}:${mStr}`;
    }

    const inp = cell.querySelector('.chrono-time-input');
    if (inp) inp.value = timeVal;

    // Update AM/PM overlay
    const ampmEl = cell.querySelector('.ampm-overlay');
    if (ampmEl) ampmEl.textContent = ampmText;

    const dateDisplay = cell.querySelector('.cell-date-display span');
    if (dateDisplay) {
      try {
        dateDisplay.textContent = new Date(baseEpochMs).toLocaleDateString('en-US', {
          timeZone: clock.tz,
          weekday: 'long',
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
      } catch {}
    }
  });
}

// ── CONVERTER BOTTOM ISLAND BAR CONTROLS ─────────────────
const ctrlWidget1224 = document.getElementById('ctrlWidget1224');
const btnFmt12 = document.getElementById('btnFmt12');
const btnFmt24 = document.getElementById('btnFmt24');

function setTimeFormat(use24) {
  is24HourFormat = use24;
  if (ctrlWidget1224) ctrlWidget1224.classList.toggle('right-active', use24);
  if (btnFmt12 && btnFmt24) {
    btnFmt12.classList.toggle('active', !use24);
    btnFmt24.classList.toggle('active', use24);
  }
  renderConverterGrid();
}

if (ctrlWidget1224) {
  ctrlWidget1224.addEventListener('click', () => setTimeFormat(!is24HourFormat));
}

const ctrlWidgetTimeDate = document.getElementById('ctrlWidgetTimeDate');
const btnModeTime = document.getElementById('btnModeTime');
const btnModeDate = document.getElementById('btnModeDate');

function setConverterMode(mode) {
  converterMode = mode;
  const isDate = mode === 'date';
  if (ctrlWidgetTimeDate) ctrlWidgetTimeDate.classList.toggle('right-active', isDate);
  if (btnModeTime && btnModeDate) {
    btnModeTime.classList.toggle('active', !isDate);
    btnModeDate.classList.toggle('active', isDate);
  }
  renderConverterGrid();
}

if (ctrlWidgetTimeDate) {
  ctrlWidgetTimeDate.addEventListener('click', () => {
    setConverterMode(converterMode === 'time' ? 'date' : 'time');
  });
}

const btnNowReset = document.getElementById('btnNowReset');
if (btnNowReset) {
  btnNowReset.addEventListener('click', () => {
    baseEpochMs = Date.now();
    activeScrub = 'now';
    renderConverterGrid();
  });
}

const btnAddZone = document.getElementById('btnAddZone');
if (btnAddZone) {
  btnAddZone.addEventListener('click', () => {
    openSearchDropdown(btnAddZone, selected => {
      converterClocks.push({
        id: clockCounter++,
        city: selected.city,
        tz: selected.tz,
        country: selected.country || '',
        tag: `ZONE ${converterClocks.length + 1}`
      });
      renderConverterGrid();
    });
  });
}

const btnShareLink = document.getElementById('btnShareLink');
const shareBtnText = document.getElementById('shareBtnText');
if (btnShareLink) {
  btnShareLink.addEventListener('click', async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('t', Math.round(baseEpochMs));
    url.searchParams.set('zones', converterClocks.map(c => c.tz).join(','));

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url.toString());
      } else {
        window.prompt('Copy shareable link:', url.toString());
      }
      if (shareBtnText) {
        const orig = shareBtnText.textContent;
        shareBtnText.textContent = 'COPIED!';
        setTimeout(() => { shareBtnText.textContent = orig; }, 2000);
      }
    } catch {
      window.prompt('Copy shareable link:', url.toString());
    }
  });
}

// ── WORLD OBSERVATORY (Bento Grid) ───────────────────────
// (bentoWorldHubs and isWc24Hour declared earlier for state persistence)

const worldClockBento = document.getElementById('worldClockBento');
const wcToggle1224 = document.getElementById('wcToggle1224');
const wcBtn12 = document.getElementById('wcBtn12');
const wcBtn24 = document.getElementById('wcBtn24');
const wcAddCityBtn = document.getElementById('wcAddCityBtn');

if (wcToggle1224) {
  wcToggle1224.addEventListener('click', () => {
    isWc24Hour = !isWc24Hour;
    wcToggle1224.classList.toggle('right-active', isWc24Hour);
    if (wcBtn12 && wcBtn24) {
      wcBtn12.classList.toggle('active', !isWc24Hour);
      wcBtn24.classList.toggle('active', isWc24Hour);
    }
    renderWorldBento();
  });
}

if (wcAddCityBtn) {
  wcAddCityBtn.addEventListener('click', () => {
    openSearchDropdown(wcAddCityBtn, selected => {
      bentoWorldHubs.push({
        city: selected.city,
        tz: selected.tz,
        country: selected.country || ''
      });
      renderWorldBento();
    });
  });
}

function renderWorldBento() {
  if (!worldClockBento) return;
  saveState();
  worldClockBento.innerHTML = '';
  const now = new Date();
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const localOffsetMs = getTimezoneOffsetMs(now, localTz);

  bentoWorldHubs.forEach((hub, idx) => {
    const card = document.createElement('div');
    card.className = 'bento-clock-card';

    const parts = getTimezoneParts(now, hub.tz);
    const abbrev = getAbbreviation(hub.tz, now);
    const offset = getOffsetLabel(hub.tz, now);

    const hubOffsetMs = getTimezoneOffsetMs(now, hub.tz);
    const diffH = (hubOffsetMs - localOffsetMs) / 3600000;
    let diffBadge = 'LOCAL SYSTEM';
    if (diffH > 0) diffBadge = `+${diffH}H AHEAD`;
    else if (diffH < 0) diffBadge = `${diffH}H BEHIND`;

    const mStr = String(parts.minute).padStart(2, '0');
    const sStr = String(parts.second).padStart(2, '0');
    let timeStr = '';
    let ampmStr = '';

    if (isWc24Hour) {
      timeStr = `${String(parts.hour).padStart(2, '0')}:${mStr}`;
    } else {
      ampmStr = parts.hour >= 12 ? 'PM' : 'AM';
      let h12 = parts.hour % 12;
      if (h12 === 0) h12 = 12;
      timeStr = `${h12}:${mStr}`;
    }

    const dateStr = now.toLocaleDateString('en-US', {
      timeZone: hub.tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });

    card.innerHTML = `
      <div class="bento-card-top">
        <div>
          <div class="bento-city-title">${hub.city}</div>
          <div class="bento-country-sub">${hub.country || hub.tz}</div>
        </div>
        <button type="button" class="btn-bento-remove" data-idx="${idx}" title="Remove">&times;</button>
      </div>

      <div class="bento-time-row">
        <span class="bento-time-digits">${timeStr}</span>
        ${ampmStr ? `<span class="bento-ampm">${ampmStr}</span>` : ''}
        <span class="bento-seconds">:${sStr}</span>
      </div>

      <div class="bento-bottom-meta">
        <span>${dateStr} &middot; ${abbrev || offset}</span>
        <span class="bento-diff-chip">${diffBadge}</span>
      </div>
    `;

    card.querySelector('.btn-bento-remove').addEventListener('click', () => {
      bentoWorldHubs.splice(idx, 1);
      renderWorldBento();
    });

    worldClockBento.appendChild(card);
  });
}

// Live tick for World Observatory every second
setInterval(() => {
  const wcView = document.getElementById('viewWorldClock');
  if (wcView && !wcView.hidden) {
    renderWorldBento();
  }
}, 1000);

// ── TEMPORAL CALCULATOR (High-Precision Delta Engine) ─────
const calcModeToggle = document.getElementById('calcModeToggle');
const calcModeBetween = document.getElementById('calcModeBetween');
const calcModeAfter = document.getElementById('calcModeAfter');
const calcPanelBetween = document.getElementById('calcPanelBetween');
const calcPanelAfter = document.getElementById('calcPanelAfter');

let calcActiveMode = 'between'; // 'between' or 'after'

if (calcModeToggle) {
  calcModeToggle.addEventListener('click', () => {
    calcActiveMode = (calcActiveMode === 'between') ? 'after' : 'between';
    calcModeToggle.classList.toggle('right-active', calcActiveMode === 'after');
    if (calcModeBetween && calcModeAfter) {
      calcModeBetween.classList.toggle('active', calcActiveMode === 'between');
      calcModeAfter.classList.toggle('active', calcActiveMode === 'after');
    }
    if (calcPanelBetween && calcPanelAfter) {
      calcPanelBetween.hidden = calcActiveMode !== 'between';
      calcPanelAfter.hidden = calcActiveMode !== 'after';
    }
    runCalculator();
  });
}

const calcInputStart = document.getElementById('calcInputStart');
const calcInputEnd = document.getElementById('calcInputEnd');
const calcOutputDiff = document.getElementById('calcOutputDiff');

const calcInputBase = document.getElementById('calcInputBase');
const calcSelectOp = document.getElementById('calcSelectOp');
const calcFieldDays = document.getElementById('calcFieldDays');
const calcFieldHours = document.getElementById('calcFieldHours');
const calcFieldMins = document.getElementById('calcFieldMins');
const calcOutputAdd = document.getElementById('calcOutputAdd');

function initCalculatorDefaults() {
  const now = new Date();
  const later = new Date(now.getTime() + (3 * 86400000) + (5 * 3600000) + (45 * 60000));

  const toInputFmt = d => {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  if (calcInputStart && !calcInputStart.value) calcInputStart.value = toInputFmt(now);
  if (calcInputEnd && !calcInputEnd.value) calcInputEnd.value = toInputFmt(later);
  if (calcInputBase && !calcInputBase.value) calcInputBase.value = toInputFmt(now);
}

function runCalculator() {
  if (calcActiveMode === 'between') {
    if (!calcInputStart || !calcInputEnd || !calcOutputDiff) return;
    const t1 = new Date(calcInputStart.value).getTime();
    const t2 = new Date(calcInputEnd.value).getTime();
    if (isNaN(t1) || isNaN(t2)) {
      calcOutputDiff.innerHTML = '<span class="calc-result-subtext">Select valid start and end timestamps.</span>';
      return;
    }
    const diffMs = t2 - t1;
    const isPast = diffMs < 0;
    const absMs = Math.abs(diffMs);

    const totalSeconds = Math.floor(absMs / 1000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const totalHours = (absMs / 3600000).toFixed(2);

    const d = Math.floor(absMs / 86400000);
    const h = Math.floor((absMs % 86400000) / 3600000);
    const m = Math.floor((absMs % 3600000) / 60000);

    calcOutputDiff.innerHTML = `
      <div class="calc-result-headline">${d}d ${h}h ${m}m ${isPast ? '(Negative / Past)' : ''}</div>
      <div class="calc-result-subtext">Total: ${totalHours} hours &middot; ${totalMinutes.toLocaleString()} minutes &middot; ${totalSeconds.toLocaleString()} seconds</div>
    `;
  } else {
    if (!calcInputBase || !calcOutputAdd) return;
    const base = new Date(calcInputBase.value).getTime();
    if (isNaN(base)) {
      calcOutputAdd.innerHTML = '<span class="calc-result-subtext">Select a valid base timestamp.</span>';
      return;
    }
    const days = parseInt(calcFieldDays.value || 0, 10);
    const hours = parseInt(calcFieldHours.value || 0, 10);
    const mins = parseInt(calcFieldMins.value || 0, 10);
    const deltaMs = (days * 86400000) + (hours * 3600000) + (mins * 60000);

    const op = calcSelectOp ? calcSelectOp.value : 'add';
    const targetMs = (op === 'add') ? (base + deltaMs) : (base - deltaMs);
    const targetDate = new Date(targetMs);

    calcOutputAdd.innerHTML = `
      <div class="calc-result-headline">${targetDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${targetDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
      <div class="calc-result-subtext">24H format: ${targetDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
    `;
  }
}

[calcInputStart, calcInputEnd, calcInputBase, calcSelectOp, calcFieldDays, calcFieldHours, calcFieldMins].forEach(el => {
  if (el) el.addEventListener('input', runCalculator);
});

// ── INLINE ANCHORED CITY DROPDOWN (0ms Latency + Popover) ─
const searchDropdown = document.getElementById('searchDropdown');
const searchInput = document.getElementById('searchInput');
const searchResultsList = document.getElementById('searchResultsList');
const searchResultCount = document.getElementById('searchResultCount');
const searchEscBadge = document.getElementById('searchEscBadge');

const supportsAnchorPositioning = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('position-area: block-end');

let onLocationSelectedCallback = null;
let currentHighlightedIndex = 0;
let currentRenderedResults = [];
let remoteDebounceTimeout = null;
let activePickerTrigger = null;
let suppressNextOpenForTrigger = null;

function isDropdownOpen() {
  if (!searchDropdown) return false;
  return searchDropdown.matches(':popover-open') || searchDropdown.classList.contains(':popover-open');
}

function clearActiveTriggerState() {
  if (activePickerTrigger) {
    activePickerTrigger.classList.remove('is-dropdown-open');
    activePickerTrigger.style.anchorName = '';
    activePickerTrigger = null;
  }
}

function positionDropdownFallback(triggerEl) {
  if (!searchDropdown || !triggerEl || supportsAnchorPositioning) return;
  const rect = triggerEl.getBoundingClientRect();
  const gap = 6;
  const maxW = Math.min(480, window.innerWidth - 24);
  const width = Math.min(maxW, Math.max(rect.width, 320));
  const estHeight = 350;
  const spaceBelow = window.innerHeight - rect.bottom - gap;
  const spaceAbove = rect.top - gap;
  const openAbove = spaceBelow < Math.min(estHeight, 260) && spaceAbove > spaceBelow;

  const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
  searchDropdown.style.width = `${width}px`;
  searchDropdown.style.left = `${left}px`;
  if (openAbove) {
    searchDropdown.style.top = 'auto';
    searchDropdown.style.bottom = `${window.innerHeight - rect.top + gap}px`;
  } else {
    searchDropdown.style.bottom = 'auto';
    searchDropdown.style.top = `${rect.bottom + gap}px`;
  }
}

// Track same-trigger clicks before popover="auto" light-dismiss closes it
document.addEventListener('pointerdown', (e) => {
  if (!isDropdownOpen()) {
    suppressNextOpenForTrigger = null;
    return;
  }
  suppressNextOpenForTrigger = (activePickerTrigger && activePickerTrigger.contains(e.target)) ? activePickerTrigger : null;
}, true);

function openSearchDropdown(triggerEl, callback) {
  if (!searchDropdown) return;
  if (suppressNextOpenForTrigger === triggerEl) {
    suppressNextOpenForTrigger = null;
    return;
  }
  suppressNextOpenForTrigger = null;

  clearActiveTriggerState();
  onLocationSelectedCallback = callback;
  activePickerTrigger = triggerEl || null;

  if (activePickerTrigger) {
    activePickerTrigger.classList.add('is-dropdown-open');
    if (supportsAnchorPositioning) {
      activePickerTrigger.style.anchorName = '--city-picker-anchor';
    } else {
      positionDropdownFallback(activePickerTrigger);
    }
  }

  if (typeof searchDropdown.showPopover === 'function') {
    if (!isDropdownOpen()) searchDropdown.showPopover();
  } else {
    searchDropdown.classList.add(':popover-open');
  }

  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }
  executeInstantSearch('');
}

function closeSearchDropdown() {
  if (!searchDropdown) return;
  if (typeof searchDropdown.hidePopover === 'function') {
    if (isDropdownOpen()) searchDropdown.hidePopover();
  } else {
    searchDropdown.classList.remove(':popover-open');
  }
  clearActiveTriggerState();
  onLocationSelectedCallback = null;
  if (activeAbortController) activeAbortController.abort();
}

if (searchDropdown) {
  searchDropdown.addEventListener('toggle', (e) => {
    if (e.newState === 'closed') {
      clearActiveTriggerState();
      onLocationSelectedCallback = null;
      if (activeAbortController) activeAbortController.abort();
    }
  });
}

if (searchEscBadge) searchEscBadge.addEventListener('click', closeSearchDropdown);

if (!supportsAnchorPositioning) {
  const repositionIfOpen = () => {
    if (isDropdownOpen() && activePickerTrigger) positionDropdownFallback(activePickerTrigger);
  };
  window.addEventListener('resize', repositionIfOpen, { passive: true });
  window.addEventListener('scroll', repositionIfOpen, { passive: true });
}

document.addEventListener('keydown', (e) => {
  if (isDropdownOpen()) {
    if (e.key === 'Escape') {
      closeSearchDropdown();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSearchHighlight(1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSearchHighlight(-1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      selectHighlightedItem();
      return;
    }
  }
});

function moveSearchHighlight(delta) {
  if (currentRenderedResults.length === 0) return;
  currentHighlightedIndex = (currentHighlightedIndex + delta + currentRenderedResults.length) % currentRenderedResults.length;
  updateHighlightedItemDOM();
}

function updateHighlightedItemDOM() {
  const items = searchResultsList.querySelectorAll('.search-result-item');
  items.forEach((item, idx) => {
    const isSelected = idx === currentHighlightedIndex;
    item.classList.toggle('is-active-item', isSelected);
    if (isSelected) {
      item.scrollIntoView({ block: 'nearest' });
    }
  });
}

function selectHighlightedItem() {
  if (currentRenderedResults[currentHighlightedIndex]) {
    triggerSelection(currentRenderedResults[currentHighlightedIndex]);
  }
}

function triggerSelection(item) {
  const cb = onLocationSelectedCallback;
  closeSearchDropdown();
  if (typeof cb === 'function') {
    cb(item);
  }
}

function executeInstantSearch(raw) {
  // 1. Instant 0ms memory search
  const localHits = filterLocationsInMemory(raw);
  currentRenderedResults = localHits;
  currentHighlightedIndex = 0;
  renderSearchResultsDOM(localHits);

  if (searchResultCount) {
    searchResultCount.textContent = `${localHits.length} matching locations`;
  }

  // 2. Non-blocking background remote enrichment (debounced, never flickers)
  clearTimeout(remoteDebounceTimeout);
  if (raw.trim().length >= 2) {
    remoteDebounceTimeout = setTimeout(async () => {
      const remoteHits = await fetchRemoteLocations(raw);
      if (remoteHits && remoteHits.length > 0) {
        // Merge remote hits with local
        const seen = new Set(localHits.map(h => `${h.city}-${h.tz}`));
        const fresh = [];
        remoteHits.forEach(rh => {
          const k = `${rh.city}-${rh.tz}`;
          if (!seen.has(k)) {
            seen.add(k);
            fresh.push(rh);
          }
        });
        if (fresh.length > 0) {
          const merged = [...localHits, ...fresh].slice(0, 45);
          currentRenderedResults = merged;
          renderSearchResultsDOM(merged);
          if (searchResultCount) {
            searchResultCount.textContent = `${merged.length} matching locations (Global Index)`;
          }
        }
      }
    }, 180);
  }
}

if (searchInput) {
  searchInput.addEventListener('input', () => {
    executeInstantSearch(searchInput.value);
  });
}

function renderSearchResultsDOM(list) {
  if (!searchResultsList) return;
  searchResultsList.innerHTML = '';
  const now = new Date();

  if (!list || list.length === 0) {
    searchResultsList.innerHTML = '<li class="search-result-item" style="color:var(--text-tertiary); cursor:default;">No matching world cities found.</li>';
    return;
  }

  list.forEach((item, idx) => {
    const li = document.createElement('li');
    li.className = `search-result-item ${idx === currentHighlightedIndex ? 'is-active-item' : ''}`;
    li.setAttribute('role', 'option');

    const offset = getOffsetLabel(item.tz, now);
    const abbrev = getAbbreviation(item.tz, now);

    // Live clock in that city
    const parts = getTimezoneParts(now, item.tz);
    const mStr = String(parts.minute).padStart(2, '0');
    let clockStr = '';
    if (is24HourFormat) {
      clockStr = `${String(parts.hour).padStart(2, '0')}:${mStr}`;
    } else {
      const ampm = parts.hour >= 12 ? 'PM' : 'AM';
      let h12 = parts.hour % 12;
      if (h12 === 0) h12 = 12;
      clockStr = `${h12}:${mStr} ${ampm}`;
    }

    li.innerHTML = `
      <div class="res-left-block">
        <span class="res-city-name">${item.city}${item.country ? ` <small style="font-weight:400;opacity:0.75">(${item.country})</small>` : ''}</span>
        <span class="res-sub-meta">${offset} &middot; ${item.tz}</span>
      </div>
      <div class="res-right-badge">
        <span class="res-live-clock">${clockStr}</span>
        <span class="res-abbrev-chip">${abbrev || 'UTC'}</span>
      </div>
    `;

    li.addEventListener('click', () => triggerSelection(item));
    li.addEventListener('mouseenter', () => {
      currentHighlightedIndex = idx;
      updateHighlightedItemDOM();
    });

    searchResultsList.appendChild(li);
  });
}

// ── THEME SWITCHER ───────────────────────────────────────
const themeToggle = document.getElementById('themeToggle');

function initThemeMode() {
  const saved = localStorage.getItem('chrona-theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  }
}

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = (current === 'light') ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('chrona-theme', next);
  });
}

// ── STARTUP ──────────────────────────────────────────────
(() => {
  initThemeMode();
  initMasterLocations();
  setupInitialConverterClocks();

  // Sync UI controls to restored state
  setTimeFormat(is24HourFormat);
  setConverterMode(converterMode);
  if (wcToggle1224) wcToggle1224.classList.toggle('right-active', isWc24Hour);
  if (wcBtn12 && wcBtn24) {
    wcBtn12.classList.toggle('active', !isWc24Hour);
    wcBtn24.classList.toggle('active', isWc24Hour);
  }

  renderConverterGrid();
  initCalculatorDefaults();

  // URL deep link routing
  if (window.location.hash === '#world-clock') {
    activateView('viewWorldClock');
  } else if (window.location.hash === '#calculator') {
    activateView('viewTimeCalc');
  }
})();
