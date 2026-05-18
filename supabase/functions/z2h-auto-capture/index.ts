// z2h-auto-capture — Scheduled capture of Z2H option chain snapshots
// Triggered by pg_cron at 9:30 AM IST (4:00 AM UTC) and 11:15 AM IST (5:45 AM UTC) every weekday
// Secrets required: UPSTOX_ACCESS_TOKEN, UPSTOX_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const INDEX_MAP = {
  NIFTY50:     'NSE_INDEX|Nifty 50',
  BANKNIFTY:   'NSE_INDEX|Nifty Bank',
  FINNIFTY:    'NSE_INDEX|Nifty Fin Service',
  MIDCAPNIFTY: 'NSE_INDEX|Nifty Midcap Select',
  NIFTYNEXT50: 'NSE_INDEX|Nifty Next 50',
  SENSEX:      'BSE_INDEX|SENSEX',
  BANKEX:      'BSE_INDEX|BANKEX',
};

function getISTDate() {
  var now = new Date();
  var ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  var dateStr = ist.toISOString().split('T')[0];
  var minuteOfDay = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  var day = ist.getUTCDay();
  return { dateStr: dateStr, minuteOfDay: minuteOfDay, isWeekend: day === 0 || day === 6 };
}

function encKey(k) {
  return k.replace(/ /g, '%20').replace(/&/g, '%26');
}

function hdrs(token) {
  return { Authorization: 'Bearer ' + token, Accept: 'application/json' };
}

async function getExpiries(instrKey, token, base) {
  var res = await fetch(base + 'contract?instrument_key=' + encKey(instrKey), { headers: hdrs(token) });
  if (!res.ok) throw new Error('Upstox expiries HTTP ' + res.status);
  var json = await res.json();
  var seen = new Set();
  var out = [];
  for (var c of (json.data || [])) {
    if (c.expiry && !seen.has(c.expiry)) { seen.add(c.expiry); out.push(c.expiry); }
  }
  out.sort();
  return out.slice(0, 4);
}

async function fetchChain(instrKey, expiry, token, base) {
  var url = base + 'chain?instrument_key=' + encKey(instrKey) + '&expiry_date=' + expiry;
  var res = await fetch(url, { headers: hdrs(token) });
  if (!res.ok) throw new Error('Upstox chain HTTP ' + res.status + ' for ' + expiry);
  var json = await res.json();
  var strikes = {};
  var spot = 0;
  for (var r of (json.data || [])) {
    if (r.underlying_spot_price) spot = r.underlying_spot_price;
    var k = String(r.strike_price);
    var cm = (r.call_options && r.call_options.market_data) || {};
    var pm = (r.put_options  && r.put_options.market_data)  || {};
    var cg = (r.call_options && r.call_options.option_greeks) || {};
    var pg = (r.put_options  && r.put_options.option_greeks)  || {};
    strikes[k] = {
      ce_oi: cm.oi || 0, ce_vol: cm.volume || 0, ce_ltp: cm.ltp || 0, ce_iv: cg.iv || 0,
      pe_oi: pm.oi || 0, pe_vol: pm.volume || 0, pe_ltp: pm.ltp || 0, pe_iv: pg.iv || 0,
    };
  }
  return { strikes: strikes, spot: spot };
}

function calculateMaxPain(strikes) {
  var list = Object.keys(strikes).map(Number).filter(function(n) { return !isNaN(n); }).sort(function(a, b) { return a - b; });
  var minPain = Infinity, result = list[0] || 0;
  for (var i = 0; i < list.length; i++) {
    var test = list[i], pain = 0;
    for (var j = 0; j < list.length; j++) {
      var s = list[j], d = strikes[s];
      if (test > s) pain += (test - s) * (d.ce_oi || 0);
      if (test < s) pain += (s - test) * (d.pe_oi || 0);
    }
    if (pain < minPain) { minPain = pain; result = test; }
  }
  return result;
}

Deno.serve(async function(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  function respond(body, status) {
    return new Response(JSON.stringify(body), {
      status: status || 200,
      headers: Object.assign({}, CORS, { 'Content-Type': 'application/json' }),
    });
  }

  try {
    var ist = getISTDate();

    if (ist.isWeekend) {
      return respond({ success: true, message: 'Weekend — skipped', results: [] });
    }

    var token      = Deno.env.get('UPSTOX_ACCESS_TOKEN');
    var base       = Deno.env.get('UPSTOX_URL');
    var sbUrl      = Deno.env.get('SUPABASE_URL');
    var serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!token || !base || !sbUrl || !serviceKey) {
      return respond({ success: false, error: 'Missing env: UPSTOX_ACCESS_TOKEN / UPSTOX_URL / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, 500);
    }

    // snapshot_type from body, or auto-detect from IST time (>=640 min = 11:15 AM)
    var snapshotType = ist.minuteOfDay >= 640 ? 'EXPIRY_1115' : 'EXPIRY_930';
    try {
      var body = await req.json();
      if (body && body.snapshot_type) snapshotType = body.snapshot_type;
    } catch (e) { /* keep auto-detected */ }

    var db = createClient(sbUrl, serviceKey);
    var results = [];

    for (var indexKey of Object.keys(INDEX_MAP)) {
      try {
        var instrKey = INDEX_MAP[indexKey];
        var expiries = await getExpiries(instrKey, token, base);
        var todayExpiry = expiries.find(function(e) { return e === ist.dateStr; });

        if (!todayExpiry) {
          results.push({ index: indexKey, status: 'skipped', reason: 'Not expiry today (next: ' + (expiries[0] || '—') + ')' });
          continue;
        }

        var chain = await fetchChain(instrKey, todayExpiry, token, base);

        if (Object.keys(chain.strikes).length === 0) {
          results.push({ index: indexKey, status: 'empty', reason: 'No strike data from Upstox' });
          continue;
        }

        var maxPain = calculateMaxPain(chain.strikes);
        var payload = {
          index_name:    indexKey,
          expiry_date:   todayExpiry,
          snapshot_type: snapshotType,
          spot_price:    chain.spot,
          max_pain:      maxPain,
          vix:           0,
          strike_data:   chain.strikes,
        };

        var existing = await db.from('z2h_snapshots').select('id')
          .eq('index_name', indexKey).eq('expiry_date', todayExpiry)
          .eq('snapshot_type', snapshotType).limit(1);

        if (existing.data && existing.data.length > 0) {
          await db.from('z2h_snapshots').update(payload).eq('id', existing.data[0].id);
        } else {
          await db.from('z2h_snapshots').insert(payload);
        }

        results.push({ index: indexKey, status: 'saved', expiry: todayExpiry, spot: chain.spot, maxPain: maxPain, strikes: Object.keys(chain.strikes).length });
      } catch (err) {
        results.push({ index: indexKey, status: 'error', error: err.message });
      }
      await new Promise(function(r) { setTimeout(r, 600); });
    }

    var saved   = results.filter(function(r) { return r.status === 'saved';   }).length;
    var skipped = results.filter(function(r) { return r.status === 'skipped'; }).length;
    var errors  = results.filter(function(r) { return r.status === 'error';   }).length;

    try {
      await db.from('z2h_capture_log').insert({
        snapshot_type: snapshotType,
        capture_date:  ist.dateStr,
        saved_count:   saved,
        skipped_count: skipped,
        error_count:   errors,
        details:       results,
      });
    } catch (e) { /* non-fatal */ }

    return respond({ success: true, snapshotType: snapshotType, date: ist.dateStr, saved: saved, skipped: skipped, errors: errors, results: results });
  } catch (err) {
    return respond({ success: false, error: err.message }, 500);
  }
});
