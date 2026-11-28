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
let justAddedClockId = null;

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
let tempUnit = 'C'; // 'C' or 'F'

// ── PERSISTENCE ──────────────────────────────────────────
const STORAGE_KEY = 'chrona-state-v1';

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      converterClocks: converterClocks.map(c => ({ city: c.city, tz: c.tz, country: c.country, tag: c.tag })),
      is24HourFormat,
      converterMode,
      bentoWorldHubs,
      isWc24Hour,
      tempUnit
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
    tempUnit = saved.tempUnit === 'F' ? 'F' : 'C';
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

// ── LIVE WEATHER ENGINE (Open-Meteo + Animated SVGs) ─────
const GEO_CACHE_KEY = 'chrona-geo-v1';
const WEATHER_TTL_MS = 10 * 60 * 1000;
const weatherCache = new Map();
const weatherInFlight = new Map();
let geoCache = (() => {
  try { return JSON.parse(localStorage.getItem(GEO_CACHE_KEY) || '{}'); } catch { return {}; }
})();

const IANA_CANONICAL_MAP = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Europe/Kiev': 'Europe/Kyiv',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires'
};

function normalizeTzForWeather(tz) {
  return IANA_CANONICAL_MAP[tz] || tz;
}

function getWeatherKey(city, tz) {
  return `${city || ''}|${normalizeTzForWeather(tz || '')}`;
}

