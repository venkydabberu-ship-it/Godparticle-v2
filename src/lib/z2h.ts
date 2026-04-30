// ── NSE/BSE TRADING HOLIDAYS 2025–2026 ──
// Source: NSE official calendar (approximate for 2026 — admin should override via DB if needed)
export const NSE_HOLIDAYS = new Set([
  '2025-01-26','2025-02-19','2025-02-26','2025-03-25',
  '2025-04-10','2025-04-14','2025-04-18','2025-05-01',
  '2025-06-07','2025-08-15','2025-08-27','2025-10-02',
  '2025-10-20','2025-10-21','2025-11-05','2025-12-25',
  '2026-01-26','2026-03-20','2026-04-03','2026-05-01',
  '2026-08-15','2026-10-02','2026-10-26','2026-12-25',
]);

// ── INDEX CONFIGURATION ──
export interface IndexConfig {
  label: string;
  expiryType: 'weekly' | 'monthly';
  expiryDay: number; // 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  lotSize: number;
  strikeGap: number;
  edgeType: string;
  color: string;
  expiryLabel: string;
}

export const INDEX_CONFIG: Record<string, IndexConfig> = {
  NIFTY50:     { label: 'Nifty 50',      expiryType: 'weekly',  expiryDay: 2, lotSize: 75,  strikeGap: 50,  edgeType: 'nifty_chain',       color: '#f0c040', expiryLabel: 'Every Tuesday'   },
  SENSEX:      { label: 'Sensex',         expiryType: 'weekly',  expiryDay: 4, lotSize: 20,  strikeGap: 100, edgeType: 'sensex_chain',       color: '#4d9fff', expiryLabel: 'Every Thursday'  },
  BANKNIFTY:   { label: 'Bank Nifty',     expiryType: 'monthly', expiryDay: 4, lotSize: 30,  strikeGap: 100, edgeType: 'banknifty_chain',    color: '#39d98a', expiryLabel: 'Last Thursday'   },
  FINNIFTY:    { label: 'Fin Nifty',      expiryType: 'monthly', expiryDay: 2, lotSize: 65,  strikeGap: 50,  edgeType: 'finnifty_chain',     color: '#a78bfa', expiryLabel: 'Last Tuesday'    },
  MIDCAPNIFTY: { label: 'Midcap Nifty',   expiryType: 'monthly', expiryDay: 4, lotSize: 75,  strikeGap: 50,  edgeType: 'midcapnifty_chain',  color: '#ff8c42', expiryLabel: 'Last Thursday'   },
  NIFTYNEXT50: { label: 'Nifty Next 50',  expiryType: 'monthly', expiryDay: 4, lotSize: 25,  strikeGap: 50,  edgeType: 'niftynext50_chain',  color: '#ff4d6d', expiryLabel: 'Last Thursday'   },
  BANKEX:      { label: 'Bankex',         expiryType: 'monthly', expiryDay: 4, lotSize: 15,  strikeGap: 100, edgeType: 'bankex_chain',       color: '#39d98a', expiryLabel: 'Last Thursday'   },
};

export const ALL_Z2H_INDICES = Object.keys(INDEX_CONFIG);

// ── DATE HELPERS ──

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function isTradingDay(d: Date, extra: Set<string> = new Set()): boolean {
  const s = toDateStr(d);
  return !isWeekend(d) && !NSE_HOLIDAYS.has(s) && !extra.has(s);
}

function prevTradingDay(d: Date, extra: Set<string> = new Set()): Date {
  const nd = new Date(d);
  do { nd.setDate(nd.getDate() - 1); } while (!isTradingDay(nd, extra));
  return nd;
}

function resolveExpiry(raw: Date, extra: Set<string> = new Set()): Date {
  let d = new Date(raw);
  while (!isTradingDay(d, extra)) d = prevTradingDay(d, extra);
  return d;
}

function lastWeekdayInMonth(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month + 1, 0);
  const diff = (last.getDay() - weekday + 7) % 7;
  last.setDate(last.getDate() - diff);
  return last;
}

