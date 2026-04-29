import { supabase } from './supabase';
import { INDEX_CONFIG, calculateMaxPain, SnapshotType } from './z2h';

// Backoff delays in ms: 3s, 8s, 20s, 45s, 90s
const BACKOFF = [3000, 8000, 20000, 45000, 90000];
// Fast-fail backoff for stock options (don't hang forever if Upstox token expired)
const STOCK_OPT_RETRIES = 2;

// Batch processing to avoid NSE rate-limiting
const BATCH_SIZE = 5;   // stocks per batch
const BATCH_PAUSE = 10000; // ms pause between batches

// ── CALL EDGE FUNCTION (with aggressive retry + backoff) ──
// stock_price and stock_chain route to fetch-stock-data; everything else to fetch-nse-data
async function callEdge(type: string, symbol?: string, expiry?: string, retries = 5) {
  if (!type) throw new Error('callEdge: type is required (got undefined — check index edgeType config)');
  const fnName = (type === 'stock_price' || type === 'stock_chain')
    ? 'smooth-endpoint'
    : 'fetch-nse-data';

  let lastError: Error = new Error('Unknown error');
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, BACKOFF[attempt - 1] ?? 90000));
    try {
      const { data, error } = await supabase.functions.invoke(fnName, {
        body: { type, symbol, expiry }
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Fetch failed');
      return data.data;
    } catch (err: any) {
      lastError = err;
    }
  }
  throw lastError;
}

// ── SAVE MARKET DATA ──
async function saveMarketData(
  indexName: string,
  expiry: string,
  tradeDate: string,
  strikeData: Record<string, any>,
  category: string = 'index'
) {
  try {
    // Skip if no strike data (holiday / market closed)
    if (!strikeData || Object.keys(strikeData).length === 0) {
      return { status: 'empty' };
    }

    const { data: existing } = await supabase
      .from('market_data')
      .select('id')
      .eq('index_name', indexName)
      .eq('expiry', expiry)
      .eq('trade_date', tradeDate)
      .limit(1);

    if (existing && existing.length > 0) return { status: 'duplicate' };

    const { error: insertErr } = await supabase.from('market_data').insert({
      index_name: indexName,
      expiry,
      trade_date: tradeDate,
      strike_data: strikeData,
      uploaded_by: 'auto-fetch',
      timeframe: 'daily',
      category
    });

    if (insertErr) return { status: 'error', error: insertErr.message };
    return { status: 'saved' };
  } catch (err: any) {
    return { status: 'error', error: err.message };
  }
}

// ── SAVE Z2H SNAPSHOT ──
async function saveZ2HSnapshot(
  indexName: string,
  expiry: string,
  snapshotType: string,
  spotPrice: number,
  maxPain: number,
  vix: number,
  strikeData?: Record<string, any>
) {
  try {
    const payload: any = {
      index_name: indexName,
      expiry_date: expiry,
      snapshot_type: snapshotType,
      spot_price: spotPrice,
      max_pain: maxPain,
      vix,
    };
    if (strikeData) payload.strike_data = strikeData;

    const { data: existing } = await supabase
      .from('z2h_snapshots').select('id')
      .eq('index_name', indexName).eq('expiry_date', expiry)
      .eq('snapshot_type', snapshotType).limit(1);

    if (existing && existing.length > 0) {
      await supabase.from('z2h_snapshots').update(payload).eq('id', existing[0].id);
    } else {
      await supabase.from('z2h_snapshots').insert(payload);
    }
  } catch {}
}