function describeWeatherCode(code, isDay) {
  if (code === 0) return { kind: isDay ? 'clear-day' : 'clear-night', label: 'Clear sky' };
  if (code === 1 || code === 2) return { kind: isDay ? 'partly-day' : 'partly-night', label: 'Partly cloudy' };
  if (code === 3) return { kind: 'cloudy', label: 'Overcast' };
  if (code === 45 || code === 48) return { kind: 'fog', label: 'Foggy' };
  if ([51, 53, 55, 56, 57].includes(code)) return { kind: 'drizzle', label: 'Drizzle' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { kind: 'rain', label: 'Rain' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { kind: 'snow', label: 'Snow' };
  if ([95, 96, 99].includes(code)) return { kind: 'storm', label: 'Thunderstorm' };
  return { kind: 'cloudy', label: 'Cloudy' };
}

function renderWeatherIconSvg(kind) {
  const cloudShape = '<path class="wx-cloud-main" d="M7.5 17.5h9a3.5 3.5 0 0 0 .4-6.98A4.8 4.8 0 0 0 7.7 9.1 3.3 3.3 0 0 0 7.5 17.5Z"/>';
  switch (kind) {
    case 'clear-day':
      return `<svg class="weather-anim-icon" viewBox="0 0 24 24" aria-hidden="true">
        <g class="wx-sun-rays" stroke-width="1.8" stroke-linecap="round">
          <line x1="12" y1="2.2" x2="12" y2="4.4"/><line x1="12" y1="19.6" x2="12" y2="21.8"/>
          <line x1="2.2" y1="12" x2="4.4" y2="12"/><line x1="19.6" y1="12" x2="21.8" y2="12"/>
          <line x1="5.1" y1="5.1" x2="6.6" y2="6.6"/><line x1="17.4" y1="17.4" x2="18.9" y2="18.9"/>
          <line x1="18.9" y1="5.1" x2="17.4" y2="6.6"/><line x1="6.6" y1="17.4" x2="5.1" y2="18.9"/>
        </g>
        <circle class="wx-sun" cx="12" cy="12" r="4.6"/>
      </svg>`;
    case 'clear-night':
      return `<svg class="weather-anim-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path class="wx-moon" d="M16.8 14.9A6.6 6.6 0 0 1 9.1 7.2a6.6 6.6 0 1 0 7.7 7.7Z"/>
        <circle class="wx-star wx-star-1" cx="17.5" cy="6.2" r="1.2"/>
        <circle class="wx-star wx-star-2" cx="20" cy="10.2" r="0.9"/>
      </svg>`;
    case 'partly-day':
      return `<svg class="weather-anim-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle class="wx-sun" cx="9" cy="9.2" r="3.6"/>
        ${cloudShape}
      </svg>`;
    case 'partly-night':
      return `<svg class="weather-anim-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path class="wx-moon" d="M11.6 10.7A4 4 0 0 1 7.3 6.3a4 4 0 1 0 4.3 4.4Z"/>
        ${cloudShape}
      </svg>`;
    case 'cloudy':
      return `<svg class="weather-anim-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path class="wx-cloud-back" d="M10.5 13h7a2.6 2.6 0 0 0 .3-5.18A3.6 3.6 0 0 0 11 6.7a2.5 2.5 0 0 0-.5 6.3Z"/>
        ${cloudShape}
      </svg>`;
    case 'fog':
      return `<svg class="weather-anim-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path class="wx-cloud-main" d="M7.5 13.5h9a3.2 3.2 0 0 0 .4-6.38 4.4 4.4 0 0 0-8.5-1.2 3 3 0 0 0-.9 7.58Z"/>
        <line class="wx-fog-line wx-fog-1" x1="5" y1="16.2" x2="19" y2="16.2" stroke-width="1.7" stroke-linecap="round"/>
        <line class="wx-fog-line wx-fog-2" x1="6.5" y1="19" x2="17.5" y2="19" stroke-width="1.7" stroke-linecap="round"/>
        <line class="wx-fog-line wx-fog-3" x1="8" y1="21.6" x2="16" y2="21.6" stroke-width="1.7" stroke-linecap="round"/>
      </svg>`;
    case 'drizzle':
    case 'rain':
      return `<svg class="weather-anim-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path class="wx-cloud-main" d="M7.5 14.8h9a3.3 3.3 0 0 0 .4-6.58A4.6 4.6 0 0 0 7.9 6.9a3.1 3.1 0 0 0-.4 7.9Z"/>
        <line class="wx-drop wx-drop-1" x1="8.8" y1="16.5" x2="7.8" y2="19.8" stroke-width="1.7" stroke-linecap="round"/>
        <line class="wx-drop wx-drop-2" x1="12.6" y1="16.5" x2="11.6" y2="19.8" stroke-width="1.7" stroke-linecap="round"/>
        <line class="wx-drop wx-drop-3" x1="16.2" y1="16.5" x2="15.2" y2="19.8" stroke-width="1.7" stroke-linecap="round"/>
      </svg>`;
    case 'snow':
      return `<svg class="weather-anim-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path class="wx-cloud-main" d="M7.5 14.8h9a3.3 3.3 0 0 0 .4-6.58A4.6 4.6 0 0 0 7.9 6.9a3.1 3.1 0 0 0-.4 7.9Z"/>
        <circle class="wx-flake wx-flake-1" cx="8.5" cy="17.5" r="1.3"/>
        <circle class="wx-flake wx-flake-2" cx="12.2" cy="18.2" r="1.3"/>
        <circle class="wx-flake wx-flake-3" cx="15.8" cy="17.4" r="1.3"/>
      </svg>`;
    case 'storm':
      return `<svg class="weather-anim-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path class="wx-cloud-main" d="M7.5 14.5h9a3.3 3.3 0 0 0 .4-6.58A4.6 4.6 0 0 0 7.9 6.6a3.1 3.1 0 0 0-.4 7.9Z"/>
        <polygon class="wx-bolt" points="12.6,14 9.8,18.2 12,18.2 11,22 14.8,17 12.4,17"/>
      </svg>`;
    default:
      return `<svg class="weather-anim-icon" viewBox="0 0 24 24" aria-hidden="true">${cloudShape}</svg>`;
  }
}

function buildWeatherPillHtml(data) {
  if (!data) return '';
  const temp = tempUnit === 'F' ? Math.round((data.tempC * 9) / 5 + 32) : Math.round(data.tempC);
  const { kind, label } = describeWeatherCode(data.code, data.isDay);
  const nextUnit = tempUnit === 'F' ? 'C' : 'F';
  return `<button type="button" class="weather-pill" data-action="toggle-temp-unit" title="${label} · Click for °${nextUnit}" aria-label="${label}, ${temp} degrees ${tempUnit}">${renderWeatherIconSvg(kind)}<span>${temp}°${tempUnit}</span></button>`;
}

async function resolveCoordsForLocation(city, tz) {
  const key = getWeatherKey(city, tz);
  if (geoCache[key]) return geoCache[key];

  const normTz = normalizeTzForWeather(tz);
  if (!normTz || normTz === 'UTC' || normTz.startsWith('Etc/')) return null;

  const tzCity = normTz.includes('/') ? normTz.split('/').pop().replace(/_/g, ' ') : '';
  const cleanCity = (city || '').replace(/\s*\([^)]*\)/g, '').trim();
  const looksLikeAbbrev = /^[A-Z0-9+-]{2,6}$/.test(cleanCity) || /\([^)]*(Time|Standard|Daylight|Summer)/i.test(city || '');
  const queries = looksLikeAbbrev ? [tzCity] : [cleanCity, tzCity].filter(Boolean);

  for (const q of [...new Set(queries)]) {
    try {
      const resp = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5`);
      if (!resp.ok) continue;
      const json = await resp.json();
      const results = Array.isArray(json.results) ? json.results : [];
      if (results.length === 0) continue;
      const exactTz = results.find(r => normalizeTzForWeather(r.timezone) === normTz);
      const pick = exactTz || (q === tzCity ? results[0] : null);
      if (pick) {
        const coords = { lat: pick.latitude, lon: pick.longitude };
        geoCache[key] = coords;
        try { localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(geoCache)); } catch {}
        return coords;
      }
    } catch {}
  }
  return null;
}

function getCachedWeather(city, tz) {
  const entry = weatherCache.get(getWeatherKey(city, tz));
  return entry ? entry.data : null;
}

function ensureLocationWeather(city, tz, onReady) {
  const key = getWeatherKey(city, tz);
  const existing = weatherCache.get(key);
  if (existing && (Date.now() - existing.fetchedAt) < WEATHER_TTL_MS) {
    return;
  }
  if (weatherInFlight.has(key)) {
    if (onReady) weatherInFlight.get(key).then(data => { if (data) onReady(data); });
    return;
  }
  const promise = (async () => {
    const coords = await resolveCoordsForLocation(city, tz);
    if (!coords) return null;
    try {
      const resp = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,weather_code,is_day`);
      if (!resp.ok) return null;
      const json = await resp.json();
      const cur = json && json.current;
      if (!cur || typeof cur.temperature_2m !== 'number') return null;
      const data = { tempC: cur.temperature_2m, code: cur.weather_code, isDay: cur.is_day === 1 };
      weatherCache.set(key, { data, fetchedAt: Date.now() });
      return data;
    } catch {
      return null;
    } finally {
      weatherInFlight.delete(key);
    }
  })();
  weatherInFlight.set(key, promise);
  if (onReady) promise.then(data => { if (data) onReady(data); });
}

