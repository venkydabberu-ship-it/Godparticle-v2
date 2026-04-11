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

// ── GET NEXT 4 WEEKLY EXPIRIES ──
function getNext4Weekly(day: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  let count = 0;
  for (let i = 0; i <= 35 && count < 4; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    if (d.getDay() === day) {
      dates.push(d.toISOString().split('T')[0]);
      count++;
    }
  }
  return dates;
}

// ── GET NEXT 4 MONTHLY EXPIRIES ──
// Monthly = last Tuesday (NSE) or last Thursday (BSE) of each month
function getNext4Monthly(day: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  let month = now.getMonth();
  let year = now.getFullYear();

  while (dates.length < 4) {
    // Find last occurrence of 'day' in this month
    const lastDay = new Date(year, month + 1, 0); // last day of month
    let d = new Date(lastDay);
    while (d.getDay() !== day) {
      d.setDate(d.getDate() - 1);
    }
    const dateStr = d.toISOString().split('T')[0];
    // Only add if in future
    if (d >= now || dates.length > 0) {
      dates.push(dateStr);
    }
    month++;
    if (month > 11) { month = 0; year++; }
  }
  return dates.slice(0, 4);
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
  snapshotType: string, spotPrice: number, maxPain: number, vix: number
) {
  try {
    await supabase.from('z2h_snapshots').insert({
      index_name: indexName, expiry_date: expiry,
      snapshot_type: snapshotType, spot_price: spotPrice,
      max_pain: maxPain, vix
    });
  } catch {}
}

// ── PROCESS ONE INDEX ──
async function processIndex(
  indexKey: string,
  indexName: string,
  upstoxType: string,
  expiries: string[],
  today: string,
  results: any[],
  isZ2H: boolean = false
) {
  try {
    const expiryData = await callEdge(upstoxType);
    if (!expiryData || !Array.isArray(expiryData)) {
      results.push({ index: indexKey, status: 'error', error: 'No data returned' });
      return;
    }

    for (const exp of expiries) {
      // Find matching expiry in returned data
      const item = expiryData.find((e: any) => e.expiry === exp);
      if (!item || !item.strikes || Object.keys(item.strikes).length === 0) {
        results.push({ index: indexKey, expiry: exp, status: 'empty', error: 'No strike data' });
        continue;
      }

      const result = await saveMarketData(indexKey, exp, today, item.strikes);
      results.push({
        index: indexKey, expiry: exp,
        status: result.status,
        strikes: Object.keys(item.strikes).length
      });

      // Z2H snapshot for weekly indices
      if (isZ2H && result.status === 'saved') {
        const maxPain = calculateMaxPain(item.strikes);
        const expiryDate = new Date(exp);
        const todayDate = new Date(today);
        const dayBefore = new Date(expiryDate);
        dayBefore.setDate(expiryDate.getDate() - 1);
        if (expiryDate.toDateString() === todayDate.toDateString()) {
          await saveZ2HSnapshot(indexName, exp, 'EXPIRY_EOD', item.spotPrice || 0, maxPain, 0);
        } else if (dayBefore.toDateString() === todayDate.toDateString()) {
          await saveZ2HSnapshot(indexName, exp, 'DAY_BEFORE', item.spotPrice || 0, maxPain, 0);
        }
      }
    }
  } catch (err: any) {
    results.push({ index: indexKey, status: 'error', error: err.message });
  }
}

// ── PROCESS STOCK OPTIONS ──
async function processStockOptions(
  symbol: string,
  expiries: string[],
  today: string,
  results: any[]
) {
  try {
    const data = await callEdge('stock_chain', symbol);
    if (!data || !data.strikes || Object.keys(data.strikes).length === 0) {
      results.push({ index: symbol, status: 'empty', error: 'No options data' });
      return;
    }

    for (const exp of expiries) {
      const result = await saveMarketData(symbol, exp, today, data.strikes, 'stock');
      results.push({
        index: symbol, expiry: exp,
        status: result.status,
        strikes: Object.keys(data.strikes).length
      });
    }
  } catch (err: any) {
    results.push({ index: symbol, status: 'error', error: err.message });
  }
}

