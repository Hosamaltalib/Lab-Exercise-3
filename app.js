/* WeatherNow — app.js
   Task 1: DOM references + state
   Task 2: Fetch API — Geocoding and Weather Data
   Task 3: jQuery AJAX — Local Time Integration
   Task 4: Error Handling & Edge Cases
   Bonus: Recent searches + C/F toggle */

// ── DOM References ───────────────────────────────────────
const cityInput     = document.getElementById('cityInput');
const searchBtn     = document.getElementById('searchBtn');
const validationMsg = document.getElementById('validationMsg');
const forecastRow   = document.getElementById('forecastRow');
const elCityName    = document.getElementById('cityName');
const elLocalTime   = document.getElementById('localTime');
const elTemp        = document.getElementById('temp');
const elDescription = document.getElementById('description');
const elHumidity    = document.getElementById('humidity');
const elWindSpeed   = document.getElementById('windSpeed');
const btnC          = document.getElementById('btnC');
const btnF          = document.getElementById('btnF');

// ── App State ────────────────────────────────────────────
let debounceTimer;
const state = {
  lastSearch:  null,
  weatherData: null,
  unit:        'C'
};

// ── Weathercode Lookup ───────────────────────────────────
const weatherLookup = {
  0:  { desc: 'Clear Sky',      emoji: '☀️'  },
  1:  { desc: 'Mainly Clear',   emoji: '🌤️' },
  2:  { desc: 'Partly Cloudy',  emoji: '⛅'  },
  3:  { desc: 'Overcast',       emoji: '☁️'  },
  45: { desc: 'Foggy',          emoji: '🌫️' },
  48: { desc: 'Icy Fog',        emoji: '🌫️' },
  51: { desc: 'Light Drizzle',  emoji: '🌦️' },
  61: { desc: 'Slight Rain',    emoji: '🌧️' },
  63: { desc: 'Moderate Rain',  emoji: '🌧️' },
  71: { desc: 'Slight Snow',    emoji: '🌨️' },
  95: { desc: 'Thunderstorm',   emoji: '⛈️' },
  default: { desc: 'Cloudy',    emoji: '☁️'  }
};

function getWeatherInfo(code) {
  return weatherLookup[code] || weatherLookup.default;
}

// ── Temperature Conversion ───────────────────────────────
function convertTemp(celsius) {
  return state.unit === 'F' ? Math.round((celsius * 9 / 5) + 32) : Math.round(celsius);
}

// ── Helper UI Functions ──────────────────────────────────
function showError(msg, showRetry = false) {
  const banner   = document.getElementById('error-banner');
  const retryBtn = document.getElementById('retry-btn');
  if (banner) {
    banner.classList.remove('hidden');
    document.getElementById('error-msg').textContent = msg;
    showRetry
      ? retryBtn.classList.remove('hidden')
      : retryBtn.classList.add('hidden');
  }
}

function hideError() {
  const banner = document.getElementById('error-banner');
  if (banner) banner.classList.add('hidden');
}

function removeSkeletons() {
  document.querySelectorAll('.skeleton').forEach(el => el.classList.remove('skeleton'));
}

// ── Bonus: Recent Searches ───────────────────────────────
function updateRecentSearches(city) {
  let searches = JSON.parse(localStorage.getItem('recentSearches') || '[]');
  searches = [city, ...searches.filter(s => s !== city)].slice(0, 5);
  localStorage.setItem('recentSearches', JSON.stringify(searches));
  renderSearchChips();
}

function renderSearchChips() {
  const container = document.getElementById('recent-chips');
  if (!container) return;
  const searches = JSON.parse(localStorage.getItem('recentSearches') || '[]');
  container.innerHTML = searches.map(city => `<button class="chip">${city}</button>`).join('');
  container.querySelectorAll('.chip').forEach(btn => {
    btn.onclick = () => {
      cityInput.value = btn.textContent;
      handleSearch();
    };
  });
}

