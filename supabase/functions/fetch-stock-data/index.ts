// smooth-endpoint — stock prices (Yahoo Finance) + stock option chains (Upstox v2)
// Secrets required: UPSTOX_ACCESS_TOKEN, UPSTOX_URL (for stock_chain only)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

async function fetchYahooPrice(symbol) {
  var yahooSym = symbol.replace(/&/g, '-') + '.NS';
  var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + yahooSym + '?range=14mo&interval=1mo';
  var res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error('Yahoo ' + res.status + ' for ' + yahooSym);
  var json = await res.json();
  var result = json.chart && json.chart.result && json.chart.result[0];
  if (!result) throw new Error('No Yahoo data for ' + yahooSym);

  var meta = result.meta || {};
  var timestamps = result.timestamp || [];
  var q = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
  var w52h = String(meta.fiftyTwoWeekHigh || 0);
  var w52l = String(meta.fiftyTwoWeekLow || 0);

  var data = timestamps.map(function(ts, i) {
    var d = new Date(ts * 1000);
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return {
      CH_TIMESTAMP:        yyyy + '-' + mm + '-' + dd,
      CH_OPENING_PRICE:    String((q.open   && q.open[i])   || 0),
      CH_TRADE_HIGH_PRICE: String((q.high   && q.high[i])   || 0),
      CH_TRADE_LOW_PRICE:  String((q.low    && q.low[i])    || 0),
      CH_CLOSING_PRICE:    String((q.close  && q.close[i])  || 0),
      CH_TOT_TRADED_QTY:   String((q.volume && q.volume[i]) || 0),
      CH_52WEEK_HIGH_PRICE: w52h,
      CH_52WEEK_LOW_PRICE:  w52l,
    };
  }).filter(function(r) { return parseFloat(r.CH_CLOSING_PRICE) > 0; });

  return { data: data };
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
    var body = await req.json();
    var type = body.type;
    var symbol = body.symbol;

    if (!type) return respond({ success: false, error: 'Missing type' }, 400);

    // ── STOCK PRICE: Yahoo Finance (fast, no auth needed) ──
    if (type === 'stock_price') {
      if (!symbol) return respond({ success: false, error: 'Missing symbol' }, 400);
      var priceData = await fetchYahooPrice(symbol);
      return respond({ success: true, data: priceData });
    }

    // ── STOCK OPTION CHAIN: Upstox v2 ──
    if (type === 'stock_chain') {
      if (!symbol) return respond({ success: false, error: 'Missing symbol' }, 400);
      var token = Deno.env.get('UPSTOX_ACCESS_TOKEN');
      var base = Deno.env.get('UPSTOX_URL');
      if (!token) return respond({ success: false, error: 'UPSTOX_ACCESS_TOKEN not set' }, 500);
      if (!base)  return respond({ success: false, error: 'UPSTOX_URL not set' }, 500);
      var instrKey = 'NSE_EQ|' + symbol.toUpperCase();
      var expiries = await getExpiries(instrKey, token, 4, base);
      if (!expiries.length) return respond({ success: false, error: 'No expiries for ' + symbol }, 500);
      var chains = await Promise.all(expiries.map(function(exp) {
        return getChain(instrKey, exp, token, base).catch(function(err) {
          return { expiry: exp, strikes: {}, spotPrice: 0, error: err.message };
        });
      }));
      var tradeDate = new Date().toISOString().split('T')[0];
      return respond({ success: true, data: { allExpiries: chains, tradeDate: tradeDate } });
    }

    return respond({ success: false, error: 'Unknown type: ' + type }, 400);
  } catch (err) {
    return respond({ success: false, error: err.message }, 500);
  }
});