// ── PROCESS ONE INDEX ──
async function processIndex(
  indexKey: string,
  indexName: string,
  edgeType: string,
  tradeDate: string,
  results: any[],
  isZ2H: boolean = false
) {
  try {
    const expiryData = await callEdge(edgeType);

    if (!expiryData || !Array.isArray(expiryData)) {
      results.push({ index: indexKey, status: 'error', error: 'No data returned' });
      return;
    }

    for (const item of expiryData) {
      if (!item.expiry) continue;

      const strikeCount = Object.keys(item.strikes || {}).length;

      if (strikeCount === 0) {
        results.push({
          index: indexKey,
          expiry: item.expiry,
          status: 'empty',
          error: item.error || 'Market closed / holiday'
        });
        continue;
      }

      if (item.spotPrice > 0) {
        item.strikes['_spot_close'] = item.spotPrice;
      }

      const result = await saveMarketData(
        indexKey, item.expiry, tradeDate, item.strikes
      );

      results.push({
        index: indexKey,
        expiry: item.expiry,
        status: result.status,
        strikes: strikeCount
      });

      // Z2H snapshot for ALL indices — save DAY_BEFORE (prev day) or EXPIRY_EOD (expiry day close)
      // Always attempt even if market_data was already a duplicate (different table, always upsert)
      if (isZ2H && strikeCount > 0) {
        const maxPain = calculateMaxPain(item.strikes);
        // Compare as strings (YYYY-MM-DD) to avoid timezone off-by-one
        const prevDay = new Date(item.expiry + 'T12:00:00'); // noon avoids DST edge cases
        prevDay.setDate(prevDay.getDate() - 1);
        const prevDayStr = prevDay.toISOString().split('T')[0];
        const isExpiryDay = item.expiry === tradeDate;
        const isDayBefore = prevDayStr === tradeDate;

        if (isExpiryDay) {
          await saveZ2HSnapshot(indexKey, item.expiry, 'EXPIRY_EOD', item.spotPrice || 0, maxPain, 0, item.strikes);
        } else if (isDayBefore) {
          await saveZ2HSnapshot(indexKey, item.expiry, 'DAY_BEFORE', item.spotPrice || 0, maxPain, 0, item.strikes);
        }
      }
    }
  } catch (err: any) {
    results.push({ index: indexKey, status: 'error', error: err.message });
  }
}

// ── PROCESS STOCK OPTIONS ──
// Saves 4 monthly expiries for each stock
async function processStockOptions(
  symbol: string,
  tradeDate: string,
  results: any[]
) {
  try {
    const data = await callEdge('stock_chain', symbol, undefined, STOCK_OPT_RETRIES);

    if (!data || !data.allExpiries || data.allExpiries.length === 0) {
      results.push({ index: symbol, status: 'error', error: 'No options data' });
      return;
    }

    for (const item of data.allExpiries) {
      if (!item.expiry) continue;

      const strikeCount = Object.keys(item.strikes || {}).length;

      if (strikeCount === 0) {
        results.push({
          index: symbol,
          expiry: item.expiry,
          status: 'empty',
          error: item.error || 'No data for this expiry'
        });
        continue;
      }

      const stockSpot = item.spotPrice || data.spotPrice;
      if (stockSpot > 0) {
        item.strikes['_spot_close'] = stockSpot;
      }

      const result = await saveMarketData(
        symbol.toUpperCase(),
        item.expiry,
        tradeDate,
        item.strikes,
        'stock'
      );

      results.push({
        index: symbol,
        expiry: item.expiry,
        status: result.status,
        strikes: strikeCount
      });
    }
  } catch (err: any) {
    results.push({ index: symbol, status: 'error', error: err.message });
  }
}

