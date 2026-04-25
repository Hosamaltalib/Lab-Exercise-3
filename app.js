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

function fetchLocalTime(timezone) {
  $.getJSON(`https://worldtimeapi.org/api/timezone/${timezone}`)
    .done(function(data) {
      const dateTime = new Date(data.datetime);
      elLocalTime.textContent = `Local Time: ${dateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    })
    .fail(function() {
      const browserTime = new Date();
      elLocalTime.textContent = `Local Time (Browser fallback): ${browserTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
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
      showError(`City "${city}" not found. Try again.`);
      return;
    }

    const { latitude, longitude, name, timezone } = geoData.results[0];

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
                       `&current_weather=true` +
                       `&hourly=temperature_2m,relativehumidity_2m,windspeed_10m` + 
                       `&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto`;

    const weatherRes = await fetch(weatherUrl, { signal: controller.signal });
    if (!weatherRes.ok) throw new Error(`HTTP Error: ${weatherRes.status}`);

    const weatherData = await weatherRes.json();
    clearTimeout(timeoutId);

    populateUI(name, weatherData);
    fetchLocalTime(timezone);

  } catch (err) {
    clearTimeout(timeoutId);
    const errMsg = err.name === 'AbortError' ? 'Request timed out (10s)' : err.message;
    showError(errMsg, true);
  }
}

function populateUI(cityName, data) {
  removeSkeletons();
  state.weatherData = data;

  const current = data.current_weather;
  const { desc, emoji } = getWeatherInfo(current.weathercode);

  elCityName.textContent    = cityName;
  elTemp.textContent        = `${Math.round(current.temperature)}°C`;
  elDescription.textContent = `${emoji} ${desc}`;
  elWindSpeed.textContent   = `Wind: ${current.windspeed} km/h`;
  
  const hourIdx = new Date().getHours();
  elHumidity.textContent    = `Humidity: ${data.hourly.relativehumidity_2m[hourIdx]}%`;
  elLocalTime.textContent   = 'Local Time: loading...';

  forecastRow.innerHTML = '';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let i = 0; i < 7; i++) {
    const date = new Date(data.daily.time[i]);
    const { emoji: fEmoji } = getWeatherInfo(data.daily.weathercode[i]);
    
    const card = document.createElement('div');
    card.className = 'forecast-card';
    card.innerHTML = `
      <p><strong>${days[date.getDay()]}</strong></p>
      <p style="font-size:1.5rem">${fEmoji}</p>
      <p>${Math.round(data.daily.temperature_2m_max[i])}° / ${Math.round(data.daily.temperature_2m_min[i])}°</p>
    `;
    forecastRow.appendChild(card);
  }
}

function handleSearch() {
  const city = cityInput.value.trim();
  
  if (city.length < 2) {
    validationMsg.textContent = 'Enter at least 2 characters.';
    return;
  }

  validationMsg.textContent = '';
  hideError();
  fetchWeatherData(city);
}

searchBtn.addEventListener('click', handleSearch);

cityInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (cityInput.value.trim().length >= 2) {
      handleSearch();
    }
  }, 500);
});

cityInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    clearTimeout(debounceTimer);
    handleSearch();
  }
});

const retryBtn = document.getElementById('retry-btn');
if (retryBtn) retryBtn.addEventListener('click', handleSearch);