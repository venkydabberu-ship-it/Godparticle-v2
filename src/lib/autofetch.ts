import { supabase } from './supabase';

const ANON_KEY = 'sb_publishable_tP6_kK4impqvOQhdpko4UA_I6hWtPhd';
const FUNCTION_URL = 'https://msknryditzgmiawrxcea.supabase.co/functions/v1/fetch-nse-data';

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

// ── MAIN AUTO FETCH ──
export async function runDailyAutoFetch(adminUserId: string) {
  try {
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
        'apikey': ANON_KEY,
      },
      body: JSON.stringify({ type: 'full_auto_fetch' }),
      signal: AbortSignal.timeout(300000)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Auto fetch failed: ${err}`);
    }

    const result = await response.json();
    return result?.data || [];

  } catch (err: any) {
    throw new Error(err.message || 'Auto fetch failed');
  }
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





