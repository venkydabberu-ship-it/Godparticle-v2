// z2h-auto-capture — Scheduled capture of Z2H option chain snapshots
// Triggered by pg_cron at 9:30 AM IST (4:00 AM UTC) and 11:15 AM IST (5:45 AM UTC) every weekday
// Checks which indices have expiry today, fetches live chain from Upstox, saves to z2h_snapshots
// Secrets required: UPSTOX_ACCESS_TOKEN, UPSTOX_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// All indices with their Upstox instrument keys
const INDEX_MAP: Record<string, string> = {
  NIFTY50:     'NSE_INDEX|Nifty 50',
  BANKNIFTY:   'NSE_INDEX|Nifty Bank',
  FINNIFTY:    'NSE_INDEX|Nifty Fin Service',
  MIDCAPNIFTY: 'NSE_INDEX|Nifty Midcap Select',
  NIFTYNEXT50: 'NSE_INDEX|Nifty Next 50',
  SENSEX:      'BSE_INDEX|SENSEX',
  BANKEX:      'BSE_INDEX|BANKEX',
};

function getISTDate(): { dateStr: string; minuteOfDay: number; isWeekend: boolean } {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const dateStr = ist.toISOString().split('T')[0];
  const minuteOfDay = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const day = ist.getUTCDay();
  return { dateStr, minuteOfDay, isWeekend: day === 0 || day === 6 };
}

function encKey(k: string): string {
  return k.replace(/ /g, '%20').replace(/&/g, '%26');
}

function hdrs(token: string) {
  return { Authorization: 'Bearer ' + token, Accept: 'application/json' };
}

async function getExpiries(instrKey: string, token: string, base: string): Promise<string[]> {
  const res = await fetch(`${base}contract?instrument_key=${encKey(instrKey)}`, { headers: hdrs(token) });
  if (!res.ok) throw new Error(`Upstox expiries HTTP ${res.status}`);
  const json = await res.json();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of json.data || []) {
    if (c.expiry && !seen.has(c.expiry)) { seen.add(c.expiry); out.push(c.expiry); }
  }
  out.sort();
  return out.slice(0, 4);
}

async function fetchChain(instrKey: string, expiry: string, token: string, base: string) {
  const url = `${base}chain?instrument_key=${encKey(instrKey)}&expiry_date=${expiry}`;
  const res = await fetch(url, { headers: hdrs(token) });
  if (!res.ok) throw new Error(`Upstox chain HTTP ${res.status} for ${expiry}`);
  const json = await res.json();

  const strikes: Record<string, any> = {};
  let spot = 0;

  for (const r of json.data || []) {
    if (r.underlying_spot_price) spot = r.underlying_spot_price;
    const k = String(r.strike_price);
    const cm = r.call_options?.market_data || {};
    const pm = r.put_options?.market_data || {};
    const cg = r.call_options?.option_greeks || {};
    const pg = r.put_options?.option_greeks || {};
    strikes[k] = {
      ce_oi: cm.oi || 0, ce_vol: cm.volume || 0, ce_ltp: cm.ltp || 0, ce_iv: cg.iv || 0,
      pe_oi: pm.oi || 0, pe_vol: pm.volume || 0, pe_ltp: pm.ltp || 0, pe_iv: pg.iv || 0,
    };
  }
  return { strikes, spot };
}

function calculateMaxPain(strikes: Record<string, any>): number {
  const list = Object.keys(strikes).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
  let minPain = Infinity, result = list[0] ?? 0;
  for (const test of list) {
    let pain = 0;
    for (const s of list) {
      const d = strikes[s];
      if (test > s) pain += (test - s) * (d.ce_oi ?? 0);
      if (test < s) pain += (s - test) * (d.pe_oi ?? 0);
    }
    if (pain < minPain) { minPain = pain; result = test; }
  }
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const respond = (body: any, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  try {
    const { dateStr, minuteOfDay, isWeekend } = getISTDate();

    if (isWeekend) {
      return respond({ success: true, message: 'Weekend — skipped', results: [] });
    }

    const token = Deno.env.get('UPSTOX_ACCESS_TOKEN');
    const base  = Deno.env.get('UPSTOX_URL');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!token || !base || !supabaseUrl || !serviceKey) {
      return respond({ success: false, error: 'Missing env: UPSTOX_ACCESS_TOKEN / UPSTOX_URL / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, 500);
    }

    // Determine snapshot_type: from body, or auto-detect from IST time
    // 9:30 AM IST = 570 min, 11:15 AM IST = 675 min — anything ≥ 640 is 1115
    let snapshotType = minuteOfDay >= 640 ? 'EXPIRY_1115' : 'EXPIRY_930';
    try {
      const body = await req.json().catch(() => ({}));
      if (body.snapshot_type) snapshotType = body.snapshot_type;
    } catch { /* keep auto-detected value */ }

    const db = createClient(supabaseUrl, serviceKey);
    const results: any[] = [];

    for (const [indexKey, instrKey] of Object.entries(INDEX_MAP)) {
      try {
        const expiries = await getExpiries(instrKey, token, base);

        // Only proceed if today is an expiry day for this index
        const todayExpiry = expiries.find(e => e === dateStr);
        if (!todayExpiry) {
          results.push({ index: indexKey, status: 'skipped', reason: `Not expiry today (next: ${expiries[0] ?? '—'})` });
          continue;
        }

        const { strikes, spot } = await fetchChain(instrKey, todayExpiry, token, base);

        if (Object.keys(strikes).length === 0) {
          results.push({ index: indexKey, status: 'empty', reason: 'No strike data from Upstox' });
          continue;
        }

        const maxPain = calculateMaxPain(strikes);

        const payload = {
          index_name: indexKey,
          expiry_date: todayExpiry,
          snapshot_type: snapshotType,
          spot_price: spot,
          max_pain: maxPain,
          vix: 0,
          strike_data: strikes,
        };

        // Upsert: update if row already exists, insert otherwise
        const { data: existing } = await db
          .from('z2h_snapshots').select('id')
          .eq('index_name', indexKey).eq('expiry_date', todayExpiry)
          .eq('snapshot_type', snapshotType).limit(1);

        if (existing && existing.length > 0) {
          await db.from('z2h_snapshots').update(payload).eq('id', existing[0].id);
        } else {
          await db.from('z2h_snapshots').insert(payload);
        }

        results.push({
          index: indexKey, status: 'saved',
          expiry: todayExpiry, spot, maxPain,
          strikes: Object.keys(strikes).length,
        });
      } catch (err: any) {
        results.push({ index: indexKey, status: 'error', error: err.message });
      }

      // Respect Upstox rate limits
      await new Promise(r => setTimeout(r, 600));
    }

    // Write to capture log
    const saved   = results.filter(r => r.status === 'saved').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const errors  = results.filter(r => r.status === 'error').length;

    try {
      await db.from('z2h_capture_log').insert({
        snapshot_type: snapshotType,
        capture_date: dateStr,
        saved_count: saved,
        skipped_count: skipped,
        error_count: errors,
        details: results,
      });
    } catch { /* non-fatal */ }

    return respond({ success: true, snapshotType, date: dateStr, saved, skipped, errors, results });
  } catch (err: any) {
    return respond({ success: false, error: err.message }, 500);
  }
});