// ── Task 3: jQuery AJAX — Local Time ─────────────────────
function fetchLocalTime(timezone) {
  $.getJSON(`https://worldtimeapi.org/api/timezone/${timezone}`)
    .done(function(data) {
      const dateTime = new Date(data.datetime);
      elLocalTime.textContent = `Local Time: ${dateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    })
    .fail(function() {
      const browserTime = new Date();
      elLocalTime.textContent = `Local Time (Fallback): ${browserTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    })
    .always(function() {
      console.log(`WorldTimeAPI request completed at: ${new Date().toISOString()}`);
    });
}

// ── Task 2: Fetch API ────────────────────────────────────
async function fetchWeatherData(city) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 10000);

  try {
    // Step 5: Geocoding
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`;
    const geoRes = await fetch(geoUrl, { signal: controller.signal });

    // Step 16: HTTP error check
    if (!geoRes.ok) throw new Error(`HTTP Error: ${geoRes.status}`);

    const geoData = await geoRes.json();

    // Step 6: city not found — show error in UI, do NOT throw
    if (!geoData.results || geoData.results.length === 0) {
      showError(`City "${city}" not found. Try again.`);
      clearTimeout(timeoutId);
      return;
    }

    const { latitude, longitude, name, timezone } = geoData.results[0];

    // Step 7: Weather API with all required params
    const weatherUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current_weather=true` +
      `&hourly=temperature_2m,relativehumidity_2m,windspeed_10m` +
      `&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto`;

    const weatherRes = await fetch(weatherUrl, { signal: controller.signal });

    // Step 16: HTTP error check
    if (!weatherRes.ok) throw new Error(`HTTP Error: ${weatherRes.status}`);

    const weatherData = await weatherRes.json();
    clearTimeout(timeoutId);

    state.weatherData = weatherData;

    // Step 8: populate UI
    populateUI(name);

    // Bonus: save search
    updateRecentSearches(name);

    // Step 11: get local time after weather displayed
    fetchLocalTime(timezone);

  } catch (err) {
    clearTimeout(timeoutId);
    // Step 9: network error or timeout
    const errMsg = err.name === 'AbortError'
      ? 'Request timed out (10s). Please try again.'
      : `Error: ${err.message}`;
    showError(errMsg, true);
  }
}

// ── Populate UI ──────────────────────────────────────────
function populateUI(cityName) {
  removeSkeletons();
  const data    = state.weatherData;
  const current = data.current_weather;
  const { desc, emoji } = getWeatherInfo(current.weathercode);
  const hourIdx = new Date().getHours();

  elCityName.textContent    = cityName;
  elTemp.textContent        = `${convertTemp(current.temperature)}°${state.unit}`;
  elDescription.textContent = `${emoji} ${desc}`;
  elWindSpeed.textContent   = `Wind: ${current.windspeed} km/h`;
  elHumidity.textContent    = `Humidity: ${data.hourly.relativehumidity_2m[hourIdx]}%`;
  elLocalTime.textContent   = 'Local Time: loading...';

  // 7-day forecast
  forecastRow.innerHTML = '';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let i = 0; i < 7; i++) {
    const date             = new Date(data.daily.time[i]);
    const { emoji: fEmoji} = getWeatherInfo(data.daily.weathercode[i]);
    const hi               = convertTemp(data.daily.temperature_2m_max[i]);
    const lo               = convertTemp(data.daily.temperature_2m_min[i]);

    const card = document.createElement('div');
    card.className = 'forecast-card';
    card.innerHTML = `
      <p><strong>${days[date.getDay()]}</strong></p>
      <p style="font-size:1.5rem">${fEmoji}</p>
      <p>${hi}° / ${lo}°</p>
    `;
    forecastRow.appendChild(card);
  }
}

// ── Bonus: Unit Toggle ───────────────────────────────────
function applyUnit(unit) {
  if (!state.weatherData) return;
  state.unit = unit;
  btnC.classList.toggle('active', unit === 'C');
  btnF.classList.toggle('active', unit === 'F');
  populateUI(elCityName.textContent);
}

btnC.addEventListener('click', () => applyUnit('C'));
btnF.addEventListener('click', () => applyUnit('F'));

// ── Search Handler ───────────────────────────────────────
function handleSearch() {
  const city = cityInput.value.trim();

  // Step 17: validation
  if (city.length < 2) {
    validationMsg.textContent = 'Enter at least 2 characters.';
    return;
  }

  validationMsg.textContent = '';
  hideError();
  state.lastSearch = city;
  fetchWeatherData(city);
}

// ── Event Listeners ──────────────────────────────────────
searchBtn.onclick = handleSearch;

// Step 18: debounce on input — 500ms
cityInput.oninput = () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (cityInput.value.trim().length >= 2) handleSearch();
  }, 500);
};

cityInput.onkeydown = (e) => {
  if (e.key === 'Enter') {
    clearTimeout(debounceTimer);
    handleSearch();
  }
};

// Retry button
const retryBtn = document.getElementById('retry-btn');
if (retryBtn) retryBtn.addEventListener('click', handleSearch);

// Restore recent chips on page load
window.onload = renderSearchChips;