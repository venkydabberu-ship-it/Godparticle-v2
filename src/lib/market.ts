import { supabase } from './supabase';

// ── STANDARDIZED INDEX NAMES ──
export const INDEX_DISPLAY: Record<string, string> = {
  'NIFTY50': 'Nifty 50',
  'SENSEX': 'Sensex',
  'BANKNIFTY': 'Bank Nifty',
  'FINNIFTY': 'Fin Nifty',
  'MIDCAPNIFTY': 'Midcap Nifty',
  'NIFTYNEXT50': 'Nifty Next 50',
  'BANKEX': 'Bankex',
};

export const ALL_INDICES = Object.keys(INDEX_DISPLAY);

// Gap step per index
export function getGapStep(indexName: string): number {
  return indexName === 'SENSEX' || indexName === 'BANKEX' ? 100 : 50;
}

export function getMaxGap(indexName: string): number {
  return indexName === 'SENSEX' || indexName === 'BANKEX' ? 1500 : 500;
}

// ── FETCH LAST N DAYS FROM DATABANK ──
export async function getMarketData(
  indexName: string,
  expiry: string,
  days: number = 6
): Promise<any[]> {
  // Normalize expiry to YYYY-MM-DD
  const normalizedExpiry = normalizeExpiry(expiry);
  const normalizedName = normalizeIndexName(indexName);

  const { data, error } = await supabase
    .from('market_data')
    .select('*')
    .eq('index_name', normalizedName)
    .eq('expiry', normalizedExpiry)
    .order('trade_date', { ascending: true })
    .limit(days * 3); // get more, take last N

  if (error) throw new Error(error.message);
  return (data || []).slice(-days);
}

// ── GET AVAILABLE EXPIRIES FOR AN INDEX ──
export async function getAvailableExpiries(indexName: string): Promise<string[]> {
  const normalizedName = normalizeIndexName(indexName);
  const { data, error } = await supabase
    .from('market_data')
    .select('expiry')
    .eq('index_name', normalizedName)
    .order('expiry', { ascending: true });

  if (error) throw new Error(error.message);
  const expiries = [...new Set((data || []).map((r: any) => r.expiry))];
  return expiries;
}

// ── GET AVAILABLE TRADE DATES FOR INDEX+EXPIRY ──
export async function getAvailableDates(indexName: string, expiry: string): Promise<string[]> {
  const normalizedName = normalizeIndexName(indexName);
  const normalizedExpiry = normalizeExpiry(expiry);
  const { data, error } = await supabase
    .from('market_data')
    .select('trade_date')
    .eq('index_name', normalizedName)
    .eq('expiry', normalizedExpiry)
    .order('trade_date', { ascending: true });

  if (error) return [];
  return (data || []).map((r: any) => r.trade_date);
}

// ── NORMALIZE HELPERS ──
export function normalizeIndexName(name: string): string {
  const map: Record<string, string> = {
    'nifty 50': 'NIFTY50', 'nifty50': 'NIFTY50',
    'sensex': 'SENSEX',
    'bank nifty': 'BANKNIFTY', 'banknifty': 'BANKNIFTY',
    'fin nifty': 'FINNIFTY', 'finnifty': 'FINNIFTY',
    'midcap nifty': 'MIDCAPNIFTY', 'midcapnifty': 'MIDCAPNIFTY',
    'nifty next 50': 'NIFTYNEXT50', 'niftynext50': 'NIFTYNEXT50',
    'bankex': 'BANKEX',
  };
  return map[name.toLowerCase()] || name.toUpperCase().replace(/\s+/g, '');
}

export function normalizeExpiry(expiry: string): string {
  if (!expiry) return '';
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return expiry;
  // DD-Mon-YYYY format
  const months: Record<string, string> = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
    'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
  };
  const parts = expiry.split('-');
  if (parts.length === 3) {
    const d = parts[0].padStart(2, '0');
    const m = months[parts[1].toLowerCase()] || parts[1];
    const y = parts[2];
    return `${y}-${m}-${d}`;
  }
  return expiry;
}

