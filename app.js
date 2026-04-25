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

let debounceTimer;
const state = {
  lastSearch: null,
  weatherData: null,
  unit: 'C'
};

const weatherLookup = {
  0:  { desc: 'Clear Sky',         emoji: '☀️'  },
  1:  { desc: 'Mainly Clear',      emoji: '🌤️' },
  2:  { desc: 'Partly Cloudy',     emoji: '⛅'  },
  3:  { desc: 'Overcast',          emoji: '☁️'  },
  45: { desc: 'Foggy',             emoji: '🌫️' },
  48: { desc: 'Icy Fog',           emoji: '🌫️' },
  51: { desc: 'Light Drizzle',     emoji: '🌦️' },
  61: { desc: 'Slight Rain',       emoji: '🌧️' },
  63: { desc: 'Moderate Rain',     emoji: '🌧️' },
  71: { desc: 'Slight Snow',       emoji: '🌨️' },
  95: { desc: 'Thunderstorm',      emoji: '⛈️' },
  default: { desc: 'Cloudy',       emoji: '☁️'  }
};

function getWeatherInfo(code) {
  return weatherLookup[code] || weatherLookup.default;
}

function convertTemp(celsius) {
  return state.unit === 'F' ? (celsius * 9/5) + 32 : celsius;
}

function showError(msg, showRetry = false) {
  const banner = document.getElementById('error-banner');
  const retryBtn = document.getElementById('retry-btn');
  if (banner) {
    banner.classList.remove('hidden');
    document.getElementById('error-msg').textContent = msg;
    showRetry ? retryBtn.classList.remove('hidden') : retryBtn.classList.add('hidden');
  }
}

function hideError() {
  const banner = document.getElementById('error-banner');
  if (banner) banner.classList.add('hidden');
}

function removeSkeletons() {
  document.querySelectorAll('.skeleton').forEach(el => el.classList.remove('skeleton'));
}

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

async function fetchWeatherData(city) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`;
    const geoRes = await fetch(geoUrl, { signal: controller.signal });
    if (!geoRes.ok) throw new Error(`HTTP Error: ${geoRes.status}`);
    const geoData = await geoRes.json();
    if (!geoData.results || geoData.results.length === 0) {
      showError(`City "${city}" not found.`, false);
      return;
    }
    const { latitude, longitude, name, timezone } = geoData.results[0];
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&hourly=relativehumidity_2m&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto`;
    const weatherRes = await fetch(weatherUrl, { signal: controller.signal });
    const weatherData = await weatherRes.json();
    clearTimeout(timeoutId);
    state.weatherData = weatherData;
    updateRecentSearches(name);
    populateUI(name);
    fetchLocalTime(timezone);
  } catch (err) {
    clearTimeout(timeoutId);
    showError(err.name === 'AbortError' ? 'Timeout (10s)' : err.message, true);
  }
}

function populateUI(cityName) {
  removeSkeletons();
  const data = state.weatherData;
  const current = data.current_weather;
  const { desc, emoji } = getWeatherInfo(current.weathercode);
  elCityName.textContent = cityName;
  elTemp.textContent = `${Math.round(convertTemp(current.temperature))}°${state.unit}`;
  elDescription.textContent = `${emoji} ${desc}`;
  elWindSpeed.textContent = `Wind: ${current.windspeed} km/h`;
  const hourIdx = new Date().getHours();
  elHumidity.textContent = `Humidity: ${data.hourly.relativehumidity_2m[hourIdx]}%`;
  elLocalTime.textContent = 'Local Time: loading...';
  forecastRow.innerHTML = '';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 0; i < 7; i++) {
    const date = new Date(data.daily.time[i]);
    const { emoji: fEmoji } = getWeatherInfo(data.daily.weathercode[i]);
    const hi = Math.round(convertTemp(data.daily.temperature_2m_max[i]));
    const lo = Math.round(convertTemp(data.daily.temperature_2m_min[i]));
    const card = document.createElement('div');
    card.className = 'forecast-card';
    card.innerHTML = `<p><strong>${days[date.getDay()]}</strong></p><p style="font-size:1.5rem">${fEmoji}</p><p>${hi}° / ${lo}°</p>`;
    forecastRow.appendChild(card);
  }
}

function handleSearch() {
  const city = cityInput.value.trim();
  if (city.length < 2) {
    validationMsg.textContent = 'Enter at least 2 chars.';
    return;
  }
  validationMsg.textContent = '';
  hideError();
  fetchWeatherData(city);
}

searchBtn.onclick = handleSearch;
cityInput.oninput = () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { if (cityInput.value.trim().length >= 2) handleSearch(); }, 500);
};
cityInput.onkeydown = (e) => { if (e.key === 'Enter') { clearTimeout(debounceTimer); handleSearch(); } };

window.onload = renderSearchChips;