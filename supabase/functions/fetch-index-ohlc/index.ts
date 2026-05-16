import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const NSE_NAME_MAP: Record<string, string> = {
  'Nifty 50': 'NIFTY50', 'NIFTY 50': 'NIFTY50',
  'Nifty Bank': 'BANKNIFTY', 'NIFTY BANK': 'BANKNIFTY',
  'Nifty Financial Services': 'FINNIFTY', 'NIFTY FINANCIAL SERVICES': 'FINNIFTY',
  'Nifty Fin Service': 'FINNIFTY',
  'Nifty Midcap Select': 'MIDCAPNIFTY', 'NIFTY MIDCAP SELECT': 'MIDCAPNIFTY',
  'Nifty Next 50': 'NIFTYNEXT50', 'NIFTY NEXT 50': 'NIFTYNEXT50',
};

// Yahoo Finance tickers for each index key
const YAHOO_TICKERS: Record<string, string> = {
  'NIFTY50':     '^NSEI',
  'BANKNIFTY':   '^NSEBANK',
  'FINNIFTY':    'NIFTY_FIN_SERVICE.NS',
  'MIDCAPNIFTY': '^NIFMDCP50',
  'NIFTYNEXT50': '^NIFTYJR',
  'INDIAVIX':    '^INDIAVIX',
};

function toNum(v: string): number {
  const n = parseFloat(v.replace(/,/g, '').trim());
  return isNaN(n) ? 0 : n;
}

function todayIST(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().split('T')[0];
}

function candidateDates(fromYMD: string): string[] {
  const dates: string[] = [];
  const d = new Date(fromYMD + 'T00:00:00Z');
  for (let i = 0; i < 7 && dates.length < 5; i++) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(d.toISOString().split('T')[0]);
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return dates;
}

async function fetchNSEOHLC(dateYMD: string): Promise<{ rows: any[]; date: string }> {
  const parts = dateYMD.split('-');
  const ddmmyyyy = parts[2] + parts[1] + parts[0];
  const url = 'https://archives.nseindia.com/content/indices/ind_close_all_' + ddmmyyyy + '.csv';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      'Accept': 'text/csv,text/plain,*/*',
    },
  });
  if (!res.ok) throw new Error('NSE archives ' + res.status);
  const text = await res.text();
  const lines = text.trim().split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
  if (lines.length < 2) throw new Error('Empty CSV for ' + dateYMD);
  const rows: any[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(',').map(function(c) { return c.trim().replace(/"/g, ''); });
    const ourKey = NSE_NAME_MAP[cols[0]];
    if (!ourKey) continue;
    const open = toNum(cols[1]), high = toNum(cols[2]), low = toNum(cols[3]), close = toNum(cols[4]);
    if (open <= 0 || high <= 0 || low <= 0 || close <= 0) continue;
    rows.push({ index_name: ourKey, trade_date: dateYMD, open, high, low, close, source: 'nse' });
  }
  if (!rows.length) throw new Error('No matching indices in CSV for ' + dateYMD);
  return { rows, date: dateYMD };
}

async function fetchYahooRow(indexKey: string, targetDate: string): Promise<any | null> {
  const ticker = YAHOO_TICKERS[indexKey];
  if (!ticker) return null;
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ticker) + '?interval=1d&range=10d&includePrePost=false';
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json,*/*',
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const timestamps: number[] = result.timestamp ?? [];
    const quotes = result.indicators?.quote?.[0] ?? {};
    for (let i = 0; i < timestamps.length; i++) {
      const dt = new Date(timestamps[i] * 1000 + 5.5 * 3600 * 1000);
      const dateStr = dt.toISOString().split('T')[0];
      if (dateStr === targetDate) {
        const open = quotes.open?.[i], high = quotes.high?.[i], low = quotes.low?.[i], close = quotes.close?.[i];
        if (open && high && low && close) {
          return {
            index_name: indexKey, trade_date: targetDate,
            open: Math.round(open * 100) / 100, high: Math.round(high * 100) / 100,
            low: Math.round(low * 100) / 100, close: Math.round(close * 100) / 100,
            source: 'yahoo',
          };
        }
      }
    }
  } catch (_) { /* ignore per-ticker errors */ }
  return null;
}

async function fetchYahooOHLC(targetDate: string): Promise<{ rows: any[]; date: string }> {
  const results = await Promise.all(
    Object.keys(YAHOO_TICKERS).map(function(key) { return fetchYahooRow(key, targetDate); })
  );
  const rows = results.filter(function(r) { return r !== null; });
  if (!rows.length) throw new Error('Yahoo Finance: no data for ' + targetDate);
  return { rows, date: targetDate };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey)
    return new Response(JSON.stringify({ error: 'Missing secrets' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const supabase = createClient(supabaseUrl, serviceKey);
  const reqUrl = new URL(req.url);
  const explicitDate = reqUrl.searchParams.get('date');
  const datesToTry = explicitDate ? [explicitDate] : candidateDates(todayIST());

  const errors: string[] = [];
  let result: { rows: any[]; date: string } | null = null;

  for (const d of datesToTry) {
    // Try NSE archives first
    try { result = await fetchNSEOHLC(d); break; }
    catch (e: any) { errors.push('NSE ' + d + ': ' + e.message); }
    // Fall back to Yahoo Finance
    try { result = await fetchYahooOHLC(d); break; }
    catch (e: any) { errors.push('Yahoo ' + d + ': ' + e.message); }
  }

  if (!result)
    return new Response(JSON.stringify({ error: 'All sources failed', details: errors }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const { error: dbErr } = await supabase.from('index_ohlc').upsert(result.rows, { onConflict: 'index_name,trade_date' });
  if (dbErr)
    return new Response(JSON.stringify({ error: dbErr.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });

  return new Response(JSON.stringify({
    date: result.date, saved: result.rows.length,
    indices: result.rows.map(function(r) { return r.index_name; }),
    source: result.rows[0]?.source,
    errors: errors.length ? errors : undefined,
  }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
});