export function formatExpiryDisplay(expiry: string): string {
  if (!expiry) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
    const [y, m, d] = expiry.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
  }
  return expiry;
}

// ── PARSE NSE CSV ──
export function parseNSEOptionChain(csvText: string): Record<string, any> {
  const lines = csvText.split(/\r?\n/);
  const result: Record<string, any> = {};
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const p = parseCSVLine(line);
    if (p.length < 12) continue;
    const strike = toNum(p[11]);
    if (!strike || strike < 1000) continue;
    result[strike] = {
      ce_oi: toNum(p[1]),
      ce_chng_oi: toNum(p[2]),
      ce_vol: toNum(p[3]),
      ce_ltp: toNum(p[5]),
      pe_ltp: toNum(p[17]),
      pe_vol: toNum(p[19]),
      pe_chng_oi: toNum(p[20]),
      pe_oi: toNum(p[21]),
    };
  }
  return result;
}

function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (const c of line) {
    if (c === '"') q = !q;
    else if (c === ',' && !q) { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

function toNum(v: any): number {
  const s = String(v || '').replace(/,/g, '').replace(/\n/g, '').trim();
  return (s === '-' || s === '') ? 0 : parseFloat(s) || 0;
}

// ── UPLOAD MARKET DATA (CSV upload path) ──
export async function uploadMarketData(
  indexName: string,
  expiry: string,
  tradeDate: string,
  strikeData: Record<string, any>,
  userId: string
): Promise<void> {
  const normalizedName = normalizeIndexName(indexName);
  const normalizedExpiry = normalizeExpiry(expiry);

  const { data: existing } = await supabase
    .from('market_data')
    .select('id')
    .eq('index_name', normalizedName)
    .eq('expiry', normalizedExpiry)
    .eq('trade_date', tradeDate)
    .limit(1);

  if (existing && existing.length > 0) {
    await supabase
      .from('market_data')
      .update({ strike_data: strikeData, uploaded_by: userId })
      .eq('index_name', normalizedName)
      .eq('expiry', normalizedExpiry)
      .eq('trade_date', tradeDate);
    return;
  }

  const { error } = await supabase.from('market_data').insert({
    index_name: normalizedName,
    expiry: normalizedExpiry,
    trade_date: tradeDate,
    strike_data: strikeData,
    uploaded_by: userId,
    timeframe: 'daily',
    category: ALL_INDICES.includes(normalizedName) ? 'index' : 'stock',
  });
  if (error) throw new Error(error.message);
}

// ── DEDUCT CREDITS ──
export async function useCredits(userId: string, amount: number): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', userId)
    .single();
  if (!profile) throw new Error('Profile not found');
  if (profile.credits < amount) throw new Error('Insufficient credits');
  await supabase
    .from('profiles')
    .update({ credits: profile.credits - amount })
    .eq('id', userId);
}

// ── SAVE ANALYSIS ──
export async function saveAnalysis(
  userId: string,
  indexName: string,
  strike: number,
  optionType: string,
  expiry: string,
  result: any
): Promise<void> {
  await supabase.from('analyses').insert({
    user_id: userId,
    index_name: normalizeIndexName(indexName),
    strike,
    option_type: optionType,
    expiry: normalizeExpiry(expiry),
    result,
  });
}

// ── GET USER ANALYSES ──
export async function getUserAnalyses(userId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('analyses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return [];
  return data || [];
}

// ══════════════════════════════════════════════════
// VERDICT ENGINE — 5-SIGNAL CONVICTION MODEL
//
// Factors in order of importance:
//   1. God Particle Position  (±30)  — is price above/below PCB?
//   2. Open Interest Trend    (±20)  — are fresh positions building?
//   3. Position Flow          (±20)  — new opens vs square-offs ratio
//   4. Price Momentum         (±15)  — did price move in our favour each day?
//   5. Triple Alignment       (±15)  — lc vs VWAP vs OI-WAP vs PCB
//
// Max = +100, Min = −70, Range = 170 points
// Conviction = (rawScore + 70) / 170 × 100  →  0–100
// ══════════════════════════════════════════════════
export function computeVerdictSignals(
  data: any[],
  decomp: any[],
  pcb: number,
  vwap: number,
  oiwap: number,
  dte: number,
  optType: string
): any {
  const isCE = optType === 'CE';
  const lc   = data[data.length - 1].close;
  let rawScore = 0;
  const signals: any[] = [];

  // ── Signal 1: God Particle Position (±30) ──
  // For both CE and PE buyers: lc > pcb means buyers above their cost basis.
  const pcbDiff  = (lc - pcb) / Math.max(pcb, 1);
  const [s1, l1] = pcbDiff > 0.20  ? [30, `${(pcbDiff*100).toFixed(0)}% above PCB — Writers losing control`]
                 : pcbDiff > 0.08  ? [20, 'Above PCB — Buyers in control']
                 : pcbDiff > 0.01  ? [10, 'Just above PCB — Mild buyer edge, watch closely']
                 : pcbDiff > -0.04 ? [0,  'AT PCB — War zone, explosive move expected']
                 : pcbDiff > -0.15 ? [-15,'Below PCB — Writers have the edge']
                 :                   [-25,`${Math.abs(pcbDiff*100).toFixed(0)}% below PCB — Writers dominating`];
  rawScore += s1;
  signals.push({ name: 'God Particle (PCB)', score: s1, max: 30, label: l1 });

  // ── Signal 2: Open Interest Trend (±20) ──
  // Rising OI = smart money is building new positions (conviction).
  // Falling OI = positions being closed (weakening conviction).
  const firstOI  = data[0].oi || 1;
  const lastOI   = data[data.length - 1].oi || 1;
  const oiPct    = (lastOI - firstOI) / firstOI;
  const [s2, l2] = oiPct > 0.25  ? [20, `OI +${(oiPct*100).toFixed(0)}% — Massive fresh position build`]
                 : oiPct > 0.08  ? [12, `OI +${(oiPct*100).toFixed(0)}% — Fresh positions accumulating`]
                 : oiPct > -0.05 ? [5,  'OI stable — Steady interest']
                 : oiPct > -0.20 ? [-8, `OI ${(oiPct*100).toFixed(0)}% — Unwinding visible`]
                 :                 [-15,`OI ${(oiPct*100).toFixed(0)}% — Heavy liquidation underway`];
  rawScore += s2;
  signals.push({ name: 'Open Interest Trend', score: s2, max: 20, label: l2 });

  // ── Signal 3: Position Flow — New Opens vs Square-offs (±20) ──
  // New opens dominating = fresh directional conviction.
  // Square-offs dominating = existing traders exiting (trend weakening).
  const totalNO  = decomp.reduce((s: number, d: any) => s + d.newOpens, 0);
  const totalSQ  = decomp.reduce((s: number, d: any) => s + d.squareoffs, 0);
  const openRatio = totalNO / Math.max(totalNO + totalSQ, 1);
  const [s3, l3] = openRatio > 0.65 ? [20, `${(openRatio*100).toFixed(0)}% New Opens — Strong fresh conviction`]
                 : openRatio > 0.54 ? [10, `${(openRatio*100).toFixed(0)}% New Opens — Moderate build-up`]
                 : openRatio > 0.46 ? [3,  `${(openRatio*100).toFixed(0)}% New Opens — Balanced / mixed flow`]
                 :                    [-8, `${(openRatio*100).toFixed(0)}% New Opens — Square-offs dominant, weakening`];
  rawScore += s3;
  signals.push({ name: 'Position Flow', score: s3, max: 20, label: l3 });

  // ── Signal 4: Price Momentum (±15) ──
  // Count how many days the option price moved in the direction that benefits
  // the buyer (up for both CE and PE buyers — they want the option price to rise).
  let favDays = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i].close > data[i - 1].close) favDays++;
  }
  const totalDays = Math.max(data.length - 1, 1);
  const momRatio  = favDays / totalDays;
  const [s4, l4] = momRatio >= 0.80 ? [15, `${favDays}/${totalDays} days rising — Relentless momentum`]
                 : momRatio >= 0.60  ? [8,  `${favDays}/${totalDays} days rising — Consistent direction`]
                 : momRatio >= 0.40  ? [0,  `${favDays}/${totalDays} days rising — Mixed, no clear trend`]
                 :                     [-10,`Only ${favDays}/${totalDays} rising days — Against the trend`];
  rawScore += s4;
  signals.push({ name: 'Price Momentum', score: s4, max: 15, label: l4 });

  // ── Signal 5: Triple Alignment (±15) ──
  // Perfect order for option buyer: lc > VWAP > OI-WAP > PCB
  // This means current price has risen above every institutional reference level.
  let s5 = 0, l5 = '';
  if (lc > vwap && lc > oiwap && lc > pcb) {
    s5 = vwap > oiwap ? 15 : 10;
    l5 = vwap > oiwap
      ? 'lc > VWAP > OI-WAP > PCB — Perfect bull alignment'
      : 'lc above all metrics — Strong institutional alignment';
  } else if (lc > vwap && lc > pcb) {
    s5 = 5; l5 = 'Above VWAP and PCB — Solid alignment';
  } else if (lc > vwap) {
    s5 = 2; l5 = 'Above VWAP but not all metrics — Partial alignment';
  } else if (lc > pcb) {
    s5 = 0; l5 = 'Above PCB, below VWAP — Mixed signals';
  } else {
    s5 = -12; l5 = 'Below VWAP and PCB — Bearish institutional alignment';
  }
  rawScore += s5;
  signals.push({ name: 'Triple Alignment', score: s5, max: 15, label: l5 });

  // ── Normalize to 0–100 ──
  const conviction    = Math.min(100, Math.max(0, Math.round((rawScore + 70) / 170 * 100)));

  // ── Bias & Recommendation ──
  const bias           = conviction >= 72 ? 'STRONG BULL'
                       : conviction >= 58 ? 'BULL'
                       : conviction >= 44 ? 'NEUTRAL'
                       : conviction >= 30 ? 'BEAR'
                       : 'STRONG BEAR';
  const recommendation = conviction >= 58 ? 'BUY'
                       : conviction >= 42 ? 'WAIT'
                       : 'AVOID';

  // ── DTE advisory ──
  const dteNote = dte <= 0 ? '⚠️ EXPIRY DAY — Exit ALL by 12:30 PM. Intrinsic value only.'
                : dte === 1 ? '⚠️ EXPIRY EVE — Theta is brutal. Exit by 12:30 PM tomorrow.'
                : dte <= 2  ? `⏳ ${dte}d DTE — Theta aggressive. Quick intraday exits only.`
                : dte <= 4  ? `⏳ ${dte}d DTE — Theta moderate. Normal intraday targets.`
                :             `✅ ${dte}d DTE — Comfortable window. Standard targets apply.`;

  // ── Action Line ──
  const actionNote = recommendation === 'BUY'
    ? '📗 ENTER in buy zone after 15-min confirmation. Exit 50% at T1, 30% at T2, hold 20%.'
    : recommendation === 'WAIT'
    ? `⏳ WAIT — Watch for price to cross PCB (₹${pcb.toFixed(0)}) with volume before entering.`
    : '🚫 AVOID — Against institutional flow. Sitting out IS a valid trade.';

  const verdictText = [
    `${optType} is ${pcbDiff > 0 ? 'ABOVE' : 'BELOW'} God Particle ₹${pcb.toFixed(1)} by ${Math.abs(pcbDiff*100).toFixed(1)}%.`,
    `OI ${oiPct > 0 ? `building (+${(oiPct*100).toFixed(0)}%)` : `unwinding (${(oiPct*100).toFixed(0)}%)`} with ${(openRatio*100).toFixed(0)}% new positions vs ${(100-openRatio*100).toFixed(0)}% square-offs.`,
    `${favDays}/${totalDays} sessions showed price appreciation.`,
    dteNote,
    actionNote,
  ].join(' ');

  return { conviction, bias, recommendation, signals, verdictText, openRatio, oiPct };
}