// ── SAVE FUNDAMENTAL DATA ──
async function saveFundamentalData(symbol: string, data: any) {
  try {
    if (!data || Object.keys(data).length === 0) return { status: 'empty' };

    const today = new Date().toISOString().split('T')[0];

    const { data: existing } = await supabase
      .from('stock_fundamentals')
      .select('id')
      .eq('stock_name', symbol.toUpperCase())
      .eq('trade_date', today)
      .limit(1);

    const record = {
      stock_name: symbol.toUpperCase(),
      trade_date: today,
      pe_ratio: parseFloat(data.pe || data.pe_ratio || 0) || null,
      eps: parseFloat(data.eps || 0) || null,
      book_value: parseFloat(data.book_value || data.bookValue || 0) || null,
      face_value: parseFloat(data.face_value || data.faceValue || 0) || null,
      market_cap: parseFloat(data.market_cap || data.marketCap || 0) || null,
      week52_high: parseFloat(data.week52High || data.high52 || 0) || null,
      week52_low: parseFloat(data.week52Low || data.low52 || 0) || null,
      dividend_yield: parseFloat(data.dividend_yield || data.dividendYield || 0) || null,
      roce: parseFloat(data.roce || 0) || null,
      sector: data.sector || null,
      ltp: parseFloat(data.ltp || data.lastPrice || 0) || null,
    };

    const { error: upsertErr } = await supabase
      .from('stock_fundamentals')
      .upsert(record, { onConflict: 'stock_name,trade_date' });
    if (upsertErr) throw new Error(upsertErr.message);
    return { status: existing && existing.length > 0 ? 'updated' : 'saved' };
  } catch (err: any) {
    return { status: 'error', error: err.message };
  }
}

// ── PROCESS FUNDAMENTALS FOR ONE STOCK ──
// First tries stock_price_data; falls back to live Yahoo Finance quote
async function processFundamentals(symbol: string, results: any[]) {
  try {
    let ltp = 0, week52High = 0, week52Low = 0;

    // 1. Try stock_price_data (fast, no API call)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const { data: rows } = await supabase
      .from('stock_price_data')
      .select('trade_date, high, low, close')
      .eq('stock_name', symbol.toUpperCase())
      .gte('trade_date', oneYearAgo.toISOString().split('T')[0])
      .order('trade_date', { ascending: false });

    if (rows && rows.length > 0) {
      ltp = rows[0].close;
      week52High = Math.max(...rows.map((r: any) => r.high));
      week52Low = Math.min(...rows.filter((r: any) => r.low > 0).map((r: any) => r.low));
    }

    // 2. Fallback: Yahoo Finance (1 retry only to stay fast)
    if (!ltp) {
      try {
        const priceData = await callEdge('stock_price', symbol, undefined, 2);
        const records: any[] = priceData?.data || [];
        const valid = records
          .filter((r: any) => parseFloat(r.CH_CLOSING_PRICE) > 0)
          .sort((a: any, b: any) => b.CH_TIMESTAMP.localeCompare(a.CH_TIMESTAMP));
        if (valid.length > 0) {
          ltp         = parseFloat(valid[0].CH_CLOSING_PRICE);
          week52High  = parseFloat(valid[0].CH_52WEEK_HIGH_PRICE || 0);
          week52Low   = parseFloat(valid[0].CH_52WEEK_LOW_PRICE  || 0);
        }
      } catch {}
    }

    if (!ltp) {
      results.push({ index: `${symbol}_FUND`, status: 'empty', error: 'No price data available' });
      return;
    }

    const result = await saveFundamentalData(symbol, { ltp, week52High, week52Low });
    results.push({ index: `${symbol}_FUND`, status: result.status, error: result.error });
  } catch (err: any) {
    results.push({ index: `${symbol}_FUND`, status: 'error', error: err.message });
  }
}

