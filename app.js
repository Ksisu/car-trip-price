'use strict';

const SETTINGS_KEY = 'tripPrice.settings';
const TRIP_KEY = 'tripPrice.trip';
const DEFAULT_SETTINGS = { consumption: 6.7, fuelPrice: 629 };

// GPS noise filtering
const MAX_ACCURACY_M = 30;      // ignore fixes worse than this
const MIN_STEP_M = 5;           // ignore jitter smaller than this
const MAX_SPEED_MS = 70;        // ~250 km/h; faster jumps are GPS glitches

const $ = (id) => document.getElementById(id);
const els = {
  price: $('price'), distance: $('distance'), fuel: $('fuel'),
  toggle: $('toggle'), status: $('status'), reset: $('reset'),
  openSettings: $('openSettings'), settings: $('settings'),
  settingsForm: $('settingsForm'), consumption: $('consumption'), fuelPrice: $('fuelPrice'),
};

const ftFormat = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 });
const kmFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

const settings = load(SETTINGS_KEY, DEFAULT_SETTINGS);
const trip = load(TRIP_KEY, { distanceM: 0, running: false });

let watchId = null;
let lastPoint = null;   // last accepted fix: { lat, lon, t }
let wakeLock = null;

// ---------- rendering ----------

function render() {
  const km = trip.distanceM / 1000;
  const litres = km * settings.consumption / 100;
  const cost = litres * settings.fuelPrice;
  els.price.textContent = `${ftFormat.format(Math.round(cost))} Ft`;
  els.distance.textContent = `${kmFormat.format(km)} km`;
  els.fuel.textContent = `${litres.toFixed(2)} l`;
  els.toggle.textContent = watchId !== null ? 'Pause' : 'Start';
  els.toggle.classList.toggle('running', watchId !== null);
}

function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.toggle('error', isError);
}

// ---------- distance ----------

function haversineM(a, b) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function onPosition(pos) {
  const { latitude: lat, longitude: lon, accuracy } = pos.coords;
  const point = { lat, lon, t: pos.timestamp };

  if (accuracy > MAX_ACCURACY_M) {
    setStatus(`Weak GPS signal (±${Math.round(accuracy)} m)…`);
    return;
  }
  setStatus(`Tracking · GPS ±${Math.round(accuracy)} m`);

  if (!lastPoint) {
    lastPoint = point;
    return;
  }

  const d = haversineM(lastPoint, point);
  if (d < Math.max(MIN_STEP_M, accuracy)) return;   // jitter; keep accumulating from lastPoint

  const dt = (point.t - lastPoint.t) / 1000;
  if (dt > 0 && d / dt > MAX_SPEED_MS) {
    lastPoint = point;   // GPS jump: re-anchor without counting it
    return;
  }

  trip.distanceM += d;
  lastPoint = point;
  save(TRIP_KEY, trip);
  render();
}

function onPositionError(err) {
  if (err.code === err.PERMISSION_DENIED) {
    setStatus('Location permission denied. Enable it in Settings › Privacy › Location Services › Safari.', true);
    stop();
  } else if (err.code === err.TIMEOUT) {
    setStatus('Waiting for GPS…');
  } else {
    setStatus('GPS unavailable, retrying…', true);
  }
}

// ---------- start / pause ----------

function start() {
  if (!('geolocation' in navigator)) {
    setStatus('GPS is not available on this device/browser.', true);
    return;
  }
  lastPoint = null;
  watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 15000,
  });
  trip.running = true;
  save(TRIP_KEY, trip);
  setStatus('Waiting for GPS…');
  requestWakeLock();
  render();
}

function stop() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  lastPoint = null;   // don't count movement that happens while paused
  trip.running = false;
  save(TRIP_KEY, trip);
  releaseWakeLock();
  render();
}

function reset() {
  if (!confirm('Reset trip?')) return;
  trip.distanceM = 0;
  lastPoint = null;
  save(TRIP_KEY, trip);
  if (watchId === null) setStatus('Trip reset. Tap Start to begin tracking');
  render();
}

// ---------- screen wake lock ----------

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch { /* not allowed right now (e.g. low power mode) */ }
}

function releaseWakeLock() {
  if (wakeLock) wakeLock.release();
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && watchId !== null && !wakeLock) requestWakeLock();
});

// ---------- settings ----------

els.openSettings.addEventListener('click', () => {
  els.consumption.value = settings.consumption;
  els.fuelPrice.value = settings.fuelPrice;
  els.settings.showModal();
});

els.settings.addEventListener('close', () => {
  if (els.settings.returnValue !== 'save') return;
  const consumption = parseFloat(String(els.consumption.value).replace(',', '.'));
  const fuelPrice = parseFloat(String(els.fuelPrice.value).replace(',', '.'));
  if (Number.isFinite(consumption) && consumption >= 0) settings.consumption = consumption;
  if (Number.isFinite(fuelPrice) && fuelPrice >= 0) settings.fuelPrice = fuelPrice;
  save(SETTINGS_KEY, settings);
  render();
});

// ---------- wiring ----------

els.toggle.addEventListener('click', () => (watchId !== null ? stop() : start()));
els.reset.addEventListener('click', reset);

if (trip.running) {
  // Tracking can't resume without a user tap, so restore as paused.
  trip.running = false;
  save(TRIP_KEY, trip);
  setStatus('Trip restored — tap Start to continue');
}
render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
