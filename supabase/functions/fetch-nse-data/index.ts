// fetch-nse-data edge function
// Handles all index options chains for NSE and BSE indices
// Returns: { success: true, data: [{ expiry, strikes, spotPrice }] }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'Connection': 'keep-alive',
};

const BSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.bseindia.com/',
  'Origin': 'https://www.bseindia.com',
  'Connection': 'keep-alive',
};

// Map edge type to exchange config
// maxExp: how many expiries to store
// weekly indices get 8 (4 weekly + 4 monthly), monthly get 4
const TYPE_CONFIG = {
  'nifty_chain':       { symbol: 'NIFTY',       exchange: 'NSE', maxExp: 8 },
  'banknifty_chain':   { symbol: 'BANKNIFTY',   exchange: 'NSE', maxExp: 4 },
  'finnifty_chain':    { symbol: 'FINNIFTY',    exchange: 'NSE', maxExp: 4 },
  'midcapnifty_chain': { symbol: 'MIDCPNIFTY',  exchange: 'NSE', maxExp: 4 },
  'niftynext50_chain': { symbol: 'NIFTYNXT50',  exchange: 'NSE', maxExp: 4 },
  'sensex_chain':      { symbol: 'SENSEX',      exchange: 'BSE', maxExp: 8 },
  'bankex_chain':      { symbol: 'BANKEX',      exchange: 'BSE', maxExp: 4 },
};

const MONTH_MAP = {
  'Jan':'01','Feb':'02','Mar':'03','Apr':'04','May':'05','Jun':'06',
  'Jul':'07','Aug':'08','Sep':'09','Oct':'10','Nov':'11','Dec':'12',
};

// Convert "30-Apr-2026" or "30 Apr 2026" to "2026-04-30"
function toISO(dateStr) {
  if (!dateStr) return dateStr;
  const s = String(dateStr).trim();
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // "30-Apr-2026"
  const parts = s.split(/[-\s]+/);
  if (parts.length === 3) {
    const d = parts[0].padStart(2, '0');
    const m = MONTH_MAP[parts[1]] || parts[1];
    const y = parts[2];
    if (y.length === 4) return y + '-' + m + '-' + d;
  }
  return s;
}

// ── NSE HELPERS ──

async function getNSECookies() {
  const res = await fetch('https://www.nseindia.com/', {
    headers: Object.assign({}, NSE_HEADERS, {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }),
    redirect: 'follow',
  });
  const raw = res.headers.get('set-cookie') || '';
  const cookies = [];
  raw.split(/,\s*(?=[a-zA-Z_][^=,]*=)/).forEach(function(part) {
    const kv = part.trim().split(';')[0].trim();
    if (kv && kv.includes('=')) cookies.push(kv);
  });
  return cookies.join('; ');
}

async function nseGet(path, cookie) {
  const res = await fetch('https://www.nseindia.com' + path, {
    headers: Object.assign({}, NSE_HEADERS, { 'Cookie': cookie }),
  });
  if (!res.ok) throw new Error('NSE ' + res.status + ' for ' + path);
  return await res.json();
}

function parseNSEChain(json, maxExp) {
  const expiries = (json.records && json.records.expiryDates) || [];
  const rows = (json.records && json.records.data) || [];
  const spot = (json.records && json.records.underlyingValue) || 0;

  return expiries.slice(0, maxExp).map(function(exp) {
    const strikes = {};
    rows.filter(function(r) { return r.expiryDate === exp; }).forEach(function(r) {
      if (!r.strikePrice) return;
      const k = String(r.strikePrice);
      strikes[k] = {
        ce_oi:  (r.CE && r.CE.openInterest)          || 0,
        ce_coi: (r.CE && r.CE.changeinOpenInterest)   || 0,
        ce_vol: (r.CE && r.CE.totalTradedVolume)      || 0,
        ce_ltp: (r.CE && r.CE.lastPrice)              || 0,
        ce_iv:  (r.CE && r.CE.impliedVolatility)      || 0,
        pe_oi:  (r.PE && r.PE.openInterest)           || 0,
        pe_coi: (r.PE && r.PE.changeinOpenInterest)   || 0,
        pe_vol: (r.PE && r.PE.totalTradedVolume)      || 0,
        pe_ltp: (r.PE && r.PE.lastPrice)              || 0,
        pe_iv:  (r.PE && r.PE.impliedVolatility)      || 0,
      };
    });
    return { expiry: toISO(exp), strikes: strikes, spotPrice: spot };
  });
}

async function fetchNSEIndexChain(symbol, maxExp) {
  const cookie = await getNSECookies();
  await new Promise(function(r) { setTimeout(r, 800); });
  const json = await nseGet('/api/option-chain-indices?symbol=' + encodeURIComponent(symbol), cookie);
  const chain = parseNSEChain(json, maxExp);
  if (!chain || chain.length === 0) throw new Error('No data for ' + symbol);
  return chain;
}

// ── BSE HELPERS ──