// ── PROCESS STOCK PRICE ──
// Fetches daily data, aggregates to monthly OHLC (last 14 months, 1 record per month)
async function processStockPrice(symbol: string, results: any[]) {
  try {
    const data = await callEdge('stock_price', symbol);
    const records = data?.data || [];

    if (!records.length) {
      results.push({ index: `${symbol}_PRICE`, status: 'empty', error: 'No price data' });
      return;
    }

    const daily = records
      .filter((r: any) => r.CH_TIMESTAMP && parseFloat(r.CH_CLOSING_PRICE) > 0)
      .map((r: any) => ({
        trade_date: r.CH_TIMESTAMP as string,
        open: parseFloat(r.CH_OPENING_PRICE || 0),
        high: parseFloat(r.CH_TRADE_HIGH_PRICE || 0),
        low: parseFloat(r.CH_TRADE_LOW_PRICE || 0),
        close: parseFloat(r.CH_CLOSING_PRICE || 0),
        volume: parseFloat(r.CH_TOT_TRADED_QTY || 0),
        raw: r,
      }))
      .sort((a, b) => a.trade_date.localeCompare(b.trade_date));

    if (daily.length === 0) {
      results.push({ index: `${symbol}_PRICE`, status: 'empty', error: 'No valid candles' });
      return;
    }

    // Aggregate daily → monthly (last 14 months, 1 candle per month)
    const byMonth: Record<string, typeof daily> = {};
    daily.forEach(d => {
      const key = d.trade_date.substring(0, 7); // YYYY-MM
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(d);
    });

    const monthlySave = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([, days]) => ({
        stock_name: symbol.toUpperCase(),
        trade_date: days[days.length - 1].trade_date,       // last trading day of month
        open: days[0].open,                                  // first day open
        high: Math.max(...days.map(d => d.high)),
        low: Math.min(...days.map(d => d.low)),
        close: days[days.length - 1].close,                  // last day close
        volume: days.reduce((s, d) => s + d.volume, 0),      // total month volume
      }));

    const { error: upsertErr } = await supabase
      .from('stock_price_data')
      .upsert(monthlySave, { onConflict: 'stock_name,trade_date' });
    if (upsertErr) throw new Error('DB upsert failed: ' + upsertErr.message);

    // Save fundamentals (52W H/L + LTP) from latest NSE raw record
    const latestDaily = daily[daily.length - 1];
    if (latestDaily) {
      await saveFundamentalData(symbol, {
        ltp: latestDaily.close,
        week52High: parseFloat(latestDaily.raw.CH_52WEEK_HIGH_PRICE || 0),
        week52Low: parseFloat(latestDaily.raw.CH_52WEEK_LOW_PRICE || 0),
      });
    }

    results.push({ index: `${symbol}_PRICE`, status: 'saved', strikes: monthlySave.length });
  } catch (err: any) {
    results.push({ index: `${symbol}_PRICE`, status: 'error', error: err.message });
  }
}

// ── LOAD CONFIG FROM SUPABASE ──
async function loadConfig() {
  const { data } = await supabase
    .from('admin_settings')
    .select('*')
    .in('key', ['autofetch_indices', 'autofetch_sectors']);

  let indices = DEFAULT_INDICES;
  let sectors = DEFAULT_SECTORS;

  if (data) {
    data.forEach((s: any) => {
      if (s.key === 'autofetch_indices') {
        try {
          const loaded = JSON.parse(s.value);
          // Always include ALL DEFAULT_INDICES; admin settings only override, never drop
          const mergedMap = new Map(DEFAULT_INDICES.map((d: any) => [d.key, { ...d }]));
          loaded.forEach((idx: any) => {
            const def = mergedMap.get(idx.key);
            if (def) {
              mergedMap.set(idx.key, { ...def, ...idx, edgeType: def.edgeType });
            } else if (idx.edgeType) {
              mergedMap.set(idx.key, idx);
            }
          });
          indices = Array.from(mergedMap.values());
        } catch {}
      }
      if (s.key === 'autofetch_sectors') {
        try { sectors = JSON.parse(s.value); } catch {}
      }
    });
  }
  return { indices, sectors };
}

// ── DEFAULT CONFIG ──
const DEFAULT_INDICES = [
  { key: 'NIFTY50',     name: 'Nifty 50',          exchange: 'NSE', expiry: 'weekly',  edgeType: 'nifty_chain' },
  { key: 'SENSEX',      name: 'Sensex',             exchange: 'BSE', expiry: 'weekly',  edgeType: 'sensex_chain' },
  { key: 'BANKNIFTY',   name: 'Bank Nifty',         exchange: 'NSE', expiry: 'monthly', edgeType: 'banknifty_chain' },
  { key: 'FINNIFTY',    name: 'Fin Nifty',          exchange: 'NSE', expiry: 'monthly', edgeType: 'finnifty_chain' },
  { key: 'MIDCAPNIFTY', name: 'Midcap Nifty',       exchange: 'NSE', expiry: 'monthly', edgeType: 'midcapnifty_chain' },
  { key: 'NIFTYNEXT50', name: 'Nifty Next 50',      exchange: 'NSE', expiry: 'monthly', edgeType: 'niftynext50_chain' },
  { key: 'BANKEX',      name: 'Bankex',             exchange: 'BSE', expiry: 'monthly', edgeType: 'bankex_chain' },
];

