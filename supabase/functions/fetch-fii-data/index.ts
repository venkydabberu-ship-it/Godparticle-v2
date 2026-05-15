// fetch-fii-data — daily FII participant-wise open interest in index futures via NSE
// Secrets required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// SQL to run once in Supabase SQL editor:
// ─────────────────────────────────────────────────────────────────────────────
// CREATE TABLE IF NOT EXISTS fii_data (
//   trade_date        DATE PRIMARY KEY,
//   fii_long_futures  BIGINT NOT NULL DEFAULT 0,
//   fii_short_futures BIGINT NOT NULL DEFAULT 0,
//   fii_long_pct      DECIMAL(5,2),
//   fii_net_futures   BIGINT,
//   dii_long_futures  BIGINT,
//   dii_short_futures BIGINT,
//   pro_long_futures  BIGINT,
//   pro_short_futures BIGINT,
//   fetched_at        TIMESTAMPTZ DEFAULT NOW()
// );
// ALTER TABLE fii_data ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "Anyone can read fii_data"
//   ON fii_data FOR SELECT USING (true);
// CREATE POLICY "Service role can write fii_data"
//   ON fii_data FOR ALL USING (auth.role() = 'service_role');
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

// Step 1: warm up NSE session to get cookies
async function getNSECookies(): Promise<string> {
  const res = await fetch('https://www.nseindia.com/', {
    headers: { ...NSE_HEADERS, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
  });
  const raw = res.headers.get('set-cookie') ?? '';
  // Extract key=value from each Set-Cookie header segment
  return raw.split(',')
    .map(s => s.trim().split(';')[0])
    .filter(Boolean)
    .join('; ');
}

// Step 2: fetch participant-wise OI from NSE
async function fetchParticipantOI(cookies: string): Promise<any[]> {
  const url = 'https://www.nseindia.com/api/participant-wise-open-interest';
  const res = await fetch(url, {
    headers: { ...NSE_HEADERS, 'Referer': 'https://www.nseindia.com/', 'Cookie': cookies },
  });
  if (!res.ok) throw new Error(`NSE responded ${res.status}`);
  const json = await res.json();
  // NSE returns { data: [...] } where each item has clientType + futures OI
  return json?.data ?? [];
}

function findClient(data: any[], type: string) {
  return data.find((d: any) =>
    (d.clientType ?? d.client_type ?? '').toUpperCase() === type.toUpperCase()
  ) ?? {};
}

function toLong(v: any): number {
  const n = typeof v === 'string' ? parseInt(v.replace(/,/g, ''), 10) : Number(v);
  return isNaN(n) ? 0 : n;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabaseUrl  = Deno.env.get('SUPABASE_URL');
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Missing secrets' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Accept ?date=YYYY-MM-DD or default to today IST
  const reqUrl = new URL(req.url);
  const targetDate = reqUrl.searchParams.get('date') ?? (() => {
    const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    return ist.toISOString().split('T')[0];
  })();

  try {
    // 1. Warm up NSE session
    let cookies = '';
    try {
      cookies = await getNSECookies();
      // Small pause to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      // Proceed without cookies — some endpoints still respond
    }

    // 2. Fetch participant-wise OI
    const oiData = await fetchParticipantOI(cookies);

    const fii = findClient(oiData, 'FII');
    const dii = findClient(oiData, 'DII');
    const pro = findClient(oiData, 'PRO');

    // Field names NSE uses (may vary — try both known formats)
    const fiiLong  = toLong(fii.futureIndexLong  ?? fii.future_index_long  ?? fii.indexFutLong  ?? 0);
    const fiiShort = toLong(fii.futureIndexShort ?? fii.future_index_short ?? fii.indexFutShort ?? 0);
    const diiLong  = toLong(dii.futureIndexLong  ?? dii.future_index_long  ?? 0);
    const diiShort = toLong(dii.futureIndexShort ?? dii.future_index_short ?? 0);
    const proLong  = toLong(pro.futureIndexLong  ?? pro.future_index_long  ?? 0);
    const proShort = toLong(pro.futureIndexShort ?? pro.future_index_short ?? 0);

    const total    = fiiLong + fiiShort;
    const fiiLongPct = total > 0 ? parseFloat(((fiiLong / total) * 100).toFixed(2)) : 50.00;
    const fiiNet   = fiiLong - fiiShort;

    if (fiiLong === 0 && fiiShort === 0) {
      return new Response(JSON.stringify({
        error: 'NSE returned zero FII futures OI — market may be closed or data not yet published',
        raw: oiData.slice(0, 3),
      }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // 3. Upsert into fii_data
    const { error: dbErr } = await supabase.from('fii_data').upsert({
      trade_date:        targetDate,
      fii_long_futures:  fiiLong,
      fii_short_futures: fiiShort,
      fii_long_pct:      fiiLongPct,
      fii_net_futures:   fiiNet,
      dii_long_futures:  diiLong,
      dii_short_futures: diiShort,
      pro_long_futures:  proLong,
      pro_short_futures: proShort,
      fetched_at:        new Date().toISOString(),
    }, { onConflict: 'trade_date' });

    if (dbErr) throw new Error(dbErr.message);

    return new Response(JSON.stringify({
      date: targetDate,
      fii_long: fiiLong,
      fii_short: fiiShort,
      fii_long_pct: fiiLongPct,
      fii_net: fiiNet,
      signal: fiiLongPct > 55 ? 'BULLISH' : fiiLongPct < 45 ? 'BEARISH' : 'NEUTRAL',
    }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
