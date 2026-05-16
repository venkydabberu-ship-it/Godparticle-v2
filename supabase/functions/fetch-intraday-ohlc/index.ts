// fetch-intraday-ohlc — 30-min OHLCV candles for all tracked indices via Upstox v2
// Secrets required: UPSTOX_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Schedule via Supabase Dashboard → Edge Functions → Schedules:
//   Cron: 0 11 * * 1-5   (runs at 11:00 UTC = 4:30 PM IST, Mon–Fri)
//
// Can also be triggered manually with optional ?date=YYYY-MM-DD query param.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const UPSTOX_BASE = 'https://api.upstox.com/v2';

// Same instrument keys used in fetch-nse-data
const INDEX_KEYS: Record<string, string> = {
  'NIFTY50':     'NSE_INDEX|Nifty 50',
  'BANKNIFTY':   'NSE_INDEX|Nifty Bank',
  'FINNIFTY':    'NSE_INDEX|Nifty Fin Service',
  'MIDCAPNIFTY': 'NSE_INDEX|Nifty Midcap Select',
  'NIFTYNEXT50': 'NSE_INDEX|Nifty Next 50',
  'SENSEX':      'BSE_INDEX|SENSEX',
  'BANKEX':      'BSE_INDEX|BANKEX',
};

function hdrs(token: string) {
  return { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' };
}

function yesterdayIST(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000 - 86400000);
  return ist.toISOString().split('T')[0];
}

// Fetch 30-min candles for one index on one date.
// Upstox format: [timestamp, open, high, low, close, volume, oi]
async function fetch30min(
  indexKey: string,
  instrKey: string,
  date: string,
  token: string,
): Promise<any[]> {
  const encoded = encodeURIComponent(instrKey);
  const url = UPSTOX_BASE + '/historical-candle/' + encoded + '/30minute/' + date + '/' + date;

  const res = await fetch(url, { headers: hdrs(token) });
  if (!res.ok) throw new Error('Upstox HTTP ' + res.status + ' for ' + indexKey);

  const json = await res.json();
  const candles: any[][] = json?.data?.candles ?? [];
  if (!candles.length) throw new Error('No candles for ' + indexKey + ' on ' + date);

  return candles.map(function(c) {
    const ts = c[0];
    const open   = c[1];
    const high   = c[2];
    const low    = c[3];
    const close  = c[4];
    const volume = c[5] ?? 0;

    // Convert the IST timestamp (e.g. "2024-01-15T09:15:00+05:30") to UTC ISO string
    const utcTime = new Date(ts).toISOString();
    const tradeDate = new Date(new Date(ts).getTime() - 5.5 * 3600 * 1000 + 5.5 * 3600 * 1000)
      .toISOString().split('T')[0];

    return {
      index_name:  indexKey,
      trade_date:  date,
      candle_time: utcTime,
      open:   Math.round(open  * 100) / 100,
      high:   Math.round(high  * 100) / 100,
      low:    Math.round(low   * 100) / 100,
      close:  Math.round(close * 100) / 100,
      volume: Math.round(volume),
    };
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const token      = Deno.env.get('UPSTOX_ACCESS_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!token || !supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Missing secrets' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const reqUrl = new URL(req.url);
  const targetDate = reqUrl.searchParams.get('date') ?? yesterdayIST();

  const results: { index: string; candles: number; error?: string }[] = [];

  for (const indexKey of Object.keys(INDEX_KEYS)) {
    const instrKey = INDEX_KEYS[indexKey];
    try {
      const rows = await fetch30min(indexKey, instrKey, targetDate, token);

      if (rows.length > 0) {
        const { error: dbErr } = await supabase
          .from('intraday_ohlc')
          .upsert(rows, { onConflict: 'index_name,candle_time' });

        if (dbErr) throw new Error(dbErr.message);
        results.push({ index: indexKey, candles: rows.length });
      } else {
        results.push({ index: indexKey, candles: 0 });
      }
    } catch (e: any) {
      results.push({ index: indexKey, candles: 0, error: e.message });
    }

    // Small delay to respect Upstox rate limits (~5 req/s safe)
    await new Promise(function(r) { setTimeout(r, 200); });
  }

  const totalCandles = results.reduce(function(acc, r) { return acc + r.candles; }, 0);
  const succeeded = results.filter(function(r) { return r.candles > 0; });
  const failed    = results.filter(function(r) { return r.error; });

  return new Response(JSON.stringify({
    date:     targetDate,
    saved:    totalCandles,
    indices:  succeeded.map(function(r) { return r.index; }),
    results,
    errors:   failed.length ? failed.map(function(r) { return r.index + ': ' + r.error; }) : undefined,
  }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