async function bseGet(url) {
  const res = await fetch(url, { headers: BSE_HEADERS });
  if (!res.ok) throw new Error('BSE ' + res.status + ' for ' + url);
  return await res.json();
}

async function getBSEExpiries(symbol) {
  // symbol: 'SENSEX' or 'BANKEX'
  const base = 'https://api.bseindia.com/BseIndiaAPI/api/';
  const path = symbol === 'BANKEX'
    ? 'GetBankexExpDate/w'
    : 'GetSensexExpDate/w';
  const json = await bseGet(base + path);
  // Response is array of { ExpiryDate: "30 Apr 2026" } or plain strings
  if (Array.isArray(json)) return json;
  if (json && json.Table) return json.Table;
  return [];
}

function parseBSEChain(rows, expISO) {
  const strikes = {};
  rows.forEach(function(r) {
    const sp = r.Strike_Price || r.StrikePrice || r.strikePrice;
    if (!sp) return;
    const k = String(sp);
    strikes[k] = {
      ce_oi:  parseFloat(r.CE_OI  || r.Call_OI     || r.CE_OpenInterest  || 0) || 0,
      ce_coi: parseFloat(r.CE_COI || r.Call_COI    || r.CE_ChgOI         || 0) || 0,
      ce_vol: parseFloat(r.CE_Vol || r.Call_Volume  || r.CE_Volume        || 0) || 0,
      ce_ltp: parseFloat(r.CE_LTP || r.Call_LTP     || r.CE_LastPrice     || 0) || 0,
      ce_iv:  parseFloat(r.CE_IV  || r.Call_IV      || r.CE_ImpVol        || 0) || 0,
      pe_oi:  parseFloat(r.PE_OI  || r.Put_OI       || r.PE_OpenInterest  || 0) || 0,
      pe_coi: parseFloat(r.PE_COI || r.Put_COI      || r.PE_ChgOI         || 0) || 0,
      pe_vol: parseFloat(r.PE_Vol || r.Put_Volume    || r.PE_Volume        || 0) || 0,
      pe_ltp: parseFloat(r.PE_LTP || r.Put_LTP      || r.PE_LastPrice     || 0) || 0,
      pe_iv:  parseFloat(r.PE_IV  || r.Put_IV        || r.PE_ImpVol        || 0) || 0,
    };
  });
  return { expiry: expISO, strikes: strikes, spotPrice: 0 };
}

async function fetchBSEIndexChain(symbol, maxExp) {
  const base = 'https://api.bseindia.com/BseIndiaAPI/api/';
  const expiriesRaw = await getBSEExpiries(symbol);

  const expiries = expiriesRaw
    .map(function(e) {
      if (typeof e === 'string') return e;
      return e.ExpiryDate || e.expiryDate || e.expiry || '';
    })
    .filter(Boolean)
    .slice(0, maxExp);

  if (expiries.length === 0) throw new Error('No BSE expiries for ' + symbol);

  const results = [];
  for (let i = 0; i < expiries.length; i++) {
    const expRaw = expiries[i];
    const expISO = toISO(expRaw);
    try {
      await new Promise(function(r) { setTimeout(r, 600); });
      const chainPath = symbol === 'BANKEX'
        ? 'GetBankexoptionChain/w?ExpiryDate=' + encodeURIComponent(expRaw)
        : 'GetSensexoptionChain/w?scripcode=&ExpiryDate=' + encodeURIComponent(expRaw);
      const json = await bseGet(base + chainPath);
      const rows = json.Table || json.data || json.Options || [];
      if (rows.length > 0) {
        results.push(parseBSEChain(rows, expISO));
      } else {
        results.push({ expiry: expISO, strikes: {}, spotPrice: 0 });
      }
    } catch (err) {
      results.push({ expiry: expISO, strikes: {}, error: err.message });
    }
  }
  return results;
}

// ── MAIN HANDLER ──

Deno.serve(async function(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const respond = function(body, status) {
    return new Response(JSON.stringify(body), {
      status: status || 200,
      headers: Object.assign({}, CORS, { 'Content-Type': 'application/json' }),
    });
  };

  try {
    const body = await req.json();
    const type = body.type;

    if (!type) return respond({ success: false, error: 'Missing type' }, 400);

    // Trade date check — used by autofetch to get current market date
    if (type === 'get_expiries') {
      const tradeDate = new Date().toISOString().split('T')[0];
      return respond({ success: true, data: { trade_date: tradeDate } });
    }

    const config = TYPE_CONFIG[type];
    if (!config) return respond({ success: false, error: 'Unknown type: ' + type }, 400);

    let chain;
    if (config.exchange === 'NSE') {
      chain = await fetchNSEIndexChain(config.symbol, config.maxExp);
    } else {
      chain = await fetchBSEIndexChain(config.symbol, config.maxExp);
    }

    if (!chain || chain.length === 0) {
      return respond({ success: false, error: 'No data returned for ' + config.symbol });
    }

    return respond({ success: true, data: chain });

  } catch (err) {
    return respond({ success: false, error: err.message }, 500);
  }
});
