// fetch-constituent-data — daily OHLC for Nifty 50 constituent stocks via Upstox v2
// Secrets required: UPSTOX_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Schedule via Supabase Dashboard → Edge Functions → Schedules:
//   Cron: 0 11 * * 1-5   (runs at 11:00 UTC = 4:30 PM IST, Mon–Fri, after market close)
//
// Can also be triggered manually:
//   POST https://<project>.supabase.co/functions/v1/fetch-constituent-data

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const UPSTOX_BASE = 'https://api.upstox.com/v2';

function hdrs(token: string) {
  return { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };
}

// Fetch daily candle for a stock from Upstox historical API.
// Returns { open, high, low, close, volume } for the given date, or null.
async function fetchDailyOHLC(
  instrumentKey: string,
  date: string,          // YYYY-MM-DD
  token: string,
): Promise<{ open: number; high: number; low: number; close: number; volume: number } | null> {
  const encoded = encodeURIComponent(instrumentKey);
  const url = `${UPSTOX_BASE}/historical-candle/${encoded}/day/${date}/${date}`;
  try {
    const res = await fetch(url, { headers: hdrs(token) });
    if (!res.ok) return null;
    const json = await res.json();
    const candles: number[][] = json?.data?.candles ?? [];
    if (candles.length === 0) return null;
    // Upstox format: [timestamp, open, high, low, close, volume, oi]
    const [, open, high, low, close, volume] = candles[0];
    return { open, high, low, close, volume };
  } catch {
    return null;
  }
}

// Fetch previous trading day's close to compute change_pct.
async function fetchPrevClose(
  instrumentKey: string,
  date: string,
  token: string,
): Promise<number | null> {
  const encoded = encodeURIComponent(instrumentKey);
  // Fetch last 5 days to reliably get the previous trading day
  const from = new Date(date);
  from.setDate(from.getDate() - 7);
  const fromStr = from.toISOString().split('T')[0];
  const url = `${UPSTOX_BASE}/historical-candle/${encoded}/day/${date}/${fromStr}`;
  try {
    const res = await fetch(url, { headers: hdrs(token) });
    if (!res.ok) return null;
    const json = await res.json();
    const candles: number[][] = json?.data?.candles ?? [];
    // candles are newest-first; index 1 is the day before `date`
    if (candles.length < 2) return null;
    return candles[1][4]; // previous day close
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const token = Deno.env.get('UPSTOX_ACCESS_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!token || !supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Missing secrets' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Determine target date: use ?date=YYYY-MM-DD param or default to today IST
  const url = new URL(req.url);
  const targetDate = url.searchParams.get('date') ?? (() => {
    const now = new Date();
    // Convert to IST (UTC+5:30)
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    return ist.toISOString().split('T')[0];
  })();

  // Load active constituents
  const { data: constituents, error: cErr } = await supabase
    .from('nifty_constituents')
    .select('symbol, upstox_key')
    .eq('active', true);

  if (cErr || !constituents) {
    return new Response(JSON.stringify({ error: 'Failed to load constituents', detail: cErr?.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const results = { date: targetDate, success: 0, skipped: 0, failed: [] as string[] };

  // Fetch each stock in sequence (Upstox rate limits: ~10 req/s)
  for (const stock of constituents) {
    try {
      const ohlc = await fetchDailyOHLC(stock.upstox_key, targetDate, token);
      if (!ohlc) { results.skipped++; continue; }

      const prevClose = await fetchPrevClose(stock.upstox_key, targetDate, token);
      const change_pct = prevClose && prevClose > 0
        ? parseFloat(((ohlc.close - prevClose) / prevClose * 100).toFixed(2))
        : null;

      const { error: uErr } = await supabase
        .from('constituent_daily_data')
        .upsert({
          symbol: stock.symbol,
          trade_date: targetDate,
          open: ohlc.open,
          high: ohlc.high,
          low: ohlc.low,
          close: ohlc.close,
          volume: ohlc.volume,
          change_pct,
          fetched_at: new Date().toISOString(),
        }, { onConflict: 'symbol,trade_date' });

      if (uErr) { results.failed.push(stock.symbol); }
      else { results.success++; }

      // Small delay to respect Upstox rate limits
      await new Promise(r => setTimeout(r, 120));
    } catch (e) {
      results.failed.push(stock.symbol);
    }
  }

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