const DEFAULT_SECTORS = [
  { name: 'Banking',      stocks: ['HDFCBANK', 'SBIN', 'ICICIBANK', 'KOTAKBANK', 'AXISBANK'] },
  { name: 'IT',           stocks: ['TCS', 'INFY', 'WIPRO', 'HCLTECH', 'TECHM'] },
  { name: 'Auto',         stocks: ['MARUTI', 'TATAMOTORS', 'M&M', 'BAJAJ-AUTO', 'HEROMOTOCO'] },
  { name: 'Pharma',       stocks: ['SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB', 'APOLLOHOSP'] },
  { name: 'FMCG',         stocks: ['HINDUNILVR', 'ITC', 'NESTLEIND', 'BRITANNIA', 'DABUR'] },
  { name: 'Energy/Oil',   stocks: ['RELIANCE', 'ONGC', 'IOC', 'BPCL', 'GAIL'] },
  { name: 'Defence/PSU',  stocks: ['HAL', 'BEL', 'BHEL', 'NTPC', 'POWERGRID'] },
  { name: 'Metals',       stocks: ['TATASTEEL', 'HINDALCO', 'JSWSTEEL', 'VEDL', 'COALINDIA'] },
  { name: 'Realty',       stocks: ['DLF', 'GODREJPROP', 'OBEROIRLTY', 'PRESTIGE', 'PHOENIXLTD'] },
  { name: 'Conglomerate', stocks: ['ADANIENT', 'BAJFINANCE', 'LT', 'SIEMENS', 'ADANIPORTS'] },
];

// ── MAIN AUTO FETCH ──
export async function runDailyAutoFetch(adminUserId: string) {
  const results: any[] = [];

  console.log(`🚀 Starting complete auto-fetch...`);

  // Get effective trade date from edge function (handles holidays)
  let tradeDate = new Date().toISOString().split('T')[0];
  try {
    const expData = await callEdge('get_expiries');
    if (expData?.trade_date) tradeDate = expData.trade_date;
    if (expData?.is_holiday) {
      results.push({
        index: 'SYSTEM',
        status: 'info',
        error: `Today is holiday — using trade date: ${tradeDate}`
      });
    }
  } catch {}

  // Load admin config
  const { indices, sectors } = await loadConfig();

  // ── STEP 1: ALL INDICES ──
  for (const idx of indices) {
    await new Promise(r => setTimeout(r, 500));
    await processIndex(idx.key, idx.name, idx.edgeType, tradeDate, results, true);
  }

  // ── STEP 2: ALL STOCKS (batched to avoid NSE rate-limiting) ──
  const allStocks = sectors.flatMap((s: any) => s.stocks);
  const uniqueStocks = [...new Set(allStocks)] as string[];

  for (let batchStart = 0; batchStart < uniqueStocks.length; batchStart += BATCH_SIZE) {
    if (batchStart > 0) await new Promise(r => setTimeout(r, BATCH_PAUSE));
    const batch = uniqueStocks.slice(batchStart, batchStart + BATCH_SIZE);
    for (const stock of batch) {
      await new Promise(r => setTimeout(r, 800));
      await processStockOptions(stock, tradeDate, results);
      await new Promise(r => setTimeout(r, 1500));
      await processStockPrice(stock, results);
      await new Promise(r => setTimeout(r, 1500));
      await processFundamentals(stock, results);
    }
  }

  const saved = results.filter(r => r.status === 'saved' || r.status === 'updated').length;
  const errors = results.filter(r => r.status === 'error').length;
  console.log(`✅ Done: ${saved} saved, ${errors} errors`);

  return results;
}

