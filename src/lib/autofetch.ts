import { supabase } from './supabase';

// ── NSE HEADERS (required to avoid 403) ──
const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/option-chain',
};

// ── GET NEXT 4 EXPIRY DATES ──
export function getNext4Expiries(index: 'NIFTY' | 'SENSEX'): string[] {
  const dates: string[] = [];
  const now = new Date();
  const targetDay = index === 'SENSEX' ? 4 : 2; // Thu=4, Tue=2
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

// ── FORMAT EXPIRY FOR NSE API ──
function formatExpiryForNSE(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${String(d.getDate()).padStart(2,'0')}${months[d.getMonth()]}${d.getFullYear()}`;
}

// ── FETCH NIFTY OPTION CHAIN ──
export async function fetchNiftyOptionChain(expiry: string) {
  try {
    const url = `https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY`;
    const response = await fetch(url, { headers: NSE_HEADERS });
    if (!response.ok) throw new Error(`NSE API error: ${response.status}`);
    const data = await response.json();

    const expiryFormatted = formatExpiryForNSE(expiry);
    const records = data.records?.data?.filter(
      (r: any) => r.expiryDate === expiryFormatted
    ) || [];

    const spotPrice = data.records?.underlyingValue || 0;
    return { records, spotPrice, expiry };
  } catch (err) {
    console.error('fetchNiftyOptionChain error:', err);
    return null;
  }
}

// ── FETCH SENSEX OPTION CHAIN ──
export async function fetchSensexOptionChain(expiry: string) {
  try {
    const expiryFormatted = formatExpiryForNSE(expiry);
    const url = `https://api.bseindia.com/BseIndiaAPI/api/optionChain/w?productid=BSXOPT&scripcd=SENSEX&type=C&expiry=${expiryFormatted}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.bseindia.com/',
        'Origin': 'https://www.bseindia.com'
      }
    });
    if (!response.ok) throw new Error(`BSE API error: ${response.status}`);
    const data = await response.json();
    return { records: data, expiry };
  } catch (err) {
    console.error('fetchSensexOptionChain error:', err);
    return null;
  }
}

// ── FETCH VIX ──
export async function fetchVIX(): Promise<number> {
  try {
    const url = 'https://www.nseindia.com/api/allIndices';
    const response = await fetch(url, { headers: NSE_HEADERS });
    const data = await response.json();
    const vix = data.data?.find((d: any) => d.index === 'INDIA VIX');
    return vix?.last || 0;
  } catch {
    return 0;
  }
}

// ── PARSE OPTION CHAIN INTO STRIKE DATA ──
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
      if (r.CE && testStrike > r.strikePrice) {
        totalPain += (testStrike - r.strikePrice) * (r.CE.openInterest || 0);
      }
      if (r.PE && testStrike < r.strikePrice) {
        totalPain += (r.strikePrice - testStrike) * (r.PE.openInterest || 0);
      }
    });
    if (totalPain < minPain) {
      minPain = totalPain;
      maxPainStrike = testStrike;
    }
  });

  return maxPainStrike;
}

// ── SAVE MARKET DATA TO SUPABASE ──
export async function saveMarketDataAuto(
  indexName: string,
  expiry: string,
  tradeDate: string,
  strikeData: Record<string, any>
) {
  try {
    // Check duplicate
    const { data: existing } = await supabase
      .from('market_data')
      .select('id')
      .eq('index_name', indexName)
      .eq('expiry', expiry)
      .eq('trade_date', tradeDate)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`Data already exists for ${indexName} | ${expiry} | ${tradeDate}`);
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
    console.error('saveZ2HSnapshot error:', err);
    return { status: 'error' };
  }
}

// ── MAIN AUTO FETCH FUNCTION ──
// Call this daily after market close (3:30 PM IST)
export async function runDailyAutoFetch(adminUserId: string) {
  const results: any[] = [];
  const today = new Date().toISOString().split('T')[0];

  console.log(`🚀 Starting auto-fetch for ${today}`);

  // Fetch Nifty 50 — next 4 expiries
  const niftyExpiries = getNext4Expiries('NIFTY');
  for (const expiry of niftyExpiries) {
    try {
      console.log(`Fetching NIFTY | ${expiry}...`);
      const chainData = await fetchNiftyOptionChain(expiry);
      if (chainData && chainData.records.length > 0) {
        const strikeData = parseOptionChain(chainData.records);
        const result = await saveMarketDataAuto('NIFTY50', expiry, today, strikeData);
        results.push({ index: 'NIFTY50', expiry, status: result.status });

        // Save Z2H snapshot if expiry day
        const expiryDate = new Date(expiry);
        const todayDate = new Date(today);
        const isExpiryDay = expiryDate.toDateString() === todayDate.toDateString();
        const dayBefore = new Date(expiryDate);
        dayBefore.setDate(expiryDate.getDate() - 1);
        const isDayBefore = dayBefore.toDateString() === todayDate.toDateString();

        const vix = await fetchVIX();
        const maxPain = calculateMaxPain(chainData.records);

        if (isDayBefore) {
          await saveZ2HSnapshot('NIFTY', expiry, 'DAY_BEFORE', chainData.spotPrice, maxPain, vix);
        }
      }
    } catch (err) {
      results.push({ index: 'NIFTY50', expiry, status: 'error', error: err });
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 1000));
  }

  // Fetch Sensex — next 4 expiries
  const sensexExpiries = getNext4Expiries('SENSEX');
  for (const expiry of sensexExpiries) {
    try {
      console.log(`Fetching SENSEX | ${expiry}...`);
      const chainData = await fetchSensexOptionChain(expiry);
      if (chainData) {
        results.push({ index: 'SENSEX', expiry, status: 'fetched' });
      }
    } catch (err) {
      results.push({ index: 'SENSEX', expiry, status: 'error', error: err });
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`✅ Auto-fetch complete:`, results);
  return results;
}
