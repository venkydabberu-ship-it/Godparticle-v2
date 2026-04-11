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
  vix: number
) {
  try {
    await supabase.from('z2h_snapshots').insert({
      index_name: indexName,
      expiry_date: expiryDate,
      snapshot_type: snapshotType,
      spot_price: spotPrice,
      max_pain: maxPain,
      vix
    });
    return { status: 'saved' };
  } catch (err) {
    return { status: 'error' };
  }
}

// ── CALCULATE MAX PAIN ──
function calculateMaxPain(strikes: Record<string, any>): number {
  const strikeList = Object.keys(strikes).map(Number).sort((a, b) => a - b);
  let minPain = Infinity;
  let maxPainStrike = strikeList[0];

  strikeList.forEach(testStrike => {
    let totalPain = 0;
    strikeList.forEach(s => {
      const sd = strikes[s];
      if (testStrike > s) totalPain += (testStrike - s) * (sd.ce_oi || 0);
      if (testStrike < s) totalPain += (s - testStrike) * (sd.pe_oi || 0);
    });
    if (totalPain < minPain) {
      minPain = totalPain;
      maxPainStrike = testStrike;
    }
  });

  return maxPainStrike;
}

// ── MAIN AUTO FETCH ──
export async function runDailyAutoFetch(adminUserId: string) {
  const results: any[] = [];
  const today = new Date().toISOString().split('T')[0];

  console.log(`🚀 Starting auto-fetch for ${today}`);

  // ── FETCH NIFTY 50 ──
  try {
    const expiryData = await callEdge('nifty_chain');
    const validExpiries = expiryData.filter((e: any) =>
      e.strikes && Object.keys(e.strikes).length > 0
    );

    if (validExpiries.length === 0) {
      results.push({ index: 'NIFTY50', status: 'error', error: 'No live data — market may be closed' });
    } else {
      for (const item of expiryData) {
        if (!item.expiry) continue;
        const strikeCount = Object.keys(item.strikes || {}).length;

        if (strikeCount === 0) {
          results.push({ index: 'NIFTY50', expiry: item.expiry, status: 'empty', error: 'No strike data' });
          continue;
        }

        const result = await saveMarketDataAuto('NIFTY50', item.expiry, today, item.strikes);
        results.push({
          index: 'NIFTY50',
          expiry: item.expiry,
          status: result.status,
          strikes: strikeCount
        });

        // Save Z2H snapshot
        const maxPain = calculateMaxPain(item.strikes);
        const expiryDate = new Date(item.expiry);
        const todayDate = new Date(today);
        const dayBefore = new Date(expiryDate);
        dayBefore.setDate(expiryDate.getDate() - 1);

        if (expiryDate.toDateString() === todayDate.toDateString()) {
          await saveZ2HSnapshot('NIFTY', item.expiry, 'EXPIRY_EOD', item.spotPrice || 0, maxPain, 0);
        } else if (dayBefore.toDateString() === todayDate.toDateString()) {
          await saveZ2HSnapshot('NIFTY', item.expiry, 'DAY_BEFORE', item.spotPrice || 0, maxPain, 0);
        }
      }
    }
  } catch (err: any) {
    results.push({ index: 'NIFTY50', status: 'error', error: err.message });
  }

  await new Promise(r => setTimeout(r, 1000));

  // ── FETCH SENSEX ──
  try {
    const expiryData = await callEdge('sensex_chain');
    const validExpiries = expiryData.filter((e: any) =>
      e.strikes && Object.keys(e.strikes).length > 0
    );

    if (validExpiries.length === 0) {
      results.push({ index: 'SENSEX', status: 'error', error: 'No live data — market may be closed' });
    } else {
      for (const item of expiryData) {
        if (!item.expiry) continue;
        const strikeCount = Object.keys(item.strikes || {}).length;

        if (strikeCount === 0) {
          results.push({ index: 'SENSEX', expiry: item.expiry, status: 'empty', error: 'No strike data' });
          continue;
        }

        const result = await saveMarketDataAuto('SENSEX', item.expiry, today, item.strikes);
        results.push({
          index: 'SENSEX',
          expiry: item.expiry,
          status: result.status,
          strikes: strikeCount
        });
      }
    }
  } catch (err: any) {
    results.push({ index: 'SENSEX', status: 'error', error: err.message });
  }

  console.log(`✅ Auto-fetch complete:`, results);
  return results;
}

// ── AUTO FETCH STOCK PRICE ──
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

// ── AUTO FETCH STOCK OPTIONS ──
export async function autoFetchStockOptions(
  symbol: string,
  expiry: string
): Promise<Record<string, any>> {
  const data = await callEdge('stock_chain', symbol, expiry);
  const strikes = data?.strikes || {};

  if (!Object.keys(strikes).length) {
    throw new Error(`No options data for ${symbol}`);
  }

  const today = new Date().toISOString().split('T')[0];

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