function toggleTempUnit() {
  tempUnit = tempUnit === 'C' ? 'F' : 'C';
  saveState();
  renderConverterGrid();
  const wcView = document.getElementById('viewWorldClock');
  if (wcView && !wcView.hidden) renderWorldBento();
}

function swapAdjacentTimezones(leftIdx) {
  const leftClock = converterClocks[leftIdx];
  const rightClock = converterClocks[leftIdx + 1];
  if (!leftClock || !rightClock) return;

  // Keep the active column's displayed wall-clock time fixed when swapping zones
  const anchorClock = converterClocks.find(c => c.id === activeClockId) || leftClock;
  const anchorWallParts = getTimezoneParts(new Date(baseEpochMs), anchorClock.tz);

  const tmp = { city: leftClock.city, tz: leftClock.tz, country: leftClock.country };
  leftClock.city = rightClock.city;
  leftClock.tz = rightClock.tz;
  leftClock.country = rightClock.country;
  rightClock.city = tmp.city;
  rightClock.tz = tmp.tz;
  rightClock.country = tmp.country;

  baseEpochMs = wallClockToEpoch(
    anchorWallParts.year,
    anchorWallParts.month,
    anchorWallParts.day,
    anchorWallParts.hour,
    anchorWallParts.minute,
    anchorClock.tz
  );

  renderConverterGrid();
}

function addConverterZone(selected, side = 'right') {
  const newClock = {
    id: clockCounter++,
    city: selected.city,
    tz: selected.tz,
    country: selected.country || '',
    tag: `ZONE ${converterClocks.length + 1}`
  };
  if (side === 'left') {
    converterClocks.unshift(newClock);
  } else {
    converterClocks.push(newClock);
  }
  justAddedClockId = newClock.id;
  renderConverterGrid();
}

async function closeClockCell(cell, clockId) {
  if (converterClocks.length <= 2 || cell.hasAttribute('data-closing')) return;
  if (typeof isDropdownOpen === 'function' && isDropdownOpen()) closeSearchDropdown();

  cell.classList.remove('is-window-entering');
  cell.setAttribute('data-closing', '');
  const adjacentDivider = (cell.nextElementSibling && cell.nextElementSibling.classList.contains('zone-divider'))
    ? cell.nextElementSibling
    : (cell.previousElementSibling && cell.previousElementSibling.classList.contains('zone-divider'))
      ? cell.previousElementSibling
      : null;
  if (adjacentDivider) adjacentDivider.setAttribute('data-closing', '');

  // Flush style so CSS exit transitions are active before querying getAnimations()
  getComputedStyle(cell).opacity;
  const animations = cell.getAnimations();
  if (animations.length > 0) {
    await Promise.race([
      Promise.allSettled(animations.map(a => a.finished)),
      new Promise(r => setTimeout(r, 350))
    ]);
  }

  converterClocks = converterClocks.filter(c => c.id !== clockId);
  if (activeClockId === clockId && converterClocks.length > 0) {
    activeClockId = converterClocks[0].id;
  }
  renderConverterGrid();
}

