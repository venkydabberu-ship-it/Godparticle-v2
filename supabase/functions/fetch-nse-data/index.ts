// fetch-nse-data — index option chains via Upstox v2 API
// Secrets required: UPSTOX_ACCESS_TOKEN, UPSTOX_URL (value: https://api.upstox.com/v2/option/)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TYPE_CONFIG = {
  'nifty_chain':       { key: 'NSE_INDEX|Nifty 50',            maxExp: 8 },
  'banknifty_chain':   { key: 'NSE_INDEX|Nifty Bank',          maxExp: 4 },
  'finnifty_chain':    { key: 'NSE_INDEX|Nifty Fin Service',   maxExp: 4 },
  'midcapnifty_chain': { key: 'NSE_INDEX|Nifty Midcap Select', maxExp: 4 },
  'niftynext50_chain': { key: 'NSE_INDEX|Nifty Next 50',       maxExp: 4 },
  'sensex_chain':      { key: 'BSE_INDEX|SENSEX',              maxExp: 8 },
  'bankex_chain':      { key: 'BSE_INDEX|BANKEX',              maxExp: 4 },
};

function hdrs(token) {
  return { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' };
}

// Only encode characters that break query strings: space and &
function encKey(k) {
  return k.split(' ').join('%20').split('&').join('%26');
}

async function getExpiries(instrKey, token, maxExp, base) {
  var url = base + 'contract?instrument_key=' + encKey(instrKey);
  var res = await fetch(url, { headers: hdrs(token) });
  if (!res.ok) throw new Error('Upstox expiries HTTP ' + res.status);
  var json = await res.json();
  var seen = new Set();
  var expiries = [];
  (json.data || []).forEach(function(c) {
    if (c.expiry && !seen.has(c.expiry)) { seen.add(c.expiry); expiries.push(c.expiry); }
  });
  expiries.sort();
  return expiries.slice(0, maxExp);
}

async function getChain(instrKey, expiry, token, base) {
  var url = base + 'chain?instrument_key=' + encKey(instrKey) + '&expiry_date=' + expiry;
  var res = await fetch(url, { headers: hdrs(token) });
  if (!res.ok) throw new Error('Upstox chain HTTP ' + res.status + ' for ' + expiry);
  var json = await res.json();
  var strikes = {};
  var spot = 0;
  (json.data || []).forEach(function(r) {
    if (r.underlying_spot_price) spot = r.underlying_spot_price;
    var k = String(r.strike_price);
    var cm = (r.call_options && r.call_options.market_data) || {};
    var cg = (r.call_options && r.call_options.option_greeks) || {};
    var pm = (r.put_options && r.put_options.market_data) || {};
    var pg = (r.put_options && r.put_options.option_greeks) || {};
    strikes[k] = {
      ce_oi:  cm.oi   || 0,
      ce_coi: (cm.oi || 0) - (cm.prev_oi || 0),
      ce_vol: cm.volume || 0,
      ce_ltp: cm.ltp  || 0,
      ce_iv:  cg.iv   || 0,
      pe_oi:  pm.oi   || 0,
      pe_coi: (pm.oi || 0) - (pm.prev_oi || 0),
      pe_vol: pm.volume || 0,
      pe_ltp: pm.ltp  || 0,
      pe_iv:  pg.iv   || 0,
    };
  });
  return { expiry: expiry, strikes: strikes, spotPrice: spot };
}

Deno.serve(async function(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  var respond = function(body, status) {
    return new Response(JSON.stringify(body), {
      status: status || 200,
      headers: Object.assign({}, CORS, { 'Content-Type': 'application/json' }),
    });
  };

  try {
    var token = Deno.env.get('UPSTOX_ACCESS_TOKEN');
    var base = Deno.env.get('UPSTOX_URL');
    if (!token) return respond({ success: false, error: 'UPSTOX_ACCESS_TOKEN not set' }, 500);
    if (!base)  return respond({ success: false, error: 'UPSTOX_URL not set' }, 500);

    var body = await req.json();
    var type = body.type;
    if (!type) return respond({ success: false, error: 'Missing type' }, 400);

    if (type === 'get_expiries') {
      return respond({ success: true, data: { trade_date: new Date().toISOString().split('T')[0] } });
    }

    var config = TYPE_CONFIG[type];
    if (!config) return respond({ success: false, error: 'Unknown type: ' + type }, 400);

    var expiries = await getExpiries(config.key, token, config.maxExp, base);
    if (!expiries.length) return respond({ success: false, error: 'No expiries for ' + type }, 500);

    var chains = await Promise.all(expiries.map(function(exp) {
      return getChain(config.key, exp, token, base).catch(function(err) {
        return { expiry: exp, strikes: {}, spotPrice: 0, error: err.message };
      });
    }));

    return respond({ success: true, data: chains });
  } catch (err) {
    return respond({ success: false, error: err.message }, 500);
  }
});
