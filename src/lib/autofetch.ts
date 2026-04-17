import { supabase } from './supabase';

// ── CALL EDGE FUNCTION ──
async function callEdge(type: string, symbol?: string, expiry?: string) {
  const { data, error } = await supabase.functions.invoke('fetch-nse-data', {
    body: { type, symbol, expiry }
  });
  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || 'Fetch failed');
  return data.data;
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

    await supabase.from('market_data').insert({
      index_name: indexName,
      expiry,
      trade_date: tradeDate,
      strike_data: strikeData,
      uploaded_by: 'auto-fetch',
      timeframe: 'daily',
      category
    });

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
  vix: number
) {
  try {
    await supabase.from('z2h_snapshots').insert({
      index_name: indexName,
      expiry_date: expiry,
      snapshot_type: snapshotType,
      spot_price: spotPrice,
      max_pain: maxPain,
      vix
    });
  } catch {}
}

// ── CALCULATE MAX PAIN ──
function calculateMaxPain(strikes: Record<string, any>): number {
  const strikeList = Object.keys(strikes).map(Number).sort((a, b) => a - b);
  let minPain = Infinity;
  let maxPainStrike = strikeList[0] || 0;
  strikeList.forEach(testStrike => {
    let totalPain = 0;
    strikeList.forEach(s => {
      const sd = strikes[s];
      if (testStrike > s) totalPain += (testStrike - s) * (sd.ce_oi || 0);
      if (testStrike < s) totalPain += (s - testStrike) * (sd.pe_oi || 0);
    });
    if (totalPain < minPain) { minPain = totalPain; maxPainStrike = testStrike; }
  });
  return maxPainStrike;
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

      const result = await saveMarketData(
        indexKey, item.expiry, tradeDate, item.strikes
      );

      results.push({
        index: indexKey,
        expiry: item.expiry,
        status: result.status,
        strikes: strikeCount
      });

      // Z2H snapshot for Nifty + Sensex
      if (isZ2H && result.status === 'saved') {
        const maxPain = calculateMaxPain(item.strikes);
        const expiryDate = new Date(item.expiry);
        const todayDate = new Date(tradeDate);
        const dayBefore = new Date(expiryDate);
        dayBefore.setDate(expiryDate.getDate() - 1);

        if (expiryDate.toDateString() === todayDate.toDateString()) {
          await saveZ2HSnapshot(indexName, item.expiry, 'EXPIRY_EOD', item.spotPrice || 0, maxPain, 0);
        } else if (dayBefore.toDateString() === todayDate.toDateString()) {
          await saveZ2HSnapshot(indexName, item.expiry, 'DAY_BEFORE', item.spotPrice || 0, maxPain, 0);
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
    const data = await callEdge('stock_chain', symbol);

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

      const result = await saveMarketData(
        symbol.toUpperCase(),
        item.expiry,
        tradeDate,
        item.strikes,
        'stock'  // ✅ category = stock
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

    if (existing && existing.length > 0) {
      await supabase.from('stock_fundamentals').update(record).eq('id', existing[0].id);
      return { status: 'updated' };
    }

    await supabase.from('stock_fundamentals').insert(record);
    return { status: 'saved' };
  } catch (err: any) {
    return { status: 'error', error: err.message };
  }
}

// ── PROCESS FUNDAMENTALS FOR ONE STOCK ──
async function processFundamentals(symbol: string, results: any[]) {
  try {
    const data = await callEdge('stock_fundamentals', symbol);

    if (!data) {
      results.push({ index: `${symbol}_FUND`, status: 'empty', error: 'No fundamental data' });
      return;
    }

    const result = await saveFundamentalData(symbol, data);
    results.push({ index: `${symbol}_FUND`, status: result.status, error: result.error });
  } catch (err: any) {
    results.push({ index: `${symbol}_FUND`, status: 'error', error: err.message });
  }
}

// ── PROCESS STOCK PRICE ──
// Saves 14 months of daily OHLC
async function processStockPrice(symbol: string, results: any[]) {
  try {
    const data = await callEdge('stock_price', symbol);
    const records = data?.data || [];

    if (!records.length) {
      results.push({ index: `${symbol}_PRICE`, status: 'empty', error: 'No price data' });
      return;
    }

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

    if (toSave.length === 0) {
      results.push({ index: `${symbol}_PRICE`, status: 'empty', error: 'No valid candles' });
      return;
    }

    await supabase
      .from('stock_price_data')
      .upsert(toSave, { onConflict: 'stock_name,trade_date' });

    results.push({
      index: `${symbol}_PRICE`,
      status: 'saved',
      strikes: toSave.length
    });
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
        try { indices = JSON.parse(s.value); } catch {}
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
    const isZ2H = idx.key === 'NIFTY50' || idx.key === 'SENSEX';
    await processIndex(idx.key, idx.name, idx.edgeType, tradeDate, results, isZ2H);
  }

  // ── STEP 2: ALL STOCKS ──
  const allStocks = sectors.flatMap((s: any) => s.stocks);
  const uniqueStocks = [...new Set(allStocks)] as string[];

  for (const stock of uniqueStocks) {
    await new Promise(r => setTimeout(r, 400));

    // Stock options — 4 monthly expiries
    await processStockOptions(stock, tradeDate, results);

    await new Promise(r => setTimeout(r, 300));

    // Stock price — 14 months historical
    await processStockPrice(stock, results);

    await new Promise(r => setTimeout(r, 300));

    // Fundamental data — PE, EPS, book value, market cap, etc.
    await processFundamentals(stock, results);
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

  await supabase
    .from('stock_price_data')
    .upsert(toSave, { onConflict: 'stock_name,trade_date' });

  return toSave;
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

  for (const stock of uniqueStocks) {
    await new Promise(r => setTimeout(r, 400));
    await processStockOptions(stock, tradeDate, results);
    await new Promise(r => setTimeout(r, 300));
    await processStockPrice(stock, results);
  }

  const saved = results.filter(r => r.status === 'saved').length;
  const errors = results.filter(r => r.status === 'error').length;
  console.log(`✅ Stocks data done: ${saved} saved, ${errors} errors`);
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







