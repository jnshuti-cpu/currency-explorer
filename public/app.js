// Currency Explorer front end. All text is inserted with textContent (XSS-safe).
const MAJOR = ['USD','EUR','GBP','JPY','CHF','CAD','AUD','CNY','INR','ZAR','KES','RWF','NGN','AED'];
const $ = (id) => document.getElementById(id);
const state = { names: {}, rates: {}, base: 'USD' };

function showError(msg) { const e = $('error'); e.textContent = msg || ''; e.hidden = !msg; }

async function getJSON(url) {
  const r = await fetch(url);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Request failed (${r.status})`);
  return { body, servedBy: r.headers.get('X-Served-By') };
}

async function loadRates(base) {
  $('status').textContent = 'Loading rates…';
  showError('');
  try {
    const { body, servedBy } = await getJSON(`/api/rates?base=${encodeURIComponent(base)}`);
    state.rates = body.rates; state.base = body.base;
    $('meta').textContent = `Updated ${body.updated} · served by ${servedBy || 'unknown'}` +
      (body.stale ? ' · showing cached data (service unreachable)' : body.cached ? ' · cached' : '');
    render();
  } catch (err) {
    $('status').textContent = '';
    showError(err.message);
  }
}

function render() {
  const q = $('search').value.trim().toLowerCase();
  const filter = $('filter').value;
  const [sortKey, dir] = $('sort').value.split('-');
  const amount = parseFloat($('amount').value);
  const amt = Number.isFinite(amount) && amount >= 0 ? amount : 1;

  let list = Object.entries(state.rates).map(([code, rate]) => ({ code, rate, name: state.names[code] || code }));
  if (q) list = list.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  if (filter === 'major') list = list.filter((c) => MAJOR.includes(c.code));
  if (filter === 'stronger') list = list.filter((c) => c.rate < 1);   // 1 base buys <1 unit => currency worth more
  if (filter === 'weaker') list = list.filter((c) => c.rate > 1);

  // "Value" = purchasing worth of one unit of the currency vs the base: lower rate => worth more.
  if (sortKey === 'value') {
    list.sort((a, b) => (dir === 'desc' ? a.rate - b.rate : b.rate - a.rate));
  } else {
    list.sort((a, b) => (dir === 'desc' ? -1 : 1) * a[sortKey].localeCompare(b[sortKey]));
  }

  const tbody = $('rows');
  tbody.replaceChildren();
  const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });
  for (const c of list) {
    const tr = document.createElement('tr');
    [c.code, c.name, fmt.format(c.rate * amt), fmt.format(c.rate)].forEach((text, i) => {
      const td = document.createElement('td');
      td.textContent = text;
      if (i > 1) td.className = 'num';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  $('status').textContent = list.length
    ? `${list.length} currencies · ${fmt.format(amt)} ${state.base} converted`
    : 'No currencies match. Try a different search or filter.';
}

async function init() {
  try {
    const { body } = await getJSON('/api/codes');
    body.codes.forEach(([code, name]) => (state.names[code] = name));
    const sel = $('base');
    Object.keys(state.names).sort().forEach((code) => {
      const o = document.createElement('option');
      o.value = code; o.textContent = `${code} – ${state.names[code]}`;
      sel.appendChild(o);
    });
    sel.value = 'USD';
  } catch (err) { showError(err.message); }
  await loadRates('USD');
}

$('base').addEventListener('change', (e) => loadRates(e.target.value));
['search', 'filter', 'sort', 'amount'].forEach((id) => $(id).addEventListener('input', render));
init();