function renderConverterGrid() {
  if (!converterClockGrid) return;
  saveState();
  converterClockGrid.innerHTML = '';

  const refClock = converterClocks.find(c => c.id === activeClockId) || converterClocks[0];
  const refParts = getTimezoneParts(new Date(baseEpochMs), refClock.tz);
  let newlyInsertedCell = null;

  converterClocks.forEach((clock, index) => {
    const cell = document.createElement('div');
    const isEntering = clock.id === justAddedClockId;
    cell.className = `clock-cell${isEntering ? ' is-window-entering' : ''}`;
    if (isEntering) {
      newlyInsertedCell = cell;
      justAddedClockId = null;
    }
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
      ${converterClocks.length > 2 ? `<button type="button" class="btn-cell-delete" data-action="delete" title="Remove ${clock.city}" aria-label="Remove ${clock.city}">&times;</button>` : ''}
      <div class="clock-cell-header">
        <span class="clock-tag-pill">${clock.tag}</span>
        <div class="cell-actions">
          <span class="daynight-indicator ${isDay ? 'day' : 'night'}">
            ${isDay ? '☀️ DAY' : '🌙 NIGHT'}
          </span>
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

      <!-- City Selector Field (acts as inline search box when active) -->
      <div class="city-picker-trigger">
        <div class="city-meta-block">
          <button type="button" class="city-read-btn" data-action="choose-city">
            <span class="city-name-text" title="${clock.city}">${clock.city}</span>
            <span class="city-sub-text" title="${offset} · ${clock.tz}">${offset} &middot; ${clock.tz}</span>
          </button>
          <div class="city-inline-search-wrap" hidden>
            <svg class="search-lens-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="search"
              class="city-inline-search"
              placeholder="Search city, country, or code..."
              autocomplete="off"
              spellcheck="false"
              aria-label="Search city for ${clock.tag}"
            />
          </div>
        </div>
        <button type="button" class="city-picker-right" data-action="toggle-city-picker" aria-label="Choose city for ${clock.tag}">
          <span class="abbrev-badge">${abbrev || 'UTC'}</span>
          <svg class="city-picker-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>

      <div class="cell-date-display">
        <div class="cell-date-left">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          <span class="cell-date-text">${formattedFullDate}</span>
        </div>
        <div class="weather-slot" data-weather-key="${getWeatherKey(clock.city, clock.tz)}">${buildWeatherPillHtml(getCachedWeather(clock.city, clock.tz))}</div>
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

    // Pick city inline search & toggle
    const cityBox = cell.querySelector('.city-picker-trigger');
    const chooseCityBtn = cell.querySelector('[data-action="choose-city"]');
    const toggleCityBtn = cell.querySelector('[data-action="toggle-city-picker"]');
    const inlineWrap = cell.querySelector('.city-inline-search-wrap');
    const inlineInput = cell.querySelector('.city-inline-search');

    const handleCitySelect = selected => {
      clock.city = selected.city;
      clock.tz = selected.tz;
      clock.country = selected.country || '';
      renderConverterGrid();
    };

    const openCellDropdown = () => {
      openSearchDropdown(cityBox, handleCitySelect, {
        inlineWrap,
        inlineInput,
        readBtn: chooseCityBtn
      });
    };

    chooseCityBtn.addEventListener('click', openCellDropdown);
    toggleCityBtn.addEventListener('click', () => {
      if (isDropdownOpen() && activePickerTrigger === cityBox) {
        closeSearchDropdown();
      } else {
        openCellDropdown();
      }
    });
    inlineInput.addEventListener('input', () => {
      if (isDropdownOpen() && activePickerTrigger === cityBox) {
        executeInstantSearch(inlineInput.value);
      }
    });

    // Delete cell with macOS-like window closing effect
    const delBtn = cell.querySelector('[data-action="delete"]');
    if (delBtn) {
      delBtn.addEventListener('click', () => closeClockCell(cell, clock.id));
    }

    converterClockGrid.appendChild(cell);

    if (index < converterClocks.length - 1) {
      const nextClock = converterClocks[index + 1];
      const divider = document.createElement('div');
      divider.className = 'zone-divider';
      divider.innerHTML = `
        <button
          type="button"
          class="swap-zones-btn"
          title="Swap ${clock.city} and ${nextClock.city} (keep current time)"
          aria-label="Swap ${clock.city} and ${nextClock.city} timezones"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="17 2 21 6 17 10"></polyline>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <polyline points="7 22 3 18 7 14"></polyline>
            <line x1="21" y1="18" x2="3" y2="18"></line>
          </svg>
        </button>
      `;
      divider.querySelector('.swap-zones-btn').addEventListener('click', () => {
        swapAdjacentTimezones(index);
      });
      converterClockGrid.appendChild(divider);
    }

    const wKey = getWeatherKey(clock.city, clock.tz);
    ensureLocationWeather(clock.city, clock.tz, data => {
      document.querySelectorAll(`.weather-slot[data-weather-key="${CSS.escape(wKey)}"]`).forEach(slot => {
        slot.innerHTML = buildWeatherPillHtml(data);
      });
    });
  });

  // Show tooltip only when text is actually truncated (overflowing)
  converterClockGrid.querySelectorAll('.city-name-text, .city-sub-text').forEach(el => {
    if (el.scrollWidth <= el.clientWidth) el.removeAttribute('title');
  });

  if (newlyInsertedCell) {
    newlyInsertedCell.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }
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

    const dateDisplay = cell.querySelector('.cell-date-display .cell-date-text');
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
    openSearchDropdown(btnAddZone, selected => addConverterZone(selected, 'right'));
  });
}