// ── STANDALONE: AUTO FETCH SINGLE STOCK PRICE ──
export async function autoFetchStockPrice(symbol: string): Promise<any[]> {
  const data = await callEdge('stock_price', symbol);
  const records = data?.data || [];
  if (!records.length) throw new Error(`No price data for ${symbol}`);

  const toSave = records
    .filter((r: any) => r.CH_TIMESTAMP && parseFloat(r.CH_CLOSING_PRICE) > 0)
    .map((r: any) => ({
      stock_name: symbol.toUpperCase(),
      trade_date: r.CH_TIMESTAMP,
      open: parseFloat(r.CH_OPENING_PRICE || 0),
      high: parseFloat(r.CH_TRADE_HIGH_PRICE || 0),
      low: parseFloat(r.CH_TRADE_LOW_PRICE || 0),
      close: parseFloat(r.CH_CLOSING_PRICE || 0),
      volume: parseFloat(r.CH_TOT_TRADED_QTY || 0),
    }));

  const { error: upsertErr } = await supabase
    .from('stock_price_data')
    .upsert(toSave, { onConflict: 'stock_name,trade_date' });
  if (upsertErr) throw new Error('DB upsert failed: ' + upsertErr.message);

  // Also save fundamentals from raw NSE response
  const sorted = [...toSave].sort((a, b) => b.trade_date.localeCompare(a.trade_date));
  const latestRaw = records.find((r: any) => r.CH_TIMESTAMP === sorted[0]?.trade_date);
  if (latestRaw) {
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('stock_fundamentals').upsert({
      stock_name: symbol.toUpperCase(),
      trade_date: today,
      ltp: sorted[0].close,
      week52_high: parseFloat(latestRaw.CH_52WEEK_HIGH_PRICE || 0) || null,
      week52_low: parseFloat(latestRaw.CH_52WEEK_LOW_PRICE || 0) || null,
    }, { onConflict: 'stock_name,trade_date' });
  }

  return toSave;
}

// ── STANDALONE: FETCH ALL INDICES ──
export async function autoFetchAllIndices(): Promise<any[]> {
  const results: any[] = [];

  let tradeDate = new Date().toISOString().split('T')[0];
  try {
    const expData = await callEdge('get_expiries');
    if (expData?.trade_date) tradeDate = expData.trade_date;
  } catch {}

  const { indices } = await loadConfig();
  for (const idx of indices) {
    await new Promise(r => setTimeout(r, 800));
    await processIndex(idx.key, idx.name, idx.edgeType, tradeDate, results, true);
  }

  const saved = results.filter(r => r.status === 'saved').length;
  const errors = results.filter(r => r.status === 'error').length;
  console.log(`✅ Indices done: ${saved} saved, ${errors} errors`);
  return results;
}

// ── STANDALONE: FETCH ALL STOCKS DATA (options + price) ──
export async function autoFetchAllStocksData(): Promise<any[]> {
  const results: any[] = [];

  let tradeDate = new Date().toISOString().split('T')[0];
  try {
    const expData = await callEdge('get_expiries');
    if (expData?.trade_date) tradeDate = expData.trade_date;
  } catch {}

  const { sectors } = await loadConfig();
  const allStocks = sectors.flatMap((s: any) => s.stocks);
  const uniqueStocks = [...new Set(allStocks)] as string[];

  for (let batchStart = 0; batchStart < uniqueStocks.length; batchStart += BATCH_SIZE) {
    if (batchStart > 0) await new Promise(r => setTimeout(r, BATCH_PAUSE));
    const batch = uniqueStocks.slice(batchStart, batchStart + BATCH_SIZE);
    for (const stock of batch) {
      await new Promise(r => setTimeout(r, 800));
      await processStockOptions(stock, tradeDate, results);
      await new Promise(r => setTimeout(r, 1500));
      await processStockPrice(stock, results);
    }
  }

  const saved = results.filter(r => r.status === 'saved').length;
  const errors = results.filter(r => r.status === 'error').length;
  console.log(`✅ Stocks data done: ${saved} saved, ${errors} errors`);
  return results;
}

