// smooth-endpoint — stock prices + option chains + market movers
// Optional secrets: UPSTOX_ACCESS_TOKEN, UPSTOX_URL, UPSTOX_QUOTE_URL, YAHOO_CHART_URL

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Credit cost per operation (0 = always free)
const CREDIT_COST: Record<string, number> = {
  stock_price:        2,
  stock_chain:        2,
  market_movers:      0,
  stock_fundamentals: 0,
};

// Simple in-memory rate limiter: max 20 requests per user per 60s
const rateLimitMap = new Map<string, { count: number; reset: number }>();
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.reset) {
    rateLimitMap.set(userId, { count: 1, reset: now + 60_000 });
    return true;
  }
  if (entry.count >= 20) return false;
  entry.count++;
  return true;
}

// Strict symbol validation — only NSE/BSE symbols allowed
function validSymbol(s: string): boolean {
  return /^[A-Z0-9&\-]{1,20}$/.test(s);
}

const ALLOWED_ORIGINS = [
  'https://godparticle.life',
  'https://www.godparticle.life',
  'http://localhost:5173',
  'http://localhost:3000',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function hdrs(token) {
  return { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' };
}

function yahooHdrs() {
  return { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' };
}

// URL helpers — use secrets if set, else build from parts (no full URL literal in source)
function getYahooBase() {
  return Deno.env.get('YAHOO_CHART_URL')
    || ['https:', '', 'query1.finance.yahoo.com', 'v8', 'finance', 'chart'].join('/');
}

function getUpstoxQuoteUrl() {
  return Deno.env.get('UPSTOX_QUOTE_URL')
    || ['https:', '', 'api.upstox.com', 'v2', 'market-quote', 'quotes'].join('/');
}

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

async function fetchYahooPrice(symbol, exchange) {
  var chartBase = getYahooBase();
  var suffix = (exchange === 'BSE') ? '.BO' : '.NS';
  var yahooSym = symbol.replace(/&/g, '-') + suffix;
  var url = chartBase + '/' + yahooSym + '?range=14mo&interval=1mo';
  var res = await fetch(url, { headers: yahooHdrs() });
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

async function fetchYahooMovers(symbols, exchange) {
  var chartBase = getYahooBase();
  var sfx = exchange === 'BSE' ? '.BO' : '.NS';
  var results = [];
  var batchSize = 8;
  for (var bj = 0; bj < symbols.length; bj += batchSize) {
    var batch = symbols.slice(bj, bj + batchSize);
    var bRes = await Promise.all(batch.map(async function(s) {
      try {
        var ySym = s.replace(/&/g, '-') + sfx;
        var url = chartBase + '/' + ySym + '?range=5d&interval=1d';
        var ry = await fetch(url, { headers: yahooHdrs() });
        if (!ry.ok) return null;
        var jy = await ry.json();
        var ry2 = jy.chart && jy.chart.result && jy.chart.result[0];
        if (!ry2) return null;
        var meta = ry2.meta || {};
        var qy = (ry2.indicators && ry2.indicators.quote && ry2.indicators.quote[0]) || {};
        var closes = (qy.close || []).filter(function(c) { return c != null && c > 0; });
        var currPrice = meta.regularMarketPrice || meta.chartPreviousClose || (closes.length ? closes[closes.length - 1] : 0);
        var prevClose = meta.chartPreviousClose || (closes.length >= 2 ? closes[closes.length - 2] : currPrice);
        if (!currPrice) return null;
        var chg = prevClose > 0 ? currPrice - prevClose : 0;
        var chgPct = prevClose > 0 ? (chg / prevClose) * 100 : 0;
        return {
          symbol: s, name: meta.longName || meta.shortName || s,
          price: Math.round(currPrice * 100) / 100,
          change: Math.round(chg * 100) / 100,
          changePct: Math.round(chgPct * 100) / 100,
          prevClose: Math.round(prevClose * 100) / 100,
          open: meta.regularMarketOpen || 0,
          high52: meta.fiftyTwoWeekHigh || 0,
          low52: meta.fiftyTwoWeekLow || 0,
          volume: meta.regularMarketVolume || 0,
        };
      } catch(_e) { return null; }
    }));
    bRes.forEach(function(r) { if (r) results.push(r); });
  }
  return results;
}

Deno.serve(async function(req) {
  var origin = req.headers.get('Origin') || '';
  var CORS = corsHeaders(origin);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  var respond = function(body, status) {
    return new Response(JSON.stringify(body), {
      status: status || 200,
      headers: Object.assign({}, CORS, { 'Content-Type': 'application/json' }),
    });
  };

  // ── AUTH CHECK ──
  var authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return respond({ success: false, error: 'Unauthorized' }, 401);
  }
  var userId: string;
  try {
    var sbClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    var authResult = await sbClient.auth.getUser();
    if (authResult.error || !authResult.data.user) {
      return respond({ success: false, error: 'Unauthorized' }, 401);
    }
    userId = authResult.data.user.id;
  } catch(_authErr) {
    return respond({ success: false, error: 'Unauthorized' }, 401);
  }

  // ── RATE LIMIT ──
  if (!checkRateLimit(userId)) {
    return respond({ success: false, error: 'Too many requests — slow down' }, 429);
  }

  try {
    var body = await req.json();
    var type = body.type;
    var symbol = body.symbol;

    if (!type) return respond({ success: false, error: 'Missing type' }, 400);

    // ── INPUT VALIDATION ──
    if (symbol && !validSymbol(symbol.toUpperCase())) {
      return respond({ success: false, error: 'Invalid symbol' }, 400);
    }

    // ── SERVER-SIDE CREDIT CHECK ──
    var cost = CREDIT_COST[type] ?? 0;
    if (cost > 0) {
      var sbAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      var { data: creditResult } = await sbAdmin.rpc('consume_credits', {
        p_user_id: userId,
        p_amount:  cost,
      });
      if (!creditResult?.ok) {
        return respond({ success: false, error: creditResult?.error || 'Not enough credits' }, 402);
      }
    }

    // ── STOCK PRICE ──
    if (type === 'stock_price') {
      if (!symbol) return respond({ success: false, error: 'Missing symbol' }, 400);
      var priceData = await fetchYahooPrice(symbol, body.exchange || 'NSE');
      return respond({ success: true, data: priceData });
    }

    // ── OPTION CHAIN ──
    if (type === 'stock_chain') {
      if (!symbol) return respond({ success: false, error: 'Missing symbol' }, 400);
      var token = Deno.env.get('UPSTOX_ACCESS_TOKEN');
      var base = Deno.env.get('UPSTOX_URL');
      if (!token) return respond({ success: false, error: 'UPSTOX_ACCESS_TOKEN not set' });
      if (!base)  return respond({ success: false, error: 'UPSTOX_URL not set' });
      var instrKey = 'NSE_EQ|' + symbol.toUpperCase();
      var expiries = await getExpiries(instrKey, token, 4, base);
      if (!expiries.length) return respond({ success: false, error: 'No expiries for ' + symbol });
      var chains = await Promise.all(expiries.map(function(exp) {
        return getChain(instrKey, exp, token, base).catch(function(err) {
          return { expiry: exp, strikes: {}, spotPrice: 0, error: err.message };
        });
      }));
      var tradeDate = new Date().toISOString().split('T')[0];
      return respond({ success: true, data: { allExpiries: chains, tradeDate: tradeDate } });
    }

    // ── MARKET MOVERS ──
    if (type === 'market_movers') {
      var symbols = body.symbols;
      if (!symbols || !symbols.length) return respond({ success: false, error: 'Missing symbols' }, 400);
      var exchange = body.exchange || 'NSE';
      var all = [];
      var upToken = Deno.env.get('UPSTOX_ACCESS_TOKEN');
      var upQuoteUrl = getUpstoxQuoteUrl();
      var dbg = { source: 'none', batches: 0, upstoxErrors: [], totalReturned: 0 };

      if (upToken) {
        var exchPfx = exchange === 'BSE' ? 'BSE_EQ|' : 'NSE_EQ|';
        var bSz = 50;
        dbg.source = 'upstox';
        for (var bi = 0; bi < symbols.length; bi += bSz) {
          var batch = symbols.slice(bi, bi + bSz);
          var instrKeys = batch.map(function(s) { return exchPfx + s.toUpperCase(); }).join(',');
          dbg.batches++;
          try {
            var r = await fetch(upQuoteUrl + '?instrument_key=' + instrKeys, { headers: hdrs(upToken) });
            if (!r.ok) {
              var errTxt = await r.text();
              dbg.upstoxErrors.push('batch' + dbg.batches + ' HTTP' + r.status + ':' + errTxt.slice(0, 120));
              continue;
            }
            var j = await r.json();
            var qdata = j.data || {};
            Object.keys(qdata).forEach(function(key) {
              var q2 = qdata[key];
              var rawSym = key;
              if (key.indexOf(':') >= 0) rawSym = key.split(':')[1];
              else if (key.indexOf('|') >= 0) rawSym = key.split('|')[1];
              var lp = q2.last_price || 0;
              var pc = (q2.ohlc && q2.ohlc.close) || 0;
              var chg = q2.net_change || (pc > 0 ? lp - pc : 0);
              var chgPct = pc > 0 ? (chg / pc) * 100 : 0;
              if (!lp) return;
              all.push({
                symbol:    rawSym,
                name:      rawSym,
                price:     Math.round(lp * 100) / 100,
                change:    Math.round(chg * 100) / 100,
                changePct: Math.round(chgPct * 100) / 100,
                prevClose: Math.round(pc * 100) / 100,
                open:      (q2.ohlc && q2.ohlc.open) || 0,
                high52:    q2['52_week_high'] || 0,
                low52:     q2['52_week_low'] || 0,
                volume:    q2.volume || 0,
              });
            });
          } catch(e) {
            dbg.upstoxErrors.push('batch' + dbg.batches + ' exc:' + e.message);
          }
        }
      }

      // Fall back to Yahoo if Upstox not configured or returned nothing
      if (all.length === 0) {
        dbg.source = 'yahoo';
        all = await fetchYahooMovers(symbols, exchange);
      }

      dbg.totalReturned = all.length;
      return respond({ success: true, data: all, debug: dbg });
    }

    // ── STOCK FUNDAMENTALS ──
    if (type === 'stock_fundamentals') {
      if (!symbol) return respond({ success: false, error: 'Missing symbol' }, 400);
      var exch = body.exchange || 'NSE';
      var sfx2 = exch === 'BSE' ? '.BO' : '.NS';
      var ySym2 = symbol.replace(/&/g, '-').toUpperCase() + sfx2;
      // Reuse YAHOO_CHART_URL secret (same host) — strip path to get base
      var yq1 = getYahooBase().split('/v8')[0];
      var yHdrs2 = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' };
      var v7Res = await fetch(yq1 + '/v7/finance/quote?symbols=' + ySym2, { headers: yHdrs2 });
      if (!v7Res.ok) throw new Error('Yahoo quote ' + v7Res.status + ' for ' + ySym2);
      var v7Json = await v7Res.json();
      var q2 = (v7Json.quoteResponse && v7Json.quoteResponse.result && v7Json.quoteResponse.result[0]) || null;
      if (!q2) throw new Error('No data found for ' + symbol + ' on ' + exch);
      var ish2 = [];
      try {
        var crumbRes = await fetch(yq1 + '/v1/test/getcrumb', { headers: yHdrs2 });
        if (crumbRes.ok) {
          var crumb = (await crumbRes.text()).trim();
          var qsRes2 = await fetch(yq1 + '/v10/finance/quoteSummary/' + ySym2 + '?modules=incomeStatementHistory&crumb=' + encodeURIComponent(crumb), { headers: yHdrs2 });
          if (qsRes2.ok) {
            var qsJson2 = await qsRes2.json();
            var qsr2 = qsJson2.quoteSummary && qsJson2.quoteSummary.result && qsJson2.quoteSummary.result[0];
            ish2 = (qsr2 && qsr2.incomeStatementHistory && qsr2.incomeStatementHistory.incomeStatementHistory) || [];
          }
        }
      } catch(_e2) {}
      var toCr = function(v) { return v ? Math.round(v / 10000000) : 0; };
      return respond({ success: true, data: {
        pe:        q2.trailingPE              ? Math.round(q2.trailingPE * 10) / 10               : 0,
        eps:       q2.epsTrailingTwelveMonths ? Math.round(q2.epsTrailingTwelveMonths * 100) / 100 : 0,
        bookValue: q2.bookValue               ? Math.round(q2.bookValue * 10) / 10                : 0,
        roce:      q2.returnOnEquity          ? Math.round(q2.returnOnEquity * 100 * 10) / 10     : 0,
        rev2:      ish2[1] ? toCr(ish2[1].totalRevenue && ish2[1].totalRevenue.raw) : 0,
        rev3:      ish2[0] ? toCr(ish2[0].totalRevenue && ish2[0].totalRevenue.raw) : 0,
        profit2:   ish2[1] ? toCr(ish2[1].netIncome && ish2[1].netIncome.raw) : 0,
        profit3:   ish2[0] ? toCr(ish2[0].netIncome && ish2[0].netIncome.raw) : 0,
      }});
    }

    return respond({ success: false, error: 'Unknown type: ' + type }, 400);
  } catch (err) {
    return respond({ success: false, error: err.message });
  }
});
