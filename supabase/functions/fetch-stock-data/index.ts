// Supabase Edge Function: fetch-stock-data
// Handles stock price history and stock option chains from NSE
// Deploy: supabase functions deploy fetch-stock-data

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BASE = 'https://www.nseindia.com';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://www.nseindia.com/',
  'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'Connection': 'keep-alive',
  'DNT': '1',
};

// Get NSE session cookies by hitting the homepage first
async function getNSESession(): Promise<string> {
  const res = await fetch(BASE + '/', {
    headers: {
      ...BROWSER_HEADERS,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
    redirect: 'follow',
  });
  const raw = res.headers.get('set-cookie') || '';
  // Parse multiple Set-Cookie headers into a single Cookie string
  const cookies: string[] = [];
  raw.split(/,(?=[^;]+=)/).forEach(part => {
    const kv = part.trim().split(';')[0].trim();
    if (kv && kv.includes('=')) cookies.push(kv);
  });
  return cookies.join('; ');
}

// NSE GET with cookies
async function nseGet(path: string, cookie: string): Promise<any> {
  const url = BASE + path;
  const res = await fetch(url, {
    headers: { ...BROWSER_HEADERS, Cookie: cookie },
  });
  if (!res.ok) {
    throw new Error(`NSE HTTP ${res.status} for ${path}`);
  }
  return await res.json();
}

// Format date as DD-Mon-YYYY (NSE historical API format)
function fmtNSEDate(d: Date): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2,'0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

// Fetch 14 months of daily OHLCV data for a stock
async function fetchStockPrice(symbol: string, cookie: string): Promise<any> {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 14);

  const params = new URLSearchParams({
    symbol: symbol.toUpperCase(),
    series: '["EQ"]',
    from: fmtNSEDate(from),
    to: fmtNSEDate(to),
  });

  // NSE requires a warm-up request to the equity page before historical API
  await nseGet(`/get-quotes/equity?symbol=${encodeURIComponent(symbol.toUpperCase())}`, cookie).catch(() => {});
  await new Promise(r => setTimeout(r, 400));

  const json = await nseGet(`/api/historical/cm/equity?${params}`, cookie);
  return json; // { data: [...], meta: {...} }
}

// Parse NSE option chain response into strike map per expiry
function parseOptionChain(json: any, maxExpiries = 4): Array<{ expiry: string; strikes: Record<string, any>; spotPrice: number }> {
  const expiryDates: string[] = json.records?.expiryDates || [];
  const allData: any[] = json.filtered?.data || json.records?.data || [];
  const spotPrice: number = json.records?.underlyingValue || 0;

  // Take up to maxExpiries
  const selectedExpiries = expiryDates.slice(0, maxExpiries);

  return selectedExpiries.map(expiry => {
    const rows = allData.filter((d: any) => d.expiryDate === expiry);
    const strikes: Record<string, any> = {};

    rows.forEach((row: any) => {
      const strike = row.strikePrice;
      if (!strike) return;
      strikes[String(strike)] = {
        ce_oi:   row.CE?.openInterest        || 0,
        ce_coi:  row.CE?.changeinOpenInterest || 0,
        ce_vol:  row.CE?.totalTradedVolume    || 0,
        ce_ltp:  row.CE?.lastPrice            || 0,
        ce_iv:   row.CE?.impliedVolatility    || 0,
        pe_oi:   row.PE?.openInterest         || 0,
        pe_coi:  row.PE?.changeinOpenInterest || 0,
        pe_vol:  row.PE?.totalTradedVolume    || 0,
        pe_ltp:  row.PE?.lastPrice            || 0,
        pe_iv:   row.PE?.impliedVolatility    || 0,
      };
    });

    // Convert NSE expiry format "28-Apr-2026" → "2026-04-28"
    let isoExpiry = expiry;
    try {
      const parts = expiry.split('-');
      const months: Record<string,string> = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
      if (parts.length === 3) {
        isoExpiry = `${parts[2]}-${months[parts[1]] || parts[1]}-${parts[0].padStart(2,'0')}`;
      }
    } catch {}

    return { expiry: isoExpiry, strikes, spotPrice };
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { type, symbol } = await req.json();

    if (!type) {
      return new Response(JSON.stringify({ success: false, error: 'Missing type' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Acquire NSE session cookies
    const cookie = await getNSESession();
    await new Promise(r => setTimeout(r, 600));

    // ── STOCK PRICE ──
    if (type === 'stock_price') {
      if (!symbol) return new Response(JSON.stringify({ success: false, error: 'Missing symbol' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
      const priceData = await fetchStockPrice(symbol, cookie);
      return new Response(JSON.stringify({ success: true, data: priceData }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── STOCK OPTION CHAIN ──
    if (type === 'stock_chain') {
      if (!symbol) return new Response(JSON.stringify({ success: false, error: 'Missing symbol' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

      // Warm-up: hit the options page first
      await nseGet(`/option-chain?underlying=${encodeURIComponent(symbol.toUpperCase())}`, cookie).catch(() => {});
      await new Promise(r => setTimeout(r, 400));

      const json = await nseGet(`/api/option-chain-equities?symbol=${encodeURIComponent(symbol.toUpperCase())}`, cookie);
      const allExpiries = parseOptionChain(json, 4);
      const tradeDate = new Date().toISOString().split('T')[0];

      return new Response(JSON.stringify({ success: true, data: { allExpiries, tradeDate } }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: false, error: `Unknown type: ${type}` }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