const edgeAddLeft = document.getElementById('edgeAddLeft');
if (edgeAddLeft) {
  edgeAddLeft.addEventListener('click', () => {
    openSearchDropdown(edgeAddLeft, selected => addConverterZone(selected, 'left'));
  });
}

const edgeAddRight = document.getElementById('edgeAddRight');
if (edgeAddRight) {
  edgeAddRight.addEventListener('click', () => {
    openSearchDropdown(edgeAddRight, selected => addConverterZone(selected, 'right'));
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
        <div class="weather-slot bento-weather-slot" data-weather-key="${getWeatherKey(hub.city, hub.tz)}">${buildWeatherPillHtml(getCachedWeather(hub.city, hub.tz))}</div>
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

    const wKey = getWeatherKey(hub.city, hub.tz);
    ensureLocationWeather(hub.city, hub.tz, data => {
      document.querySelectorAll(`.weather-slot[data-weather-key="${CSS.escape(wKey)}"]`).forEach(slot => {
        slot.innerHTML = buildWeatherPillHtml(data);
      });
    });
  });
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="toggle-temp-unit"]')) {
    toggleTempUnit();
  }
});

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
const dropdownSearchHeader = document.getElementById('dropdownSearchHeader');
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
let activeInlineControls = null;

function isDropdownOpen() {
  if (!searchDropdown) return false;
  return searchDropdown.matches(':popover-open') || searchDropdown.classList.contains(':popover-open');
}

function clearActiveTriggerState() {
  if (activeInlineControls) {
    if (activeInlineControls.inlineWrap) activeInlineControls.inlineWrap.hidden = true;
    if (activeInlineControls.readBtn) activeInlineControls.readBtn.hidden = false;
    if (activeInlineControls.inlineInput) activeInlineControls.inlineInput.value = '';
    activeInlineControls = null;
  }
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

// Light-dismiss for popover="manual": keep open when clicking inside dropdown or active inline box
document.addEventListener('pointerdown', (e) => {
  if (!isDropdownOpen()) return;
  if (searchDropdown && searchDropdown.contains(e.target)) return;
  if (activePickerTrigger && activePickerTrigger.contains(e.target)) return;
  closeSearchDropdown();
}, true);

function openSearchDropdown(triggerEl, callback, inlineControls = null) {
  if (!searchDropdown) return;

  // Toggle closed if clicking a standalone trigger button (e.g. ADD CITY +) while already open
  if (!inlineControls && isDropdownOpen() && activePickerTrigger === triggerEl) {
    closeSearchDropdown();
    return;
  }

  clearActiveTriggerState();
  onLocationSelectedCallback = callback;
  activePickerTrigger = triggerEl || null;
  activeInlineControls = inlineControls;

  const useInline = !!(inlineControls && inlineControls.inlineInput && inlineControls.inlineWrap && inlineControls.readBtn);
  if (dropdownSearchHeader) {
    dropdownSearchHeader.hidden = useInline;
  }

  if (useInline) {
    inlineControls.readBtn.hidden = true;
    inlineControls.inlineWrap.hidden = false;
    inlineControls.inlineInput.value = '';
  }

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

  if (useInline) {
    inlineControls.inlineInput.focus();
  } else if (searchInput) {
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