// ══════════════════════════════════════════════════
// GOD PARTICLE ENGINE — CORRECT CALCULATION
// Based on validated 23900CE analysis
// ══════════════════════════════════════════════════
export function computeGodParticle(
  data: any[],
  strike: number,
  optType: string,
  expiry: string
): any {
  // STEP 1 — Volume Decomposition
  // Day 1: use chng_oi from CSV directly (NSE provides this)
  // If chng_oi = 0 and it's Day 1 → ΔOI = 0
  const decomp = data.map((d: any, i: number) => {
    const deltaOI = d.chng_oi !== undefined && d.chng_oi !== 0
      ? d.chng_oi
      : (i === 0 ? 0 : d.oi - data[i - 1].oi);

    // When OI grows more than volume → institutional writing
    // New Opens can't be negative
    const newOpens = Math.max(0, (d.volume + deltaOI) / 2);
    const squareoffs = Math.max(0, (d.volume - deltaOI) / 2);

    return { ...d, deltaOI, newOpens, squareoffs };
  });

  // STEP 2 — Three Constants
  const sumVol = data.reduce((s: number, d: any) => s + (d.volume || 0), 0) || 1;
  const sumOI = data.reduce((s: number, d: any) => s + (d.oi || 0), 0) || 1;
  const sumNO = decomp.reduce((s: number, d: any) => s + d.newOpens, 0) || 1;

  // VWAP uses typical price = (H+L+C)/3
  // Since NSE option chain CSV only has LTP (close), use close as typical price
  const vwap = data.reduce((s: number, d: any) => s + d.close * d.volume, 0) / sumVol;
  const oiwap = data.reduce((s: number, d: any) => s + d.close * d.oi, 0) / sumOI;

  // PCB = God Particle = Σ(Close × New Opens) / Σ(New Opens)
  const pcb = decomp.reduce((s: number, d: any) => s + d.close * d.newOpens, 0) / sumNO;

  const lastClose = data[data.length - 1].close;
  const dte = getDTE(expiry);

  // Calendar days elapsed since the last data point was captured.
  // This drives the theta-decay correction in the scenario matrix:
  // 0 = same-day analysis, 2 = Saturday/Sunday after Friday close, 3 = Monday view of Friday data.
  const lastDataDate = data[data.length - 1]?.date;
  let daysSinceClose = 0;
  if (lastDataDate) {
    const lastMs  = new Date(lastDataDate + 'T00:00:00').getTime();
    const todayMs = new Date().setHours(0, 0, 0, 0) as number;
    daysSinceClose = Math.max(0, Math.round((todayMs - lastMs) / 86400000));
  }

  const pcbRounded   = Math.round(pcb   * 100) / 100;
  const vwapRounded  = Math.round(vwap  * 100) / 100;
  const oiwapRounded = Math.round(oiwap * 100) / 100;

  const verdict = computeVerdictSignals(
    data, decomp, pcbRounded, vwapRounded, oiwapRounded, dte, optType
  );

  return {
    data,
    decomp,
    strike,
    optType,
    expiry,
    dte,
    daysSinceClose,
    vwap:  vwapRounded,
    oiwap: oiwapRounded,
    pcb:   pcbRounded,
    lc:    lastClose,
    conviction:     verdict.conviction,
    bias:           verdict.bias,
    recommendation: verdict.recommendation,
    signals:        verdict.signals,
    verdictText:    verdict.verdictText,
    openRatio:      verdict.openRatio,
  };
}

