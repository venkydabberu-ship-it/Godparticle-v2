// smooth-endpoint edge function
// stock_price → Yahoo Finance (no auth, no IP block)
// stock_chain → NSE option chain with records.data

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

async function getNSECookies() {
  const res = await fetch('https://www.nseindia.com/', {
    headers: Object.assign({}, NSE_HEADERS, { 'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8' }),
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
    headers: Object.assign({}, NSE_HEADERS, { Cookie: cookie }),
  });
  if (!res.ok) throw new Error('NSE ' + res.status + ' at ' + path);
  return await res.json();
}

async function fetchYahooPrice(symbol) {
  const yahooSym = symbol.replace(/&/g, '-') + '.NS';
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + yahooSym + '?range=14mo&interval=1mo';
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error('Yahoo ' + res.status + ' for ' + yahooSym);
  const json = await res.json();
  const result = json.chart && json.chart.result && json.chart.result[0];
  if (!result) throw new Error('No Yahoo data for ' + yahooSym);

  const meta = result.meta || {};
  const timestamps = result.timestamp || [];
  const q = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
  const w52h = String(meta.fiftyTwoWeekHigh || 0);
  const w52l = String(meta.fiftyTwoWeekLow || 0);

  const data = timestamps.map(function(ts, i) {
    const d = new Date(ts * 1000);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return {
      CH_TIMESTAMP: yyyy + '-' + mm + '-' + dd,
      CH_OPENING_PRICE: String(q.open && q.open[i] || 0),
      CH_TRADE_HIGH_PRICE: String(q.high && q.high[i] || 0),
      CH_TRADE_LOW_PRICE: String(q.low && q.low[i] || 0),
      CH_CLOSING_PRICE: String(q.close && q.close[i] || 0),
      CH_TOT_TRADED_QTY: String(q.volume && q.volume[i] || 0),
      CH_52WEEK_HIGH_PRICE: w52h,
      CH_52WEEK_LOW_PRICE: w52l,
    };
  }).filter(function(r) { return parseFloat(r.CH_CLOSING_PRICE) > 0; });

  return { data: data };
}

function parseNSEChain(json, max) {
  const expiries = (json.records && json.records.expiryDates) || [];
  const rows = (json.records && json.records.data) || (json.filtered && json.filtered.data) || [];
  const spot = (json.records && json.records.underlyingValue) || 0;
  const months = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' };

  return expiries.slice(0, max || 4).map(function(exp) {
    const strikes = {};
    rows.filter(function(r) { return r.expiryDate === exp; }).forEach(function(r) {
      if (!r.strikePrice) return;
      const k = String(r.strikePrice);
      strikes[k] = {
        ce_oi: (r.CE && r.CE.openInterest) || 0,
        ce_coi: (r.CE && r.CE.changeinOpenInterest) || 0,
        ce_vol: (r.CE && r.CE.totalTradedVolume) || 0,
        ce_ltp: (r.CE && r.CE.lastPrice) || 0,
        ce_iv: (r.CE && r.CE.impliedVolatility) || 0,
        pe_oi: (r.PE && r.PE.openInterest) || 0,
        pe_coi: (r.PE && r.PE.changeinOpenInterest) || 0,
        pe_vol: (r.PE && r.PE.totalTradedVolume) || 0,
        pe_ltp: (r.PE && r.PE.lastPrice) || 0,
        pe_iv: (r.PE && r.PE.impliedVolatility) || 0,
      };
    });
    let iso = exp;
    try {
      const p = exp.split('-');
      if (p.length === 3) iso = p[2] + '-' + (months[p[1]] || p[1]) + '-' + p[0].padStart(2, '0');
    } catch(e) {}
    return { expiry: iso, strikes: strikes, spotPrice: spot };
  });
}

Deno.serve(async function(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const body = await req.json();
    const type = body.type;
    const symbol = body.symbol;

    if (!type) return new Response(JSON.stringify({ success: false, error: 'Missing type' }), { status: 400, headers: Object.assign({}, CORS, { 'Content-Type': 'application/json' }) });

    if (type === 'stock_price') {
      if (!symbol) return new Response(JSON.stringify({ success: false, error: 'Missing symbol' }), { status: 400, headers: Object.assign({}, CORS, { 'Content-Type': 'application/json' }) });
      const data = await fetchYahooPrice(symbol);
      return new Response(JSON.stringify({ success: true, data: data }), { headers: Object.assign({}, CORS, { 'Content-Type': 'application/json' }) });
    }

    if (type === 'stock_chain') {
      if (!symbol) return new Response(JSON.stringify({ success: false, error: 'Missing symbol' }), { status: 400, headers: Object.assign({}, CORS, { 'Content-Type': 'application/json' }) });
      const cookie = await getNSECookies();
      await new Promise(function(r) { setTimeout(r, 700); });
      const json = await nseGet('/api/option-chain-equities?symbol=' + encodeURIComponent(symbol.toUpperCase()), cookie);
      const allExpiries = parseNSEChain(json, 4);
      const tradeDate = new Date().toISOString().split('T')[0];
      return new Response(JSON.stringify({ success: true, data: { allExpiries: allExpiries, tradeDate: tradeDate } }), { headers: Object.assign({}, CORS, { 'Content-Type': 'application/json' }) });
    }

    return new Response(JSON.stringify({ success: false, error: 'Unknown type: ' + type }), { status: 400, headers: Object.assign({}, CORS, { 'Content-Type': 'application/json' }) });

  } catch(err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: Object.assign({}, CORS, { 'Content-Type': 'application/json' }) });
  }
});
