// Currency Explorer - Express server
// Proxies ExchangeRate-API so the API key never reaches the browser,
// caches responses to cut latency and API usage, and tags every response
// with the host that served it (useful for load balancer testing).
require('dotenv').config();
const os = require('os');
const path = require('path');
const express = require('express');

const API_KEY = process.env.EXCHANGE_API_KEY;
const PORT = Number(process.env.PORT) || 3000;
const TTL_MS = (Number(process.env.CACHE_TTL_MINUTES) || 60) * 60 * 1000;
const BASE_URL = `https://v6.exchangerate-api.com/v6/${API_KEY}`;

if (!API_KEY) {
  console.error('Missing EXCHANGE_API_KEY. Copy .env.example to .env and set it.');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');

// Security + identification headers
app.use((req, res, next) => {
  res.set({
    'X-Served-By': os.hostname(),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy':
      "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'",
  });
  next();
});

// In-memory cache: key -> { data, expires }
const cache = new Map();

async function cachedFetch(key, url) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return { data: hit.data, cached: true, stale: false };
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await r.json();
    if (!r.ok || data.result !== 'success') {
      const err = new Error(data['error-type'] || `Upstream HTTP ${r.status}`);
      err.upstream = true;
      throw err;
    }
    cache.set(key, { data, expires: Date.now() + TTL_MS });
    return { data, cached: false, stale: false };
  } catch (err) {
    // Graceful degradation: serve stale data if the API is down
    if (hit) return { data: hit.data, cached: true, stale: true };
    throw err;
  }
}

function handleError(res, err) {
  console.error('Upstream error:', err.message);
  const status = err.upstream ? 502 : 503;
  res.status(status).json({ error: 'Exchange rate service is unavailable. Please try again shortly.' });
}

app.get('/api/codes', async (req, res) => {
  try {
    const { data, cached, stale } = await cachedFetch('codes', `${BASE_URL}/codes`);
    res.json({ codes: data.supported_codes, cached, stale });
  } catch (err) { handleError(res, err); }
});

app.get('/api/rates', async (req, res) => {
  const base = String(req.query.base || 'USD').toUpperCase();
  if (!/^[A-Z]{3}$/.test(base)) return res.status(400).json({ error: 'base must be a 3-letter currency code.' });
  try {
    const { data, cached, stale } = await cachedFetch(`rates:${base}`, `${BASE_URL}/latest/${base}`);
    res.json({
      base: data.base_code,
      updated: data.time_last_update_utc,
      rates: data.conversion_rates,
      cached, stale,
    });
  } catch (err) { handleError(res, err); }
});

// Used by the load balancer / manual checks
app.get('/health', (req, res) => res.json({ status: 'ok', host: os.hostname(), uptime: process.uptime() }));

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => console.log(`Currency Explorer on :${PORT} (host ${os.hostname()})`));
