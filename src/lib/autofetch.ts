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

// ── GET EXPIRY DATES FROM EDGE FUNCTION ──
async function getExpiries() {
  const data = await callEdge('get_expiries');
  return {
    nseWeekly: data.nse_weekly || [],
    nseMonthly: data.nse_monthly || [],
    bseWeekly: data.bse_weekly || [],
    bseMonthly: data.bse_monthly || [],
  };
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

// ── FETCH + SAVE ONE EXPIRY FOR INDEX ──
async function fetchAndSaveExpiry(
  indexKey: string,
  expiry: string,
  today: string,
  results: any[],
  isZ2H: boolean = false,
  z2hName: string = ''
) {
  try {
    await new Promise(r => setTimeout(r, 1200)); // 1.2s delay — Upstox rate limit

    const data = await callEdge('single_expiry', indexKey, expiry);

    if (!data || Object.keys(data.strikes || {}).length === 0) {
      results.push({ index: indexKey, expiry, status: 'empty', error: 'No strike data — market may be closed' });
      return;
    }

    const result = await saveMarketData(indexKey, expiry, today, data.strikes);
    results.push({
      index: indexKey,
      expiry,
      status: result.status,
      strikes: Object.keys(data.strikes).length
    });

    // Z2H snapshot for weekly indices
    if (isZ2H && result.status === 'saved') {
      const maxPain = calculateMaxPain(data.strikes);
      const expiryDate = new Date(expiry);
      const todayDate = new Date(today);
      const dayBefore = new Date(expiryDate);
      dayBefore.setDate(expiryDate.getDate() - 1);

      if (expiryDate.toDateString() === todayDate.toDateString()) {
        await saveZ2HSnapshot(z2hName, expiry, 'EXPIRY_EOD', data.spotPrice || 0, maxPain);
      } else if (dayBefore.toDateString() === todayDate.toDateString()) {
        await saveZ2HSnapshot(z2hName, expiry, 'DAY_BEFORE', data.spotPrice || 0, maxPain);
      }
    }
  } catch (err: any) {
    results.push({ index: indexKey, expiry, status: 'error', error: err.message });
  }
}

// ── LOAD CONFIG FROM SUPABASE ──
async function loadConfig() {
  const { data } = await supabase.from('admin_settings').select('*')
    .in('key', ['autofetch_indices', 'autofetch_sectors']);

  let indices = DEFAULT_INDICES;
  let sectors = DEFAULT_SECTORS;

  if (data) {
    data.forEach(s => {
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
  { key: 'NIFTY50', name: 'Nifty 50', exchange: 'NSE', expiry: 'weekly' },
  { key: 'SENSEX', name: 'Sensex', exchange: 'BSE', expiry: 'weekly' },
  { key: 'BANKNIFTY', name: 'Bank Nifty', exchange: 'NSE', expiry: 'monthly' },
  { key: 'FINNIFTY', name: 'Fin Nifty', exchange: 'NSE', expiry: 'monthly' },
  { key: 'MIDCAPNIFTY', name: 'Midcap Nifty', exchange: 'NSE', expiry: 'monthly' },
  { key: 'NIFTYNEXT50', name: 'Nifty Next 50', exchange: 'NSE', expiry: 'monthly' },
  { key: 'BANKEX', name: 'Bankex', exchange: 'BSE', expiry: 'monthly' },
];

const DEFAULT_SECTORS = [
  { name: 'Banking', stocks: ['HDFCBANK', 'SBIN', 'ICICIBANK', 'KOTAKBANK', 'AXISBANK'] },
  { name: 'IT', stocks: ['TCS', 'INFY', 'WIPRO', 'HCLTECH', 'TECHM'] },
  { name: 'Auto', stocks: ['MARUTI', 'TATAMOTORS', 'M&M', 'BAJAJ-AUTO', 'HEROMOTOCO'] },
  { name: 'Pharma', stocks: ['SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB', 'APOLLOHOSP'] },
  { name: 'FMCG', stocks: ['HINDUNILVR', 'ITC', 'NESTLEIND', 'BRITANNIA', 'DABUR'] },
  { name: 'Energy/Oil', stocks: ['RELIANCE', 'ONGC', 'IOC', 'BPCL', 'GAIL'] },
  { name: 'Defence/PSU', stocks: ['HAL', 'BEL', 'BHEL', 'NTPC', 'POWERGRID'] },
  { name: 'Metals', stocks: ['TATASTEEL', 'HINDALCO', 'JSWSTEEL', 'VEDL', 'COALINDIA'] },
  { name: 'Realty', stocks: ['DLF', 'GODREJPROP', 'OBEROIRLTY', 'PRESTIGE', 'PHOENIXLTD'] },
  { name: 'Conglomerate', stocks: ['ADANIENT', 'BAJFINANCE', 'LT', 'SIEMENS', 'ADANIPORTS'] },
];

// ── MAIN AUTO FETCH ──
export async function runDailyAutoFetch(adminUserId: string) {
  const results: any[] = [];
  const today = new Date().toISOString().split('T')[0];

  console.log(`🚀 Starting complete auto-fetch for ${today}`);

  // Load config
  const { indices, sectors } = await loadConfig();

  // ── GET EXPIRY DATES WITH LOCAL FALLBACK ──
  let nseWeekly: string[] = [];
  let nseMonthly: string[] = [];
  let bseWeekly: string[] = [];
  let bseMonthly: string[] = [];

  try {
    const expiries = await getExpiries();
    nseWeekly = expiries.nseWeekly;
    nseMonthly = expiries.nseMonthly;
    bseWeekly = expiries.bseWeekly;
    bseMonthly = expiries.bseMonthly;
  } catch {
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

  // ── STEP 1: PROCESS ALL INDICES ──
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
      await fetchAndSaveExpiry(idx.key, exp, today, results, isZ2H, idx.name);
    }
  }

  // ── STEP 2: PROCESS ALL STOCKS — OPTIONS ──
  const allStocks = [...new Set(sectors.flatMap((s: any) => s.stocks))] as string[];

  for (const stock of allStocks) {
    for (const exp of nseMonthly) {
      try {
        await new Promise(r => setTimeout(r, 1200)); // 1.2s delay
        const data = await callEdge('single_expiry', stock, exp);

        if (!data || Object.keys(data.strikes || {}).length === 0) {
          results.push({ index: stock, expiry: exp, status: 'empty', error: 'No options data' });
          continue;
        }

        const result = await saveMarketData(stock, exp, today, data.strikes, 'stock');
        results.push({
          index: stock,
          expiry: exp,
          status: result.status,
          strikes: Object.keys(data.strikes).length
        });
      } catch (err: any) {
        results.push({ index: stock, expiry: exp, status: 'error', error: err.message });
      }
    }
  }

  // ── STEP 3: PROCESS ALL STOCKS — PRICE DATA ──
  for (const stock of allStocks) {
    try {
      await new Promise(r => setTimeout(r, 1200)); // 1.2s delay
      const data = await callEdge('stock_price', stock);
      const records = data?.data || [];

      if (!records.length) {
        results.push({ index: `${stock}_PRICE`, status: 'empty', error: 'No price data' });
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

      results.push({
        index: `${stock}_PRICE`,
        status: 'saved',
        strikes: records.length
      });
    } catch (err: any) {
      results.push({ index: `${stock}_PRICE`, status: 'error', error: err.message });
    }
  }

  console.log(`✅ Complete! ${results.filter(r => r.status === 'saved').length} saved, ${results.filter(r => r.status === 'error').length} errors`);
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