export function getDTE(expiry: string): number {
  try {
    const normalized = normalizeExpiry(expiry);
    const d = new Date(normalized + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(0, Math.ceil((d.getTime() - today.getTime()) / 86400000));
  } catch { return 5; }
}

// ── SCENARIO MATRIX GENERATOR ──
//
// Invariant guaranteed for every non-avoided row:
//   sl < openEst < entryLow < entryHigh < target1 < target2
//
// openEst is a THETA-ADJUSTED estimate of where the option will open.
// Problem with using raw lc: on weekends and multi-day gaps, theta erodes
// the option price significantly even when the underlying opens flat.
// Solution: split lc into (core value + time premium) and decay only the
// time premium based on calendar days elapsed since last close.
//
// Core value  ≈ min(PCB, lc × 0.85)  — acts as intrinsic/institutional floor
// Time premium = lc − core value      — the portion that decays with theta
//
// Theta factor = baseTheta(DTE) × dayPenalty(daysSinceClose)
// thetaBase    = core + timePremium × thetaFactor
// All scenarios scale their openEst from thetaBase, not raw lc.
//
export function generateScenarioMatrix(
  result: any,
  indexName: string
): any[] {
  const lc             = result.lc;
  const pcb            = result.pcb;
  const dte            = result.dte;
  const daysSinceClose = result.daysSinceClose ?? 0;
  const isCE           = result.optType === 'CE';

  // Theta discount applied to targets
  const td = dte <= 0 ? 0.50
           : dte <= 1 ? 0.65
           : dte <= 2 ? 0.78
           : dte <= 4 ? 0.92
           : 1.00;

  const gapStep    = getGapStep(indexName);
  const maxGap     = getMaxGap(indexName);
  const avoidLimit = maxGap * 0.40; // 200 for Nifty, 600 for Sensex

  // ── Theta-adjusted base price ──
  // Split option price into core (institutional floor) + time premium (decays).
  // This prevents flat-open showing raw lc after a weekend with DTE=2.
  const coreValue   = Math.min(pcb, Math.round(lc * 0.85));
  const timePremium = Math.max(lc - coreValue, 0);

  // How much of the time premium survives to next market open
  const baseTheta = dte <= 0 ? 0.00   // expiry — only intrinsic remains
                  : dte === 1 ? 0.35   // expiry eve — heavy decay
                  : dte === 2 ? 0.70   // 2 DTE — moderate decay
                  : dte <= 4 ? 0.88   // 3–4 DTE — mild decay
                  : 0.95;             // 5+ DTE — minimal daily decay

  // Extra penalty for calendar days since last close (Sat/Sun, long weekends)
  const dayPenalty = daysSinceClose >= 3 ? 0.50
                   : daysSinceClose === 2 ? 0.65   // typical weekend
                   : daysSinceClose === 1 ? 0.85   // overnight weekday
                   : 1.00;                         // same session

  const thetaFactor = baseTheta * dayPenalty;

  // thetaBase = realistic flat-open price for next session
  const thetaBase = Math.max(
    Math.round(coreValue + timePremium * thetaFactor),
    1
  );

  const gaps: number[] = [];
  for (let g = maxGap; g >= -maxGap; g -= gapStep) gaps.push(g);

  return gaps.map(gap => {
    const absGap    = Math.abs(gap);
    const label     = gap === 0 ? 'Flat Open ⭐'
                    : gap > 0   ? `Gap Up ${gap} pts`
                    : `Gap Down ${absGap} pts`;

    const isFav     = isCE ? (gap > 0) : (gap < 0);
    const isNeutral = gap === 0;
    const isAdv     = isCE ? (gap < 0) : (gap > 0);
    const avoid     = isAdv && absGap >= avoidLimit;

    // ── Open Estimate — built on theta-adjusted base, not raw lc ──
    // Proportional scaling: gap / maxGap gives a 0–1 ratio consistent across
    // Nifty (±500, 50pt steps) and Sensex (±1500, 100pt steps).
    let openEst: number;
    if (isFav) {
      openEst = Math.round(thetaBase * (1 + (absGap / maxGap) * 0.85));
    } else if (isNeutral) {
      openEst = thetaBase; // flat open = theta-adjusted base directly
    } else {
      openEst = Math.round(thetaBase * Math.max(1 - (absGap / maxGap) * 0.70, 0.10));
    }
    openEst = Math.max(openEst, 1);

    if (avoid) {
      return {
        gap, label, openEst,
        entryLow: 0, entryHigh: 0, target1: 0, target2: 0, sl: 0,
        avoid: true, isFlat: false, isBest: false,
      };
    }

    // ── PCB-aware Buy Zone — STRICTLY above openEst ──
    //
    // PCB is the God Particle: the most important price level.
    // The buy zone is anchored to PCB when PCB is close to the open estimate:
    //
    //   openEst >= pcb          → option already above PCB (strong momentum)
    //                             Tight zone: ×1.04 to ×1.12
    //
    //   pcb is 0–15% above openEst → PCB is the key level to break
    //                             Anchor: pcb×1.02 to pcb×1.10
    //                             (enter only AFTER confirming above PCB)
    //
    //   pcb is >15% above openEst  → PCB is far; standard zone below PCB
    //                             Standard: ×1.06 to ×1.17
    //                             (PCB itself becomes the T1 target)
    //
    const pcbGapFrac = (pcb - openEst) / Math.max(pcb, 1); // positive = PCB above open

    let entryLow: number;
    let entryHigh: number;

    if (pcbGapFrac <= 0) {
      // Option opened above PCB — confirmation already done, tight entry
      entryLow  = Math.max(Math.round(openEst * 1.04), openEst + 1);
      entryHigh = Math.max(Math.round(openEst * 1.12), entryLow  + 1);
    } else if (pcbGapFrac <= 0.15) {
      // PCB is within 15% above open — anchor to PCB breakout
      entryLow  = Math.max(Math.round(pcb * 1.02), openEst + 1);
      entryHigh = Math.max(Math.round(pcb * 1.10), entryLow  + 1);
    } else {
      // PCB is far above — standard zone; PCB will be first target
      entryLow  = Math.max(Math.round(openEst * 1.06), openEst + 1);
      entryHigh = Math.max(Math.round(openEst * 1.17), entryLow  + 1);
    }

    // ── Targets — STRICTLY above entryHigh ──
    //
    // R:R anchored to entryLow and sl for disciplined position sizing:
    //   risk     = entryLow − sl  (worst-case loss from entry)
    //   T1       = entryLow + 2 × risk  (2:1 R:R)    ← institutional standard
    //   T2       = entryLow + 3.5 × risk (3.5:1 R:R) ← let winners run
    //
    // PCB overrides T1 when PCB is a meaningful target (above entryHigh).
    // Theta discount (td) is applied for near-expiry options.
    //
    let target1: number;
    let target2: number;
    const sl_for_rr = Math.round(openEst * 0.72); // same SL formula
    const risk      = Math.max(entryLow - sl_for_rr, 1);

    const rrT1 = Math.round((entryLow + 2.0 * risk) * td);
    const rrT2 = Math.round((entryLow + 3.5 * risk) * td);

    if (isFav) {
      // Favorable scenario: PCB may already be below entry; use R:R
      target1 = Math.max(rrT1, pcbGapFrac < 0 ? Math.round(pcb * 1.15 * td) : rrT1);
      target2 = Math.max(rrT2, target1 + 1);
    } else if (isNeutral) {
      // Flat: PCB is the natural magnet; T1 = PCB if above entryHigh, else R:R
      target1 = pcb > entryHigh ? Math.round(Math.max(pcb, rrT1) * td) : rrT1;
      target2 = Math.max(rrT2, target1 + 1);
    } else {
      // Adverse: conservative 1.5:1 and 2.5:1 R:R (option fighting the trend)
      target1 = Math.round((entryLow + 1.5 * risk) * td);
      target2 = Math.round((entryLow + 2.5 * risk) * td);
    }
    target1 = Math.max(target1, entryHigh + 1);
    target2 = Math.max(target2, target1  + 1);

    // ── Stop Loss — STRICTLY below openEst ──
    const sl = Math.max(Math.round(openEst * 0.72), 1);

    const isBest = gap === 0
      || (isCE  && gap > 0 && gap <= gapStep * 2)
      || (!isCE && gap < 0 && gap >= -(gapStep * 2));

    return {
      gap, label, openEst,
      entryLow, entryHigh,
      target1, target2, sl,
      avoid: false, isFlat: gap === 0, isBest,
    };
  });
}

