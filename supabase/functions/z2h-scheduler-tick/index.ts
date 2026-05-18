// z2h-scheduler-tick — runs every 5 minutes via pg_cron
// Checks z2h_schedule for pending jobs due now, executes them, marks done
// Env required: UPSTOX_ACCESS_TOKEN, UPSTOX_URL (SUPABASE_URL + SERVICE_ROLE_KEY auto-provided)

import { createClient } from 'npm:@supabase/supabase-js@2';

const INDEX_MAP = {
  NIFTY50:     'NSE_INDEX|Nifty 50',
  BANKNIFTY:   'NSE_INDEX|Nifty Bank',
  FINNIFTY:    'NSE_INDEX|Nifty Fin Service',
  MIDCAPNIFTY: 'NSE_INDEX|Nifty Midcap Select',
  NIFTYNEXT50: 'NSE_INDEX|Nifty Next 50',
  SENSEX:      'BSE_INDEX|SENSEX',
  BANKEX:      'BSE_INDEX|BANKEX',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function getISTNow() {
  var now = new Date();
  var ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  var dateStr = ist.toISOString().split('T')[0];
  var hh = String(ist.getUTCHours()).padStart(2, '0');
  var mm = String(ist.getUTCMinutes()).padStart(2, '0');
  return { dateStr: dateStr, timeStr: hh + ':' + mm };
}

function encKey(k) {
  return k.replace(/ /g, '%20').replace(/&/g, '%26');
}

function hdrs(token) {
  return { Authorization: 'Bearer ' + token, Accept: 'application/json' };
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

  var sbUrl      = Deno.env.get('SUPABASE_URL');
  var serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  var token      = Deno.env.get('UPSTOX_ACCESS_TOKEN');
  var base       = Deno.env.get('UPSTOX_URL');

  if (!sbUrl || !serviceKey || !token || !base) {
    return respond({ success: false, error: 'Missing env vars' }, 500);
  }

  var ist = getISTNow();
  var db = createClient(sbUrl, serviceKey);

  // Find pending jobs due at or before current IST time today
  var { data: jobs, error: fetchErr } = await db
    .from('z2h_schedule')
    .select('*')
    .eq('capture_date', ist.dateStr)
    .eq('status', 'pending')
    .lte('capture_time', ist.timeStr);

  if (fetchErr) return respond({ success: false, error: fetchErr.message }, 500);
  if (!jobs || jobs.length === 0) {
    return respond({ success: true, message: 'No pending jobs', checkedAt: ist.timeStr });
  }

  var allResults = [];

  for (var job of jobs) {
    // Claim the job atomically — skip if already claimed by a concurrent run
    var { data: claimed } = await db
      .from('z2h_schedule')
      .update({ status: 'running' })
      .eq('id', job.id)
      .eq('status', 'pending')
      .select('id');

    if (!claimed || claimed.length === 0) continue;

    var indices = job.index_name === 'ALL' ? Object.keys(INDEX_MAP) : [job.index_name];
    var jobResults = [];

    for (var indexKey of indices) {
      var instrKey = INDEX_MAP[indexKey];
      if (!instrKey) { jobResults.push({ index: indexKey, status: 'error', error: 'Unknown index' }); continue; }

      try {
        var chain = await fetchChain(instrKey, job.expiry_date, token, base);

        if (Object.keys(chain.strikes).length === 0) {
          jobResults.push({ index: indexKey, status: 'empty', reason: 'No strike data from Upstox' });
          continue;
        }

        var maxPain = calculateMaxPain(chain.strikes);
        var payload = {
          index_name:    indexKey,
          expiry_date:   job.expiry_date,
          snapshot_type: job.snapshot_type,
          spot_price:    chain.spot,
          max_pain:      maxPain,
          vix:           0,
          strike_data:   chain.strikes,
        };

        var existing = await db.from('z2h_snapshots').select('id')
          .eq('index_name', indexKey)
          .eq('expiry_date', job.expiry_date)
          .eq('snapshot_type', job.snapshot_type)
          .limit(1);

        if (existing.data && existing.data.length > 0) {
          await db.from('z2h_snapshots').update(payload).eq('id', existing.data[0].id);
        } else {
          await db.from('z2h_snapshots').insert(payload);
        }

        jobResults.push({ index: indexKey, status: 'saved', spot: chain.spot, maxPain: maxPain, strikes: Object.keys(chain.strikes).length });
      } catch (err) {
        jobResults.push({ index: indexKey, status: 'error', error: err.message });
      }
      await new Promise(function(r) { setTimeout(r, 600); });
    }

    var hasErrors = jobResults.some(function(r) { return r.status === 'error'; });
    var finalStatus = hasErrors ? 'partial' : 'done';

    await db.from('z2h_schedule').update({
      status:      finalStatus,
      result:      jobResults,
      executed_at: new Date().toISOString(),
    }).eq('id', job.id);

    allResults.push({ jobId: job.id, index: job.index_name, snapshot: job.snapshot_type, status: finalStatus, results: jobResults });
  }

  return respond({ success: true, processed: allResults.length, results: allResults });
});
