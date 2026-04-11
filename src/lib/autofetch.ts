import { supabase } from './supabase';

// ── CALL EDGE FUNCTION ──
async function callNSE(type: string, symbol?: string, expiry?: string) {
  const { data, error } = await supabase.functions.invoke('fetch-nse-data', {
    body: { type, symbol, expiry }
  });
  if (error) throw new Error(`Edge function error: ${error.message}`);
  if (!data?.success) throw new Error(data?.error || 'Fetch failed');
  return data.data;
}

// ── GET NEXT 4 EXPIRY DATES ──
export function getNext4Expiries(index: 'NIFTY' | 'SENSEX'): string[] {
  const dates: string[] = [];
  const now = new Date();
  const targetDay = index === 'SENSEX' ? 4 : 2;
  let count = 0;
  for (let i = 0; i <= 35 && count < 4; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    if (d.getDay() === targetDay) {
      dates.push(d.toISOString().split('T')[0]);
      count++;
    }
  }
  return dates;
}

// ── FORMAT EXPIRY FOR NSE ──
function formatExpiryForNSE(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${String(d.getDate()).padStart(2,'0')}${months[d.getMonth()]}${d.getFullYear()}`;
}

// ── PARSE OPTION CHAIN ──
export function parseOptionChain(records: any[]): Record<string, any> {
  const strikes: Record<string, any> = {};
  records.forEach((r: any) => {
    const strike = r.strikePrice;
    if (!strike) return;
    strikes[strike] = {
      ce_ltp: r.CE?.lastPrice || 0,
      ce_oi: r.CE?.openInterest || 0,
      ce_chng_oi: r.CE?.changeinOpenInterest || 0,
      ce_vol: r.CE?.totalTradedVolume || 0,
      pe_ltp: r.PE?.lastPrice || 0,
      pe_oi: r.PE?.openInterest || 0,
      pe_chng_oi: r.PE?.changeinOpenInterest || 0,
      pe_vol: r.PE?.totalTradedVolume || 0,
    };
  });
  return strikes;
}

// ── CALCULATE MAX PAIN ──
export function calculateMaxPain(records: any[]): number {
  if (!records.length) return 0;
  const strikes = [...new Set(records.map((r: any) => r.strikePrice))].sort((a, b) => a - b);
  let minPain = Infinity;
  let maxPainStrike = strikes[0];
  strikes.forEach(testStrike => {
    let totalPain = 0;
    records.forEach(r => {
      if (r.CE && testStrike > r.strikePrice)
        totalPain += (testStrike - r.strikePrice) * (r.CE.openInterest || 0);
      if (r.PE && testStrike < r.strikePrice)
        totalPain += (r.strikePrice - testStrike) * (r.PE.openInterest || 0);
    });
    if (totalPain < minPain) { minPain = totalPain; maxPainStrike = testStrike; }
  });
  return maxPainStrike;
}

// ── SAVE MARKET DATA ──
export async function saveMarketDataAuto(
  indexName: string,
  expiry: string,
  tradeDate: string,
  strikeData: Record<string, any>
) {
  try {
    const { data: existing } = await supabase
      .from('market_data')
      .select('id')
      .eq('index_name', indexName)
      .eq('expiry', expiry)
      .eq('trade_date', tradeDate)
      .limit(1);

    if (existing && existing.length > 0) {
      return { status: 'duplicate' };
    }

    await supabase.from('market_data').insert({
      index_name: indexName,
      expiry,
      trade_date: tradeDate,
      strike_data: strikeData,
      uploaded_by: 'auto-fetch',
      timeframe: 'daily',
      category: 'index'
    });

    return { status: 'saved' };
  } catch (err) {
    console.error('saveMarketDataAuto error:', err);
    return { status: 'error' };
  }
}

// ── SAVE Z2H SNAPSHOT ──
export async function saveZ2HSnapshot(
  indexName: string,
  expiryDate: string,
  snapshotType: string,
  spotPrice: number,
  maxPain: number,
  vix: number,
  additionalData?: Record<string, any>
) {
  try {
    await supabase.from('z2h_snapshots').insert({
      index_name: indexName,
      expiry_date: expiryDate,
      snapshot_type: snapshotType,
      spot_price: spotPrice,
      max_pain: maxPain,
      vix,
      ...additionalData
    });
    return { status: 'saved' };
  } catch (err) {
    return { status: 'error' };
  }
}

// ── FETCH NIFTY OPTION CHAIN ──
export async function fetchNiftyOptionChain() {
  const data = await callNSE('nifty_chain');
  const records = data?.records?.data || [];
  const spotPrice = data?.records?.underlyingValue || 0;
  return { records, spotPrice };
}

// ── FETCH SENSEX OPTION CHAIN ──
export async function fetchSensexOptionChain(expiry: string) {
  const expiryFormatted = formatExpiryForNSE(expiry);
  const data = await callNSE('sensex_chain', undefined, expiryFormatted);
  return data;
}

// ── FETCH STOCK OPTION CHAIN ──
export async function fetchStockOptionChain(symbol: string) {
  const data = await callNSE('stock_chain', symbol);
  const records = data?.records?.data || [];
  const spotPrice = data?.records?.underlyingValue || 0;
  return { records, spotPrice };
}

// ── FETCH STOCK PRICE DATA ──
export async function fetchStockPriceData(symbol: string) {
  const data = await callNSE('stock_price', symbol);
  return data?.data || [];
}

// ── FETCH VIX ──
export async function fetchVIX(): Promise<number> {
  try {
    const data = await callNSE('vix');
    return data?.vix || 0;
  } catch {
    return 0;
  }
}

// ── FETCH BANKNIFTY ──
export async function fetchBankNiftyOptionChain() {
  const data = await callNSE('banknifty_chain');
  const records = data?.records?.data || [];
  const spotPrice = data?.records?.underlyingValue || 0;
  return { records, spotPrice };
}

// ── MAIN AUTO FETCH ──
export async function runDailyAutoFetch(adminUserId: string) {
  const results: any[] = [];
  const today = new Date().toISOString().split('T')[0];

  console.log(`🚀 Starting auto-fetch for ${today}`);

  // Fetch Nifty 50
  try {
    const niftyExpiries = getNext4Expiries('NIFTY');
    const chainData = await fetchNiftyOptionChain();

    if (chainData.records.length > 0) {
      const vixData = await fetchVIX();
      const maxPain = calculateMaxPain(chainData.records);

      for (const expiry of niftyExpiries) {
        const expiryFormatted = formatExpiryForNSE(expiry);
        const expiryRecords = chainData.records.filter(
          (r: any) => r.expiryDate === expiryFormatted
        );

        if (expiryRecords.length > 0) {
          const strikeData = parseOptionChain(expiryRecords);
          const result = await saveMarketDataAuto('NIFTY50', expiry, today, strikeData);
          results.push({ index: 'NIFTY50', expiry, status: result.status });

          // Check if expiry day or day before
          const expiryDate = new Date(expiry);
          const todayDate = new Date(today);
          const dayBefore = new Date(expiryDate);
          dayBefore.setDate(expiryDate.getDate() - 1);

          if (expiryDate.toDateString() === todayDate.toDateString()) {
            await saveZ2HSnapshot('NIFTY', expiry, 'EXPIRY_EOD', chainData.spotPrice, maxPain, vixData);
          } else if (dayBefore.toDateString() === todayDate.toDateString()) {
            await saveZ2HSnapshot('NIFTY', expiry, 'DAY_BEFORE', chainData.spotPrice, maxPain, vixData);
          }
        }
      }
    }
  } catch (err: any) {
    results.push({ index: 'NIFTY50', status: 'error', error: err.message });
  }

  await new Promise(r => setTimeout(r, 1000));

  // Fetch Sensex
  try {
    const sensexExpiries = getNext4Expiries('SENSEX');
    for (const expiry of sensexExpiries) {
      try {
        const chainData = await fetchSensexOptionChain(expiry);
        if (chainData) {
          results.push({ index: 'SENSEX', expiry, status: 'fetched' });
        }
        await new Promise(r => setTimeout(r, 500));
      } catch (err: any) {
        results.push({ index: 'SENSEX', expiry, status: 'error', error: err.message });
      }
    }
  } catch (err: any) {
    results.push({ index: 'SENSEX', status: 'error', error: err.message });
  }

  console.log(`✅ Auto-fetch complete:`, results);
  return results;
}

// ── AUTO FETCH STOCK DATA ──
export async function autoFetchStockPrice(symbol: string): Promise<any[]> {
  const records = await fetchStockPriceData(symbol);
  if (!records.length) throw new Error(`No data for ${symbol}`);

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

// ── AUTO FETCH STOCK OPTIONS ──
export async function autoFetchStockOptions(symbol: string, expiry: string): Promise<Record<string, any>> {
  const { records } = await fetchStockOptionChain(symbol);
  if (!records.length) throw new Error(`No options data for ${symbol}`);

  const strikes = parseOptionChain(records);
  const today = new Date().toISOString().split('T')[0];

  // Check duplicate
  const { data: existing } = await supabase
    .from('market_data')
    .select('id')
    .eq('index_name', symbol.toUpperCase())
    .eq('expiry', expiry)
    .eq('trade_date', today)
    .limit(1);

  if (!existing || existing.length === 0) {
    await supabase.from('market_data').insert({
      index_name: symbol.toUpperCase(),
      expiry,
      trade_date: today,
      strike_data: strikes,
      uploaded_by: 'auto-fetch',
      category: 'stock',
      timeframe: 'daily'
    });
  }

  return strikes;
}