// ── STANDALONE: FETCH STOCK OPTIONS ONLY ──
export async function autoFetchAllStockOptions(): Promise<any[]> {
  const results: any[] = [];

  let tradeDate = new Date().toISOString().split('T')[0];
  try {
    const expData = await callEdge('get_expiries');
    if (expData?.trade_date) tradeDate = expData.trade_date;
  } catch {}

  const { sectors } = await loadConfig();
  const allStocks = sectors.flatMap((s: any) => s.stocks);
  const uniqueStocks = [...new Set(allStocks)] as string[];

  for (let batchStart = 0; batchStart < uniqueStocks.length; batchStart += BATCH_SIZE) {
    if (batchStart > 0) await new Promise(r => setTimeout(r, BATCH_PAUSE));
    const batch = uniqueStocks.slice(batchStart, batchStart + BATCH_SIZE);
    for (const stock of batch) {
      await new Promise(r => setTimeout(r, 800));
      await processStockOptions(stock, tradeDate, results);
    }
  }

  const saved = results.filter(r => r.status === 'saved').length;
  const errors = results.filter(r => r.status === 'error').length;
  console.log(`✅ Stock options done: ${saved} saved, ${errors} errors`);
  return results;
}

// ── STANDALONE: FETCH STOCK PRICES ONLY ──
export async function autoFetchAllStockPrices(): Promise<any[]> {
  const results: any[] = [];

  const { sectors } = await loadConfig();
  const allStocks = sectors.flatMap((s: any) => s.stocks);
  const uniqueStocks = [...new Set(allStocks)] as string[];

  for (let batchStart = 0; batchStart < uniqueStocks.length; batchStart += BATCH_SIZE) {
    if (batchStart > 0) await new Promise(r => setTimeout(r, BATCH_PAUSE));
    const batch = uniqueStocks.slice(batchStart, batchStart + BATCH_SIZE);
    for (const stock of batch) {
      await new Promise(r => setTimeout(r, 1200));
      await processStockPrice(stock, results);
    }
  }

  const saved = results.filter(r => r.status === 'saved' || r.status === 'updated').length;
  const errors = results.filter(r => r.status === 'error').length;
  console.log(`✅ Stock prices done: ${saved} saved, ${errors} errors`);
  return results;
}

// ── STANDALONE: FETCH ALL FUNDAMENTALS ──
export async function autoFetchAllFundamentals(): Promise<any[]> {
  const results: any[] = [];

  const { sectors } = await loadConfig();
  const allStocks = sectors.flatMap((s: any) => s.stocks);
  const uniqueStocks = [...new Set(allStocks)] as string[];

  for (const stock of uniqueStocks) {
    await new Promise(r => setTimeout(r, 400));
    await processFundamentals(stock, results);
  }

  const saved = results.filter(r => r.status === 'saved' || r.status === 'updated').length;
  const errors = results.filter(r => r.status === 'error').length;
  console.log(`✅ Fundamentals done: ${saved} saved, ${errors} errors`);
  return results;
}

// ── RETRY FAILED STOCKS ──
// Re-fetches options + price only for the given symbols (used after a failed batch run)
export async function retryFailedStocks(symbols: string[]): Promise<any[]> {
  const results: any[] = [];

  let tradeDate = new Date().toISOString().split('T')[0];
  try {
    const expData = await callEdge('get_expiries');
    if (expData?.trade_date) tradeDate = expData.trade_date;
  } catch {}

  for (let batchStart = 0; batchStart < symbols.length; batchStart += BATCH_SIZE) {
    if (batchStart > 0) await new Promise(r => setTimeout(r, BATCH_PAUSE));
    const batch = symbols.slice(batchStart, batchStart + BATCH_SIZE);
    for (const stock of batch) {
      await new Promise(r => setTimeout(r, 800));
      await processStockOptions(stock, tradeDate, results);
      await new Promise(r => setTimeout(r, 1500));
      await processStockPrice(stock, results);
    }
  }

  const saved = results.filter(r => r.status === 'saved').length;
  const errors = results.filter(r => r.status === 'error').length;
  console.log(`🔁 Retry done: ${saved} saved, ${errors} errors`);
  return results;
}

