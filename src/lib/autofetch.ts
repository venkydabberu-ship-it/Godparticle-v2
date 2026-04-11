import { supabase } from './supabase';

const ANON_KEY = 'sb_publishable_tP6_kK4impqvOQhdpko4UA_I6hWtPhd';
const FUNCTION_URL = 'https://msknryditzgmiawrxcea.supabase.co/functions/v1/fetch-nse-data';

const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${ANON_KEY}`,
  'apikey': ANON_KEY,
};

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
  } catch {
    return { status: 'error' };
  }
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

// ── SAVE Z2H SNAPSHOT ──
async function saveZ2HSnapshot(
  indexName: string, expiry: string,
  snapshotType: string, spotPrice: number, maxPain: number
) {
  try {
    await supabase.from('z2h_snapshots').insert({
      index_name: indexName,
      expiry_date: expiry,
      snapshot_type: snapshotType,
      spot_price: spotPrice,
      max_pain: maxPain,
      vix: 0
    });
  } catch {}
}

// ── ALL STOCKS LIST ──
const ALL_STOCKS = [
  'HDFCBANK','SBIN','ICICIBANK','KOTAKBANK','AXISBANK',
  'TCS','INFY','WIPRO','HCLTECH','TECHM',
  'MARUTI','TATAMOTORS','M&M','BAJAJ-AUTO','HEROMOTOCO',
  'SUNPHARMA','DRREDDY','CIPLA','DIVISLAB','APOLLOHOSP',
  'HINDUNILVR','ITC','NESTLEIND','BRITANNIA','DABUR',
  'RELIANCE','ONGC','IOC','BPCL','GAIL',
  'HAL','BEL','BHEL','NTPC','POWERGRID',
  'TATASTEEL','HINDALCO','JSWSTEEL','VEDL','COALINDIA',
  'DLF','GODREJPROP','OBEROIRLTY','PRESTIGE','PHOENIXLTD',
  'ADANIENT','BAJFINANCE','LT','SIEMENS','ADANIPORTS',
];

// ── DEFAULT INDICES ──
const DEFAULT_INDICES = [
  { key: 'NIFTY50', exchange: 'NSE', expiry: 'weekly' },
  { key: 'SENSEX', exchange: 'BSE', expiry: 'weekly' },
  { key: 'BANKNIFTY', exchange: 'NSE', expiry: 'monthly' },
  { key: 'FINNIFTY', exchange: 'NSE', expiry: 'monthly' },
  { key: 'MIDCAPNIFTY', exchange: 'NSE', expiry: 'monthly' },
  { key: 'NIFTYNEXT50', exchange: 'NSE', expiry: 'monthly' },
  { key: 'BANKEX', exchange: 'BSE', expiry: 'monthly' },
];

// ── MAIN AUTO FETCH ──
export async function runDailyAutoFetch(adminUserId: string) {
  const results: any[] = [];
  const today = new Date().toISOString().split('T')[0];

  // ── GET EXPIRIES ──
  let nseWeekly: string[] = [];
  let nseMonthly: string[] = [];
  let bseWeekly: string[] = [];
  let bseMonthly: string[] = [];

  try {
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ type: 'get_expiries' }),
      signal: AbortSignal.timeout(10000)
    });
    const json = await res.json();
    nseWeekly = json?.data?.nse_weekly || [];
    nseMonthly = json?.data?.nse_monthly || [];
    bseWeekly = json?.data?.bse_weekly || [];
    bseMonthly = json?.data?.bse_monthly || [];
  } catch {
    // Local fallback
    const now = new Date();
    for (let i = 0; i <= 35; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      if (d.getDay() === 2 && nseWeekly.length < 4)
        nseWeekly.push(d.toISOString().split('T')[0]);
      if (d.getDay() === 4 && bseWeekly.length < 4)
        bseWeekly.push(d.toISOString().split('T')[0]);
    }
    let month = now.getMonth(); let year = now.getFullYear();
    while (nseMonthly.length < 4) {
      const lastDay = new Date(year, month + 1, 0);
      let d = new Date(lastDay);
      while (d.getDay() !== 2) d.setDate(d.getDate() - 1);
      nseMonthly.push(d.toISOString().split('T')[0]);
      month++; if (month > 11) { month = 0; year++; }
    }
    month = now.getMonth(); year = now.getFullYear();
    while (bseMonthly.length < 4) {
      const lastDay = new Date(year, month + 1, 0);
      let d = new Date(lastDay);
      while (d.getDay() !== 4) d.setDate(d.getDate() - 1);
      bseMonthly.push(d.toISOString().split('T')[0]);
      month++; if (month > 11) { month = 0; year++; }
    }
  }

  // Load custom config
  let indices = DEFAULT_INDICES;
  let customStocks = ALL_STOCKS;
  try {
    const { data: configData } = await supabase.from('admin_settings').select('*')
      .in('key', ['autofetch_indices', 'autofetch_sectors']);
    if (configData) {
      configData.forEach(s => {
        if (s.key === 'autofetch_indices') try { indices = JSON.parse(s.value); } catch {}
        if (s.key === 'autofetch_sectors') {
          try {
            const sectors = JSON.parse(s.value);
            customStocks = [...new Set(sectors.flatMap((s: any) => s.stocks))];
          } catch {}
        }
      });
    }
  } catch {}

  // ── STEP 1: ALL INDICES ──
  for (const idx of indices) {
    let expiries: string[] = [];
    if (idx.expiry === 'weekly') {
      const weekly = idx.exchange === 'NSE' ? nseWeekly : bseWeekly;
      const monthly = idx.exchange === 'NSE' ? nseMonthly : bseMonthly;
      expiries = [...new Set([...weekly, ...monthly])];
    } else {
      expiries = idx.exchange === 'NSE' ? nseMonthly : bseMonthly;
    }

    const isZ2H = idx.key === 'NIFTY50' || idx.key === 'SENSEX';

    for (const exp of expiries) {
      try {
        await new Promise(r => setTimeout(r, 800));
        const res = await fetch(FUNCTION_URL, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify({ type: 'single_expiry', symbol: idx.key, expiry: exp }),
          signal: AbortSignal.timeout(15000)
        });
        const json = await res.json();

        if (!json?.success || !json?.data?.strikes || Object.keys(json.data.strikes).length === 0) {
          results.push({ index: idx.key, expiry: exp, status: 'empty' });
          continue;
        }

        const result = await saveMarketData(idx.key, exp, today, json.data.strikes, 'index');
        results.push({
          index: idx.key, expiry: exp,
          status: result.status,
          strikes: Object.keys(json.data.strikes).length
        });

        // Z2H snapshot
        if (isZ2H && result.status === 'saved') {
          const maxPain = calculateMaxPain(json.data.strikes);
          const expiryDate = new Date(exp);
          const todayDate = new Date(today);
          const dayBefore = new Date(expiryDate);
          dayBefore.setDate(expiryDate.getDate() - 1);
          if (expiryDate.toDateString() === todayDate.toDateString()) {
            await saveZ2HSnapshot(idx.key, exp, 'EXPIRY_EOD', json.data.spotPrice || 0, maxPain);
          } else if (dayBefore.toDateString() === todayDate.toDateString()) {
            await saveZ2HSnapshot(idx.key, exp, 'DAY_BEFORE', json.data.spotPrice || 0, maxPain);
          }
        }
      } catch (e: any) {
        results.push({ index: idx.key, expiry: exp, status: 'error', error: e.message });
      }
    }
  }

  // ── STEP 2: STOCKS OPTIONS ──
  for (const stock of customStocks) {
    for (const exp of nseMonthly) {
      try {
        await new Promise(r => setTimeout(r, 800));
        const res = await fetch(FUNCTION_URL, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify({ type: 'single_expiry', symbol: stock, expiry: exp }),
          signal: AbortSignal.timeout(15000)
        });
        const json = await res.json();

        if (!json?.success || !json?.data?.strikes || Object.keys(json.data.strikes).length === 0) {
          results.push({ index: stock, expiry: exp, status: 'empty' });
          continue;
        }

        const result = await saveMarketData(stock, exp, today, json.data.strikes, 'stock');
        results.push({
          index: stock, expiry: exp,
          status: result.status,
          strikes: Object.keys(json.data.strikes).length
        });
      } catch (e: any) {
        results.push({ index: stock, expiry: exp, status: 'error', error: e.message });
      }
    }
  }

  // ── STEP 3: STOCKS PRICE ──
  for (const stock of customStocks) {
    try {
      await new Promise(r => setTimeout(r, 800));
      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ type: 'stock_price', symbol: stock }),
        signal: AbortSignal.timeout(15000)
      });
      const json = await res.json();
      const records = json?.data?.data || [];

      if (!records.length) {
        results.push({ index: `${stock}_PRICE`, status: 'empty' });
        continue;
      }

      const toSave = records.map((r: any) => ({
        stock_name: stock,
        trade_date: r.CH_TIMESTAMP,
        open: parseFloat(r.CH_OPENING_PRICE || 0),
        high: parseFloat(r.CH_TRADE_HIGH_PRICE || 0),
        low: parseFloat(r.CH_TRADE_LOW_PRICE || 0),
        close: parseFloat(r.CH_CLOSING_PRICE || 0),
        volume: parseFloat(r.CH_TOT_TRADED_QTY || 0),
      }));

      await supabase.from('stock_price_data')
        .upsert(toSave, { onConflict: 'stock_name,trade_date' });

      results.push({ index: `${stock}_PRICE`, status: 'saved', strikes: records.length });
    } catch (e: any) {
      results.push({ index: `${stock}_PRICE`, status: 'error', error: e.message });
    }
  }

  return results;
}

// ── STANDALONE EXPORTS ──
export async function autoFetchStockPrice(symbol: string): Promise<any[]> {
  const data = await callEdge('stock_price', symbol);
  const records = data?.data || [];
  if (!records.length) throw new Error(`No price data for ${symbol}`);

  const toSave = records.map((r: any) => ({
    stock_name: symbol.toUpperCase(),
    trade_date: r.CH_TIMESTAMP,
    open: parseFloat(r.CH_OPENING_PRICE || 0),
    high: parseFloat(r.CH_TRADE_HIGH_PRICE || 0),
    low: parseFloat(r.CH_TRADE_LOW_PRICE || 0),
    close: parseFloat(r.CH_CLOSING_PRICE || 0),
    volume: parseFloat(r.CH_TOT_TRADED_QTY || 0),
  }));

  await supabase.from('stock_price_data')
    .upsert(toSave, { onConflict: 'stock_name,trade_date' });

  return toSave;
}

export async function autoFetchStockOptions(
  symbol: string, expiry: string
): Promise<Record<string, any>> {
  const data = await callEdge('single_expiry', symbol, expiry);
  const strikes = data?.strikes || {};
  if (!Object.keys(strikes).length) throw new Error(`No options data for ${symbol}`);

  const today = new Date().toISOString().split('T')[0];
  const { data: existing } = await supabase
    .from('market_data').select('id')
    .eq('index_name', symbol.toUpperCase())
    .eq('expiry', expiry)
    .eq('trade_date', today)
    .limit(1);

  if (!existing || existing.length === 0) {
    await supabase.from('market_data').insert({
      index_name: symbol.toUpperCase(), expiry,
      trade_date: today, strike_data: strikes,
      uploaded_by: 'auto-fetch', category: 'stock', timeframe: 'daily'
    });
  }
  return strikes;
}