// ── PROCESS STOCK PRICE DATA ──
async function processStockPrice(symbol: string, results: any[]) {
  try {
    const data = await callEdge('stock_price', symbol);
    const records = data?.data || [];
    if (!records.length) {
      results.push({ index: `${symbol}_PRICE`, status: 'empty', error: 'No price data' });
      return;
    }

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

    results.push({
      index: `${symbol}_PRICE`,
      status: 'saved',
      strikes: records.length
    });
  } catch (err: any) {
    results.push({ index: `${symbol}_PRICE`, status: 'error', error: err.message });
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
  { key: 'NIFTY50', name: 'Nifty 50', exchange: 'NSE', expiry: 'weekly', upstoxType: 'nifty_chain' },
  { key: 'SENSEX', name: 'Sensex', exchange: 'BSE', expiry: 'weekly', upstoxType: 'sensex_chain' },
  { key: 'BANKNIFTY', name: 'Bank Nifty', exchange: 'NSE', expiry: 'monthly', upstoxType: 'banknifty_chain' },
  { key: 'FINNIFTY', name: 'Fin Nifty', exchange: 'NSE', expiry: 'monthly', upstoxType: 'finnifty_chain' },
  { key: 'MIDCAPNIFTY', name: 'Midcap Nifty', exchange: 'NSE', expiry: 'monthly', upstoxType: 'midcapnifty_chain' },
  { key: 'NIFTYNEXT50', name: 'Nifty Next 50', exchange: 'NSE', expiry: 'monthly', upstoxType: 'niftynext50_chain' },
  { key: 'BANKEX', name: 'Bankex', exchange: 'BSE', expiry: 'monthly', upstoxType: 'bankex_chain' },
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

  // Load config from Supabase (admin customizations)
  const { indices, sectors } = await loadConfig();

  // ── NSE Tuesday expiries ──
  const nseWeekly = getNext4Weekly(2);    // Tuesday
  const nseMonthly = getNext4Monthly(2); // Last Tuesday

  // ── BSE Thursday expiries ──
  const bseWeekly = getNext4Weekly(4);    // Thursday
  const bseMonthly = getNext4Monthly(4); // Last Thursday

  // ── STEP 1: PROCESS ALL INDICES ──
  for (const idx of indices) {
    await new Promise(r => setTimeout(r, 500)); // small delay between calls

    let expiries: string[] = [];

    if (idx.expiry === 'weekly') {
      // Weekly indices get 4 weekly + 4 monthly
      if (idx.exchange === 'NSE') {
        expiries = [...new Set([...nseWeekly, ...nseMonthly])];
      } else {
        expiries = [...new Set([...bseWeekly, ...bseMonthly])];
      }
    } else {
      // Monthly indices get 4 monthly only
      if (idx.exchange === 'NSE') {
        expiries = nseMonthly;
      } else {
        expiries = bseMonthly;
      }
    }

    const isZ2H = idx.key === 'NIFTY50' || idx.key === 'SENSEX';
    await processIndex(idx.key, idx.name, idx.upstoxType, expiries, today, results, isZ2H);
  }

  // ── STEP 2: PROCESS ALL STOCKS ──
  const allStocks = sectors.flatMap((s: any) => s.stocks);
  const uniqueStocks = [...new Set(allStocks)] as string[];

  // Stock monthly expiries (NSE stocks expire last Tuesday)
  const stockExpiries = nseMonthly;

  for (const stock of uniqueStocks) {
    await new Promise(r => setTimeout(r, 300)); // small delay

    // Fetch options (4 monthly expiries)
    await processStockOptions(stock, stockExpiries, today, results);

    await new Promise(r => setTimeout(r, 300));

    // Fetch price data (14 months historical)
    await processStockPrice(stock, results);
  }

  console.log(`✅ Auto-fetch complete: ${results.filter(r => r.status === 'saved').length} saved, ${results.filter(r => r.status === 'error').length} errors`);
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
  const data = await callEdge('stock_chain', symbol, expiry);
  const strikes = data?.strikes || {};
  if (!Object.keys(strikes).length) throw new Error(`No options data for ${symbol}`);

  const today = new Date().toISOString().split('T')[0];
  const { data: existing } = await supabase
    .from('market_data').select('id')
    .eq('index_name', symbol.toUpperCase())
    .eq('expiry', expiry).eq('trade_date', today).limit(1);

  if (!existing || existing.length === 0) {
    await supabase.from('market_data').insert({
      index_name: symbol.toUpperCase(), expiry,
      trade_date: today, strike_data: strikes,
      uploaded_by: 'auto-fetch', category: 'stock', timeframe: 'daily'
    });
  }
  return strikes;
}