// ── EXPIRY DATE GENERATION ──

export function getExpiryDates(
  indexKey: string,
  count = 8,
  from: Date = new Date(),
  extraHolidays: Set<string> = new Set()
): string[] {
  const cfg = INDEX_CONFIG[indexKey];
  if (!cfg) return [];

  const fromMid = new Date(from);
  fromMid.setHours(0, 0, 0, 0);

  const results: string[] = [];

  if (cfg.expiryType === 'weekly') {
    const d = new Date(fromMid);
    const daysUntil = (cfg.expiryDay - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + daysUntil);

    while (results.length < count) {
      const resolved = resolveExpiry(new Date(d), extraHolidays);
      const s = toDateStr(resolved);
      if (!results.includes(s)) results.push(s);
      d.setDate(d.getDate() + 7);
      if (d.getFullYear() > fromMid.getFullYear() + 2) break;
    }
  } else {
    let year = fromMid.getFullYear();
    let month = fromMid.getMonth();

    while (results.length < count) {
      const raw = lastWeekdayInMonth(year, month, cfg.expiryDay);
      const resolved = resolveExpiry(new Date(raw), extraHolidays);
      if (resolved >= fromMid) {
        const s = toDateStr(resolved);
        if (!results.includes(s)) results.push(s);
      }
      month++;
      if (month > 11) { month = 0; year++; }
      if (year > fromMid.getFullYear() + 3) break;
    }
  }

  return results;
}

export function isExpiryDay(
  indexKey: string,
  dateStr: string,
  extraHolidays: Set<string> = new Set()
): boolean {
  const d = new Date(dateStr + 'T00:00:00');
  const past = new Date(d);
  past.setMonth(past.getMonth() - 2);
  const expiries = getExpiryDates(indexKey, 30, past, extraHolidays);
  return expiries.includes(dateStr);
}

// Returns expiry dates as a Set for a given month (for calendar highlighting)
export function getExpiriesForMonth(
  indexKey: string,
  year: number,
  month: number // 0-indexed
): Set<string> {
  const from = new Date(year, month, 1);
  const dates = getExpiryDates(indexKey, 12, from);
  const result = new Set<string>();
  for (const d of dates) {
    const [y, m] = d.split('-').map(Number);
    if (y === year && m - 1 === month) result.add(d);
  }
  return result;
}

// ── SNAPSHOT TIMING ──

export type SnapshotType =
  | 'DAY_BEFORE'
  | 'EXPIRY_EOD'
  | 'EXPIRY_930'
  | 'EXPIRY_1115'
  | 'EXPIRY_115'
  | 'EXPIRY_315';

export const SNAPSHOT_META: Record<SnapshotType, { label: string; time: string; isFree: boolean }> = {
  DAY_BEFORE:  { label: 'Prev Day Close',   time: '3:30 PM (prev day)', isFree: false },
  EXPIRY_EOD:  { label: 'Expiry Day Close', time: '3:30 PM (expiry)',   isFree: false },
  EXPIRY_930:  { label: 'Opening Snapshot', time: '9:30 AM',            isFree: true  },
  EXPIRY_1115: { label: 'Analysis Snapshot',time: '11:15 AM',           isFree: false },
  EXPIRY_115:  { label: 'Entry Snapshot',   time: '1:15 PM',            isFree: false },
  EXPIRY_315:  { label: 'Close Snapshot',   time: '3:15 PM',            isFree: false },
};

