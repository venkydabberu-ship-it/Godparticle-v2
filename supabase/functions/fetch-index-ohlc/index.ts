// fetch-index-ohlc — fetch daily OHLC for NSE/BSE indices from NSE archives
// Source: https://archives.nseindia.com/content/indices/ind_close_all_DDMMYYYY.csv
//
// SQL to run once in Supabase SQL editor:
// ─────────────────────────────────────────────────────────────────────────────
// CREATE TABLE IF NOT EXISTS index_ohlc (
//   id          BIGSERIAL PRIMARY KEY,
//   index_name  TEXT NOT NULL,
//   trade_date  DATE NOT NULL,
//   open        DECIMAL(10,2) NOT NULL,
//   high        DECIMAL(10,2) NOT NULL,
//   low         DECIMAL(10,2) NOT NULL,
//   close       DECIMAL(10,2) NOT NULL,
//   source      TEXT DEFAULT 'auto',
//   created_at  TIMESTAMPTZ DEFAULT NOW(),
//   UNIQUE(index_name, trade_date)
// );
// ALTER TABLE index_ohlc ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "Anyone can read index_ohlc"
//   ON index_ohlc FOR SELECT USING (true);
// CREATE POLICY "Authenticated can write index_ohlc"
//   ON index_ohlc FOR ALL TO authenticated USING (true) WITH CHECK (true);
// CREATE POLICY "Service role can write index_ohlc"
//   ON index_ohlc FOR ALL USING (auth.role() = 'service_role');
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

// Map from NSE ind_close_all index names → our internal index keys
const NSE_NAME_MAP: Record<string, string> = {
  'Nifty 50':                   'NIFTY50',
  'NIFTY 50':                   'NIFTY50',
  'Nifty Bank':                 'BANKNIFTY',
  'NIFTY BANK':                 'BANKNIFTY',
  'Nifty Financial Services':   'FINNIFTY',
  'NIFTY FINANCIAL SERVICES':   'FINNIFTY',
  'Nifty Fin Service':          'FINNIFTY',
  'Nifty Midcap Select':        'MIDCAPNIFTY',
  'NIFTY MIDCAP SELECT':        'MIDCAPNIFTY',
  'Nifty Next 50':              'NIFTYNEXT50',
  'NIFTY NEXT 50':              'NIFTYNEXT50',
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
  const [yyyy, mm, dd] = dateYMD.split('-');
  const ddmmyyyy = `${dd}${mm}${yyyy}`;
  const url = `https://archives.nseindia.com/content/indices/ind_close_all_${ddmmyyyy}.csv`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      'Accept': 'text/csv,text/plain,*/*',
    },
  });
  if (!res.ok) throw new Error(`NSE archives ${res.status} for ${url}`);

  const text = await res.text();
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error(`Empty CSV for ${dateYMD}`);

  // Header: Index Name,Open,High,Low,Closing,Shares Traded,Turnover (Rs. Cr.)
  const rows: any[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
    const nseKey = cols[0];
    const ourKey = NSE_NAME_MAP[nseKey];
    if (!ourKey) continue;
    const open  = toNum(cols[1]);
    const high  = toNum(cols[2]);
    const low   = toNum(cols[3]);
    const close = toNum(cols[4]); // "Closing"
    if (open <= 0 || high <= 0 || low <= 0 || close <= 0) continue;
    rows.push({ index_name: ourKey, trade_date: dateYMD, open, high, low, close, source: 'auto' });
  }
  if (!rows.length) throw new Error(`No matching indices in CSV for ${dateYMD}`);
  return { rows, date: dateYMD };
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
  const reqUrl = new URL(req.url);
  const explicitDate = reqUrl.searchParams.get('date');
  const datesToTry = explicitDate ? [explicitDate] : candidateDates(todayIST());

  const errors: string[] = [];
  let result: { rows: any[]; date: string } | null = null;

  for (const d of datesToTry) {
    try {
      result = await fetchNSEOHLC(d);
      break;
    } catch (e: any) {
      errors.push(`${d}: ${e.message}`);
    }
  }

  if (!result) {
    return new Response(JSON.stringify({ error: 'All dates failed', details: errors }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const { error: dbErr } = await supabase
    .from('index_ohlc')
    .upsert(result.rows, { onConflict: 'index_name,trade_date' });

  if (dbErr) {
    return new Response(JSON.stringify({ error: dbErr.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    date: result.date,
    saved: result.rows.length,
    indices: result.rows.map(r => r.index_name),
    errors: errors.length ? errors : undefined,
  }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
});
