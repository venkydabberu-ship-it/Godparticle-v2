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

function toLong(v: any): number {
  if (v === undefined || v === null || v === '') return 0;
  const n = typeof v === 'string' ? parseInt(v.replace(/,/g, '').trim(), 10) : Number(v);
  return isNaN(n) ? 0 : n;
}

// ── Approach 1: NSE archives CSV (works from datacenter IPs, no cookies needed) ──
// URL: https://archives.nseindia.com/content/nsccl/fao_participant_oi_DDMMYYYY.csv
// Columns: Client Type | Future Index Long | Future Index Short | Option Index Call Long |
//          Option Index Call Short | Option Index Put Long | Option Index Put Short |
//          Future Stock Long | Future Stock Short | ... | Total Long | Total Short
async function fetchFromArchiveCSV(dateYMD: string): Promise<{
  fiiLong: number; fiiShort: number;
  diiLong: number; diiShort: number;
  proLong: number; proShort: number;
  source: string;
}> {
  const [yyyy, mm, dd] = dateYMD.split('-');
  const ddmmyyyy = `${dd}${mm}${yyyy}`;
  const url = `https://archives.nseindia.com/content/nsccl/fao_participant_oi_${ddmmyyyy}.csv`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      'Accept': 'text/csv,text/plain,*/*',
    },
  });
  if (!res.ok) throw new Error(`NSE archives responded ${res.status} for ${url}`);

  const text = await res.text();
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);

  // Skip header row(s) — find data lines by matching client type names
  const result = { fiiLong: 0, fiiShort: 0, diiLong: 0, diiShort: 0, proLong: 0, proShort: 0, source: 'NSE Archives CSV' };

  for (const line of lines) {
    const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
    const clientType = cols[0]?.toUpperCase() ?? '';
    // Col index: 0=ClientType 1=FutIdxLong 2=FutIdxShort 3=OptIdxCELong 4=OptIdxCEShort 5=OptIdxPELong 6=OptIdxPEShort ...
    if (clientType === 'FII' || clientType === 'FOREIGN INSTITUTIONAL INVESTORS') {
      result.fiiLong  = toLong(cols[1]);
      result.fiiShort = toLong(cols[2]);
    } else if (clientType === 'DII' || clientType === 'DOMESTIC INSTITUTIONAL INVESTORS') {
      result.diiLong  = toLong(cols[1]);
      result.diiShort = toLong(cols[2]);
    } else if (clientType === 'PRO' || clientType === 'PROPRIETARY' || clientType === 'PROP') {
      result.proLong  = toLong(cols[1]);
      result.proShort = toLong(cols[2]);
    }
  }

  if (result.fiiLong === 0 && result.fiiShort === 0) {
    throw new Error(`CSV parsed but FII futures OI is zero — market may be closed or file not yet published. Lines found: ${lines.length}`);
  }
  return result;
}

// ── Approach 2: NSE live JSON API (requires cookies, may fail from datacenter) ──
async function fetchFromNSEApi(): Promise<{
  fiiLong: number; fiiShort: number;
  diiLong: number; diiShort: number;
  proLong: number; proShort: number;
  source: string;
}> {
  const NSE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
  };

  // Warm up session for cookies
  let cookies = '';
  try {
    const warmup = await fetch('https://www.nseindia.com/', {
      headers: { ...NSE_HEADERS, 'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8' },
    });
    const raw = warmup.headers.get('set-cookie') ?? '';
    cookies = raw.split(',').map(s => s.trim().split(';')[0]).filter(Boolean).join('; ');
    await new Promise(r => setTimeout(r, 600));
  } catch { /* proceed without cookies */ }

  const res = await fetch('https://www.nseindia.com/api/participant-wise-open-interest', {
    headers: { ...NSE_HEADERS, 'Referer': 'https://www.nseindia.com/', 'Cookie': cookies },
  });
  if (!res.ok) throw new Error(`NSE JSON API responded ${res.status}`);

  const json = await res.json();
  const data: any[] = json?.data ?? [];

  function find(type: string) {
    return data.find((d: any) =>
      (d.clientType ?? d.client_type ?? '').toUpperCase() === type.toUpperCase()
    ) ?? {};
  }

  const fii = find('FII');
  const dii = find('DII');
  const pro = find('PRO');

  const fiiLong  = toLong(fii.futureIndexLong  ?? fii.future_index_long  ?? fii.indexFutLong  ?? 0);
  const fiiShort = toLong(fii.futureIndexShort ?? fii.future_index_short ?? fii.indexFutShort ?? 0);

  if (fiiLong === 0 && fiiShort === 0) {
    throw new Error(`NSE JSON returned zero FII OI — market closed or data not yet published. Raw clients: ${JSON.stringify(data.map((d:any) => d.clientType ?? d.client_type))}`);
  }

  return {
    fiiLong, fiiShort,
    diiLong:  toLong(dii.futureIndexLong  ?? dii.future_index_long  ?? 0),
    diiShort: toLong(dii.futureIndexShort ?? dii.future_index_short ?? 0),
    proLong:  toLong(pro.futureIndexLong  ?? pro.future_index_long  ?? 0),
    proShort: toLong(pro.futureIndexShort ?? pro.future_index_short ?? 0),
    source: 'NSE JSON API',
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
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

  const errors: string[] = [];

  try {
    // Try CSV archive first (more reliable from Supabase datacenter)
    let oiResult: Awaited<ReturnType<typeof fetchFromArchiveCSV>> | null = null;

    try {
      oiResult = await fetchFromArchiveCSV(targetDate);
    } catch (csvErr: any) {
      errors.push(`CSV: ${csvErr.message}`);
      // Fall back to JSON API
      try {
        oiResult = await fetchFromNSEApi();
      } catch (apiErr: any) {
        errors.push(`JSON API: ${apiErr.message}`);
      }
    }

    if (!oiResult) {
      return new Response(JSON.stringify({
        error: 'Both NSE data sources failed. NSE may not have published today\'s data yet (try after 6 PM IST) or the market was closed.',
        details: errors,
        date: targetDate,
      }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const { fiiLong, fiiShort, diiLong, diiShort, proLong, proShort, source } = oiResult;

    const total      = fiiLong + fiiShort;
    const fiiLongPct = total > 0 ? parseFloat(((fiiLong / total) * 100).toFixed(2)) : 50.00;
    const fiiNet     = fiiLong - fiiShort;

    // Upsert into fii_data
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
      date:         targetDate,
      fii_long:     fiiLong,
      fii_short:    fiiShort,
      fii_long_pct: fiiLongPct,
      fii_net:      fiiNet,
      signal:       fiiLongPct > 55 ? 'BULLISH' : fiiLongPct < 45 ? 'BEARISH' : 'NEUTRAL',
      source,
    }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message, details: errors }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