// Returns IST hour+min as total minutes
function getISTMinutes(now: Date = new Date()): number {
  const istMs = now.getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

export function getMarketStatus(now: Date = new Date()): {
  isOpen: boolean;
  suggestedSlot: SnapshotType | null;
  isFreeSlot: boolean;
  hint: string;
} {
  const t = getISTMinutes(now);
  const OPEN = 9 * 60 + 15;   // 555
  const T930 = 9 * 60 + 30;   // 570
  const T1030 = 10 * 60 + 30; // 630
  const T1115 = 11 * 60 + 15; // 675
  const T1230 = 12 * 60 + 30; // 750
  const T115 = 13 * 60 + 15;  // 795
  const T200 = 14 * 60 + 0;   // 840
  const T315 = 15 * 60 + 15;  // 915
  const CLOSE = 15 * 60 + 30; // 930

  if (t < OPEN || t > CLOSE) {
    return { isOpen: false, suggestedSlot: null, isFreeSlot: false, hint: 'Market is closed' };
  }
  if (t < T930) {
    return { isOpen: true, suggestedSlot: 'EXPIRY_930', isFreeSlot: true, hint: 'Market just opened. Wait until 9:30 AM to fetch Opening Snapshot.' };
  }
  if (t >= T930 && t < T1030) {
    return { isOpen: true, suggestedSlot: 'EXPIRY_930', isFreeSlot: true, hint: '✅ Perfect time for Opening Snapshot (9:30 AM data)' };
  }
  if (t >= T1030 && t < T1115) {
    return { isOpen: true, suggestedSlot: 'EXPIRY_930', isFreeSlot: true, hint: 'Morning session. Fetch Opening Snapshot if not done yet.' };
  }
  if (t >= T1115 && t < T1230) {
    return { isOpen: true, suggestedSlot: 'EXPIRY_1115', isFreeSlot: false, hint: '✅ Perfect time for Analysis Snapshot (11:15 AM data)' };
  }
  if (t >= T1230 && t < T115) {
    return { isOpen: true, suggestedSlot: 'EXPIRY_1115', isFreeSlot: false, hint: 'Fetch Analysis Snapshot if not done yet.' };
  }
  if (t >= T115 && t < T200) {
    return { isOpen: true, suggestedSlot: 'EXPIRY_115', isFreeSlot: false, hint: '🎯 Entry window: 1:15 PM – 2:00 PM. Execute now!' };
  }
  if (t >= T315 && t <= CLOSE) {
    return { isOpen: true, suggestedSlot: 'EXPIRY_315', isFreeSlot: false, hint: 'Market closing. Capture final result.' };
  }
  return { isOpen: true, suggestedSlot: null, isFreeSlot: false, hint: 'Between 2:00 PM and 3:15 PM — hold or exit partial.' };
}

// ── 5-FORCE ANALYSIS ENGINE ──

export interface Z2HSnapshot {
  snapshot_type: SnapshotType;
  spot_price: number;
  max_pain: number;
  vix: number;
  strike_data: Record<string, StrikeRow> | null;
  created_at?: string;
}

export interface StrikeRow {
  ce_oi: number;
  ce_ltp: number;
  pe_oi: number;
  pe_ltp: number;
  ce_vol?: number;
  pe_vol?: number;
}

export interface Z2HForces {
  direction: boolean;
  oi: boolean;
  pcb: boolean;
  maxPain: boolean;
  vix: boolean;
  count: number;
}

export interface TopStrikeInfo {
  strike: number;
  ltp930: number;
  ltp1115: number;
  oi930: number;
  oi1115: number;
  oiChangePct: number;
  ltpChangePct: number;
  isBest: boolean;
}

export interface PCBDetails {
  strike: number;
  pcb: number;       // yesterday close LTP = avg cost of existing holders
  ltp930: number;
  ltp1115: number;
  inProfit: boolean;
}

export interface Z2HAnalysis {
  signal: 'TRADE' | 'NO_TRADE';
  direction: 'BEARISH' | 'BULLISH' | 'UNCLEAR';
  forces: Z2HForces;
  reason?: string;
  // Trade details
  selectedStrike?: number;
  optionType?: 'PE' | 'CE';
  entryLTPRef?: number; // LTP at 11:15 for reference
  stopLossPct: number;  // 0.5 = 50%
  target1x: number;     // 3
  target2x: number;     // 5
  heroX: number;        // 10
  skipConditions: string[];
  // Market context
  spot930: number;
  spot1115: number;
  spotMove: number;
  maxPain930: number;
  maxPain1115: number;
  maxPainMove: number;
  vix930: number;
  vix1115: number;
  // OI data
  topStrikes?: TopStrikeInfo[];
  pcbDetails?: PCBDetails;
}

export function computeZ2H(
  dayBefore: Z2HSnapshot | null,
  snap930: Z2HSnapshot,
  snap1115: Z2HSnapshot,
  indexKey: string
): Z2HAnalysis {
  const spot930 = snap930.spot_price;
  const spot1115 = snap1115.spot_price;
  const mp930 = snap930.max_pain;
  const mp1115 = snap1115.max_pain;
  const vix930 = snap930.vix || 0;
  const vix1115 = snap1115.vix || 0;

  const s930 = snap930.strike_data || {};
  const s1115 = snap1115.strike_data || {};
  const sDayBefore = dayBefore?.strike_data || {};

  const spotMove = spot1115 - spot930;
  const mpMove = mp1115 - mp930;

  // ── Force 1: Direction — need 200+ point directional move ──
  let direction: 'BEARISH' | 'BULLISH' | 'UNCLEAR' = 'UNCLEAR';
  if (spotMove <= -200) direction = 'BEARISH';
  else if (spotMove >= 200) direction = 'BULLISH';

  const f1 = direction !== 'UNCLEAR';

  if (!f1) {
    return {
      signal: 'NO_TRADE',
      direction: 'UNCLEAR',
      forces: { direction: false, oi: false, pcb: false, maxPain: false, vix: false, count: 0 },
      reason: `Market moved only ${Math.abs(Math.round(spotMove))} pts between 9:30 and 11:15 AM (need 200+ pts). No clear directional edge — skip trade today.`,
      stopLossPct: 0.5, target1x: 3, target2x: 5, heroX: 10, skipConditions: [],
      spot930, spot1115, spotMove, maxPain930: mp930, maxPain1115: mp1115, maxPainMove: mpMove,
      vix930, vix1115,
    };
  }

  const isCall = direction === 'BULLISH';
  const ltpF = isCall ? 'ce_ltp' : 'pe_ltp';
  const oiF = isCall ? 'ce_oi' : 'pe_oi';

  // ── Force 2: OI Accumulation — LTP rising + OI rising = fresh buying ──
  const oiAnalysis = analyzeOIAccumulation(s930, s1115, direction, spot1115, indexKey);
  const f2 = oiAnalysis.freshBuyRatio >= 0.5;

  // ── Force 3: PCB (God Particle) — current LTP > yesterday close LTP ──
  const bestStrike = oiAnalysis.bestStrike
    ?? selectBestStrike(s930, s1115, direction, spot1115, mp1115, indexKey);

  let pcbDetails: PCBDetails | undefined;
  let f3 = false;
  if (bestStrike) {
    const sk = String(bestStrike);
    const pcb = (sDayBefore[sk] as any)?.[ltpF] ?? 0;
    const ltp930v = (s930[sk] as any)?.[ltpF] ?? 0;
    const ltp1115v = (s1115[sk] as any)?.[ltpF] ?? 0;
    f3 = pcb > 0 ? ltp1115v > pcb : true; // if no day_before data, benefit of doubt
    pcbDetails = { strike: bestStrike, pcb, ltp930: ltp930v, ltp1115: ltp1115v, inProfit: f3 };
  } else {
    f3 = true; // no candidate found = benefit of doubt
  }

  // ── Force 4: Max Pain Gravity — spot on wrong side of max pain ──
  const mpGap = spot1115 - mp1115;
  const maxGap = (INDEX_CONFIG[indexKey]?.strikeGap ?? 50) * 12;
  const f4 = direction === 'BEARISH'
    ? (mpGap > 0 && mpGap < maxGap)   // spot above max pain → gravity pulls down
    : (mpGap < 0 && Math.abs(mpGap) < maxGap); // spot below max pain → gravity pulls up

  // ── Force 5: VIX — fear index must be elevated ──
  const f5 = vix1115 === 0
    ? true  // data unavailable = benefit of doubt
    : (vix1115 >= 15 && (vix1115 > vix930 || vix1115 >= 18));

  const forces: Z2HForces = {
    direction: f1, oi: f2, pcb: f3, maxPain: f4, vix: f5,
    count: [f1, f2, f3, f4, f5].filter(Boolean).length,
  };

  if (forces.count < 3) {
    return {
      signal: 'NO_TRADE', direction, forces,
      reason: `Only ${forces.count}/5 forces aligned. Minimum 3 needed. Weak signals: ${describeWeakForces(forces)}`,
      stopLossPct: 0.5, target1x: 3, target2x: 5, heroX: 10, skipConditions: [],
      spot930, spot1115, spotMove, maxPain930: mp930, maxPain1115: mp1115, maxPainMove: mpMove,
      vix930, vix1115, pcbDetails,
      topStrikes: oiAnalysis.topStrikes.map(s => ({ ...s, isBest: s.strike === bestStrike })),
    };
  }

  const optionType: 'PE' | 'CE' = isCall ? 'CE' : 'PE';
  const entryLTPRef = bestStrike
    ? ((s1115[String(bestStrike)] as any)?.[ltpF] ?? 0)
    : 0;

  const skipConditions = buildSkipConditions(direction, spot1115, vix1115, bestStrike, entryLTPRef);

  return {
    signal: 'TRADE', direction, forces,
    selectedStrike: bestStrike ?? undefined,
    optionType,
    entryLTPRef,
    stopLossPct: 0.5, target1x: 3, target2x: 5, heroX: 10,
    skipConditions,
    spot930, spot1115, spotMove, maxPain930: mp930, maxPain1115: mp1115, maxPainMove: mpMove,
    vix930, vix1115, pcbDetails,
    topStrikes: oiAnalysis.topStrikes.map(s => ({ ...s, isBest: s.strike === bestStrike })),
  };
}

// ── INTERNAL HELPERS ──

interface OIAnalysis {
  freshBuyRatio: number;
  bestStrike: number | null;
  topStrikes: TopStrikeInfo[];
}

function analyzeOIAccumulation(
  s930: Record<string, any>,
  s1115: Record<string, any>,
  direction: 'BEARISH' | 'BULLISH',
  spot: number,
  indexKey: string
): OIAnalysis {
  const ltpF = direction === 'BEARISH' ? 'pe_ltp' : 'ce_ltp';
  const oiF = direction === 'BEARISH' ? 'pe_oi' : 'ce_oi';
  const gap = INDEX_CONFIG[indexKey]?.strikeGap ?? 50;
  const scanRange = gap * 60; // e.g. 3000 for Nifty, 6000 for Sensex

  const top: TopStrikeInfo[] = [];
  let freshBuy = 0, total = 0;

  for (const [sk, d1115raw] of Object.entries(s1115)) {
    const strike = Number(sk);
    const d930 = s930[sk];
    if (!d930) continue;
    const d1115 = d1115raw as any;

    const inRange = direction === 'BEARISH'
      ? (strike < spot && strike > spot - scanRange)
      : (strike > spot && strike < spot + scanRange);
    if (!inRange) continue;

    const ltp930 = (d930 as any)[ltpF] ?? 0;
    const ltp1115 = d1115[ltpF] ?? 0;
    const oi930 = (d930 as any)[oiF] ?? 0;
    const oi1115 = d1115[oiF] ?? 0;

    if (ltp930 === 0 || oi930 === 0) continue;
    total++;

    if (ltp1115 > ltp930 && oi1115 > oi930) freshBuy++;

    const oiChangePct = ((oi1115 - oi930) / oi930) * 100;
    const ltpChangePct = ((ltp1115 - ltp930) / ltp930) * 100;

    if (oi1115 >= 50000 && oiChangePct > 50 && ltp1115 >= 20 && ltp1115 <= 400) {
      top.push({ strike, ltp930, ltp1115, oi930, oi1115, oiChangePct, ltpChangePct, isBest: false });
    }
  }

  top.sort((a, b) => {
    const scoreA = a.oiChangePct * 0.5 + (a.oi1115 / 10000) * 0.5;
    const scoreB = b.oiChangePct * 0.5 + (b.oi1115 / 10000) * 0.5;
    return scoreB - scoreA;
  });

  return {
    freshBuyRatio: total > 0 ? freshBuy / total : 0,
    bestStrike: top[0]?.strike ?? null,
    topStrikes: top.slice(0, 8),
  };
}

function selectBestStrike(
  s930: Record<string, any>,
  s1115: Record<string, any>,
  direction: 'BEARISH' | 'BULLISH',
  spot: number,
  maxPain: number,
  indexKey: string
): number | null {
  const gap = INDEX_CONFIG[indexKey]?.strikeGap ?? 50;
  const ltpF = direction === 'BEARISH' ? 'pe_ltp' : 'ce_ltp';
  const oiF  = direction === 'BEARISH' ? 'pe_oi'  : 'ce_oi';
  const targetZone = direction === 'BEARISH' ? maxPain - gap * 4 : maxPain + gap * 4;
  const scanRange = gap * 60;

  let best: number | null = null;
  let bestScore = -Infinity;

  for (const [sk, d1115raw] of Object.entries(s1115)) {
    const strike = Number(sk);
    const d930 = s930[sk];
    if (!d930) continue;
    const d1115 = d1115raw as any;

    const ltp1115 = d1115[ltpF] ?? 0;
    const oi1115  = d1115[oiF]  ?? 0;
    const oi930   = (d930 as any)[oiF]  ?? 0;
    const ltp930  = (d930 as any)[ltpF] ?? 0;

    if (ltp1115 < 20 || ltp1115 > 350) continue;
    if (oi1115 < 50000) continue;
    if (ltp1115 <= ltp930 || oi1115 <= oi930) continue;

    const inRange = direction === 'BEARISH'
      ? (strike < spot && strike > spot - scanRange)
      : (strike > spot && strike < spot + scanRange);
    if (!inRange) continue;

    const oiPct = oi930 > 0 ? ((oi1115 - oi930) / oi930) * 100 : 0;
    const distFromTarget = Math.abs(strike - targetZone);
    const score = oiPct * 0.4 + (oi1115 / 100000) * 0.3 - (distFromTarget / gap) * 0.3;

    if (score > bestScore) { bestScore = score; best = strike; }
  }

  return best;
}

function describeWeakForces(f: Z2HForces): string {
  const weak: string[] = [];
  if (!f.oi) weak.push('OI accumulation weak');
  if (!f.pcb) weak.push('Put buyers not in profit');
  if (!f.maxPain) weak.push('Max pain not aligned');
  if (!f.vix) weak.push('VIX too low');
  return weak.join(' · ') || 'Check data';
}

function buildSkipConditions(
  direction: 'BEARISH' | 'BULLISH' | 'UNCLEAR',
  spot1115: number,
  vix: number,
  strike: number | null | undefined,
  ltp: number
): string[] {
  if (direction === 'UNCLEAR') return [];
  const conditions: string[] = [];
  if (direction === 'BEARISH') {
    conditions.push(`Spot bounces above ${Math.round(spot1115 + 200)}`);
    conditions.push('VIX drops below 15');
    if (strike && ltp > 0) conditions.push(`${strike} PE LTP falls below ₹${Math.round(ltp * 0.7)}`);
  } else {
    conditions.push(`Spot falls below ${Math.round(spot1115 - 200)}`);
    conditions.push('VIX spikes above 30');
    if (strike && ltp > 0) conditions.push(`${strike} CE LTP falls below ₹${Math.round(ltp * 0.7)}`);
  }
  return conditions;
}

// ── MAX PAIN CALCULATOR ──
export function calculateMaxPain(strikes: Record<string, any>): number {
  const list = Object.keys(strikes).map(Number).sort((a, b) => a - b);
  let minPain = Infinity;
  let result = list[0] ?? 0;
  for (const test of list) {
    let pain = 0;
    for (const s of list) {
      const d = strikes[s];
      if (test > s) pain += (test - s) * ((d as any).ce_oi ?? 0);
      if (test < s) pain += (s - test) * ((d as any).pe_oi ?? 0);
    }
    if (pain < minPain) { minPain = pain; result = test; }
  }
  return result;
}

// ── FORMAT HELPERS ──
export function fmtOI(oi: number): string {
  if (!oi) return '0';
  return (oi / 100000).toFixed(2) + 'L';
}

export function fmtPct(pct: number): string {
  return (pct >= 0 ? '+' : '') + pct.toFixed(0) + '%';
}

// ── REVERSAL ANALYSIS ──
export interface ReversalAnalysis {
  marketType: 'TRENDING' | 'SIDEWAYS' | 'RANGE_BOUND';
  spotMove: number;          // points moved 9:30 → 11:15
  pcr930: number;
  pcr1115: number;
  pcrShift: 'RISING' | 'FALLING' | 'FLAT';
  resistanceStrike: number;  // highest CE OI above ATM
  supportStrike: number;     // highest PE OI below ATM
  distToResistance: number;  // % from spot to resistance
  distToSupport: number;     // % from spot to support
  signal: 'BUY_PE_REVERSAL' | 'BUY_CE_REVERSAL' | 'NONE';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  counterStrike: number;
  counterLTP: number;
  confirmations: string[];
  warnings: string[];
}

export function analyzeReversal(
  snap930: Z2HSnapshot,
  snap1115: Z2HSnapshot,
  indexKey: string
): ReversalAnalysis {
  const s930 = snap930.strike_data || {};
  const s1115 = snap1115.strike_data || {};
  const spot930 = snap930.spot_price;
  const spot1115 = snap1115.spot_price;
  const gap = INDEX_CONFIG[indexKey]?.strikeGap ?? 100;
  const atm = Math.round(spot1115 / gap) * gap;
  const searchRange = gap * 15;

  // PCR at both times
  let ceTot930 = 0, peTot930 = 0, ceTot1115 = 0, peTot1115 = 0;
  Object.keys(s930).forEach(k => {
    const sk = parseFloat(k); if (isNaN(sk)) return;
    ceTot930 += (s930[k] as any)?.ce_oi || 0;
    peTot930 += (s930[k] as any)?.pe_oi || 0;
  });
  Object.keys(s1115).forEach(k => {
    const sk = parseFloat(k); if (isNaN(sk)) return;
    ceTot1115 += (s1115[k] as any)?.ce_oi || 0;
    peTot1115 += (s1115[k] as any)?.pe_oi || 0;
  });
  const pcr930 = ceTot930 > 0 ? peTot930 / ceTot930 : 1;
  const pcr1115 = ceTot1115 > 0 ? peTot1115 / ceTot1115 : 1;
  const pcrShift: ReversalAnalysis['pcrShift'] =
    pcr1115 > pcr930 * 1.05 ? 'RISING' : pcr1115 < pcr930 * 0.95 ? 'FALLING' : 'FLAT';

  // Find resistance (highest CE OI above ATM) and support (highest PE OI below ATM)
  let maxCEOI = 0, maxPEOI = 0, resistanceStrike = 0, supportStrike = 0;
  let bestCounterPE = { strike: 0, ltp: 0, oi: 0 };
  let bestCounterCE = { strike: 0, ltp: 0, oi: 0 };

  Object.keys(s1115).forEach(k => {
    const sk = parseFloat(k);
    if (isNaN(sk) || Math.abs(sk - atm) > searchRange) return;
    const row = s1115[k] as any;
    const ceOI = row?.ce_oi || 0;
    const peOI = row?.pe_oi || 0;
    const ceLTP = row?.ce_ltp || 0;
    const peLTP = row?.pe_ltp || 0;

    if (sk > atm && ceOI > maxCEOI) { maxCEOI = ceOI; resistanceStrike = sk; }
    if (sk < atm && peOI > maxPEOI) { maxPEOI = peOI; supportStrike = sk; }

    // Find cheapest liquid PE below ATM (for buying at resistance)
    if (sk <= atm && sk >= atm - gap * 5 && peLTP > 5 && peOI > 5000) {
      if (bestCounterPE.strike === 0 || peLTP < bestCounterPE.ltp) {
        bestCounterPE = { strike: sk, ltp: peLTP, oi: peOI };
      }
    }
    // Find cheapest liquid CE above ATM (for buying at support)
    if (sk >= atm && sk <= atm + gap * 5 && ceLTP > 5 && ceOI > 5000) {
      if (bestCounterCE.strike === 0 || ceLTP < bestCounterCE.ltp) {
        bestCounterCE = { strike: sk, ltp: ceLTP, oi: ceOI };
      }
    }
  });

  const spotMove = spot1115 - spot930;
  const absMove = Math.abs(spotMove);
  const distToRes = resistanceStrike > 0
    ? ((resistanceStrike - spot1115) / spot1115) * 100 : 999;
  const distToSup = supportStrike > 0
    ? ((spot1115 - supportStrike) / spot1115) * 100 : 999;

  const marketType: ReversalAnalysis['marketType'] =
    absMove < gap * 1.5 ? 'RANGE_BOUND' : absMove < gap * 2.5 ? 'SIDEWAYS' : 'TRENDING';

  // Reversal logic
  let signal: ReversalAnalysis['signal'] = 'NONE';
  let confidence: ReversalAnalysis['confidence'] = 'LOW';
  const confirmations: string[] = [];
  const warnings: string[] = [];

  const nearRes = distToRes >= 0 && distToRes < 0.6;
  const nearSup = distToSup >= 0 && distToSup < 0.6;

  if (nearRes) {
    signal = 'BUY_PE_REVERSAL';
    confirmations.push(`Spot ₹${spot1115} is ${distToRes.toFixed(2)}% away from CE wall at ${resistanceStrike}`);
    if (pcrShift === 'RISING') { confirmations.push('PCR rising — PE demand increasing'); confidence = 'HIGH'; }
    else if (pcr1115 < 0.8) { confirmations.push(`Low PCR ${pcr1115.toFixed(2)} — CE side crowded, reversal likely`); confidence = 'MEDIUM'; }
    else { warnings.push('PCR not yet confirming — wait for PE OI to build'); confidence = 'LOW'; }
    if (marketType === 'RANGE_BOUND') confirmations.push('Range-bound market — OI walls likely to hold');
  } else if (nearSup) {
    signal = 'BUY_CE_REVERSAL';
    confirmations.push(`Spot ₹${spot1115} is ${distToSup.toFixed(2)}% away from PE wall at ${supportStrike}`);
    if (pcrShift === 'FALLING') { confirmations.push('PCR falling — CE demand increasing'); confidence = 'HIGH'; }
    else if (pcr1115 > 1.5) { confirmations.push(`High PCR ${pcr1115.toFixed(2)} — PE side crowded, reversal likely`); confidence = 'MEDIUM'; }
    else { warnings.push('PCR not yet confirming — wait for CE OI to build'); confidence = 'LOW'; }
    if (marketType === 'RANGE_BOUND') confirmations.push('Range-bound market — OI walls likely to hold');
  }

  if (marketType === 'TRENDING' && signal !== 'NONE') {
    warnings.push('Market is trending — reversal signal is weaker. Use tight SL.');
  }

  const counterStrike = signal === 'BUY_PE_REVERSAL' ? bestCounterPE.strike : bestCounterCE.strike;
  const counterLTP = signal === 'BUY_PE_REVERSAL' ? bestCounterPE.ltp : bestCounterCE.ltp;

  return {
    marketType, spotMove, pcr930, pcr1115, pcrShift,
    resistanceStrike, supportStrike, distToResistance: distToRes, distToSupport: distToSup,
    signal, confidence, counterStrike, counterLTP, confirmations, warnings,
  };
}