// ── STANDALONE: AUTO FETCH SINGLE STOCK OPTIONS ──
export async function autoFetchStockOptions(
  symbol: string,
  expiry: string
): Promise<Record<string, any>> {
  const data = await callEdge('stock_chain', symbol, expiry);
  const allExpiries = data?.allExpiries || [];
  const tradeDate = data?.tradeDate || new Date().toISOString().split('T')[0];

  // Find the requested expiry
  const item = allExpiries.find((e: any) => e.expiry === expiry) || allExpiries[0];
  const strikes = item?.strikes || {};

  if (!Object.keys(strikes).length) {
    throw new Error(`No options data for ${symbol} ${expiry}`);
  }

  const { data: existing } = await supabase
    .from('market_data')
    .select('id')
    .eq('index_name', symbol.toUpperCase())
    .eq('expiry', expiry)
    .eq('trade_date', tradeDate)
    .limit(1);

  if (!existing || existing.length === 0) {
    await supabase.from('market_data').insert({
      index_name: symbol.toUpperCase(),
      expiry,
      trade_date: tradeDate,
      strike_data: strikes,
      uploaded_by: 'auto-fetch',
      category: 'stock',
      timeframe: 'daily'
    });
  }

  return strikes;
}

// ── Z2H CUSTOMER SNAPSHOT FETCH ──
// Called by customers on expiry day. Fetches live option chain and saves as z2h_snapshot.
export async function fetchAndSaveZ2HSnapshot(
  indexKey: string,
  expiry: string,
  snapshotType: SnapshotType,
  fetchedBy: string
): Promise<{ spot: number; maxPain: number; vix: number; strikesCount: number }> {
  const cfg = INDEX_CONFIG[indexKey];
  if (!cfg) throw new Error(`Unknown index: ${indexKey}`);

  const raw = await callEdge(cfg.edgeType);
  if (!raw || !Array.isArray(raw)) throw new Error('Exchange returned no data');

  // Find the matching expiry in the returned array
  const item: any = raw.find((d: any) => d.expiry === expiry) ?? raw[0];
  if (!item) throw new Error(`Expiry ${expiry} not found in exchange data`);

  const strikes: Record<string, any> = item.strikes ?? {};
  const spot: number = item.spotPrice ?? 0;
  const vix: number = item.vix ?? 0;

  if (Object.keys(strikes).length === 0) throw new Error('No strikes data from exchange');

  const maxPain = calculateMaxPain(strikes);

  const payload = {
    index_name: indexKey,
    expiry_date: expiry,
    snapshot_type: snapshotType,
    spot_price: spot,
    max_pain: maxPain,
    vix,
    strike_data: strikes,
    fetched_by: fetchedBy,
    fetched_at: new Date().toISOString(),
  };

  // Upsert: overwrite if same (index, expiry, type) already exists for today
  const { data: existing } = await supabase
    .from('z2h_snapshots')
    .select('id')
    .eq('index_name', indexKey)
    .eq('expiry_date', expiry)
    .eq('snapshot_type', snapshotType)
    .limit(1);

  if (existing && existing.length > 0) {
    await supabase.from('z2h_snapshots').update(payload).eq('id', existing[0].id);
  } else {
    const { error } = await supabase.from('z2h_snapshots').insert(payload);
    if (error) throw new Error(error.message);
  }

  return { spot, maxPain, vix, strikesCount: Object.keys(strikes).length };
}



