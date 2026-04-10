import { supabase } from './supabase';

export function parseNSEOptionChain(csvText: string) {
  function parseLine(line: string): string[] {
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

  function num(v: string): number {
    const s = String(v || '').replace(/,/g, '').replace(/\n/g, '').trim();
    return (s === '-' || s === '') ? 0 : parseFloat(s) || 0;
  }

  const lines = csvText.split(/\r?\n/);
  const result: Record<string, any> = {};

  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const p = parseLine(line);
    if (p.length < 12) continue;
    const strike = num(p[11]);
    if (!strike || strike < 1000) continue;
    result[strike] = {
      ce_oi: num(p[1]),
      ce_chng_oi: num(p[2]),
      ce_vol: num(p[3]),
      ce_ltp: num(p[5]),
      pe_ltp: num(p[17]),
      pe_vol: num(p[19]),
      pe_chng_oi: num(p[20]),
      pe_oi: num(p[21])
    };
  }
  return result;
}

export async function checkDuplicateData(
  indexName: string,
  expiry: string,
  tradeDate: string,
  stockName?: string
): Promise<boolean> {
  let query = supabase
    .from('market_data')
    .select('id')
    .eq('index_name', indexName)
    .eq('expiry', expiry)
    .eq('trade_date', tradeDate);
  if (stockName) query = query.eq('stock_name', stockName);
  const { data, error } = await query.limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

export async function uploadMarketData(
  indexName: string,
  expiry: string,
  tradeDate: string,
  strikeData: Record<string, any>,
  uploadedBy: string,
  stockName?: string,
  timeframe: string = 'daily'
) {
  const isDuplicate = await checkDuplicateData(indexName, expiry, tradeDate, stockName);
  if (isDuplicate) {
    return {
      status: 'duplicate',
      message: `⚠️ Data already exists for ${indexName} | ${expiry} | ${tradeDate} — Skipped!`
    };
  }
  const { error } = await supabase
    .from('market_data')
    .insert({
      index_name: indexName,
      expiry,
      trade_date: tradeDate,
      strike_data: strikeData,
      uploaded_by: uploadedBy,
      stock_name: stockName || null,
      timeframe,
      category: stockName ? 'stock' : 'index'
    });
  if (error) throw error;
  return { status: 'saved', message: `✅ New data saved!` };
}

export async function getMarketData(
  indexName: string,
  expiry: string,
  timeframe: string = 'daily'
) {
  const { data, error } = await supabase
    .from('market_data')
    .select('*')
    .eq('index_name', indexName)
    .eq('expiry', expiry)
    .eq('timeframe', timeframe)
    .order('trade_date', { ascending: true });
  if (error) throw error;
  return data;
}

export async function saveAnalysis(
  userId: string,
  indexName: string,
  strike: number,
  optionType: string,
  expiry: string,
  result: Record<string, any>
) {
  const { error } = await supabase
    .from('analyses')
    .insert({
      user_id: userId,
      index_name: indexName,
      strike,
      option_type: optionType,
      expiry,
      credits_used: 2,
      result
    });
  if (error) throw error;
}

export async function getUserAnalyses(userId: string) {
  const { data, error } = await supabase
    .from('analyses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data;
}

// ═══════════════════════════════════════════════════════
// FULL GOD PARTICLE ENGINE — DEEP ANALYSIS
// ═══════════════════════════════════════════════════════

export function computeGodParticle(
  data: any[],
  strike: number,
  optType: string,
  expiry: string,
  indexName: string = 'NIFTY50'
) {
  // ── STEP 1: VOLUME DECOMPOSITION ──
  const decomp = data.map((d: any, i: number) => {
    const prevOI = i === 0 ? d.oi : data[i - 1].oi;
    const dOI = d.chng_oi !== 0 ? d.chng_oi : d.oi - prevOI;
    const NO = (d.volume + dOI) / 2;
    const SQ = (d.volume - dOI) / 2;

    // Detect institutional behavior
    // When OI growth > Volume → institutional writing (they create new positions without much volume)
    const isInstitutional = dOI > d.volume;
    const isBuyerRush = d.volume > dOI && dOI > 0 && NO > 0;
    const isUnwinding = dOI < 0;

    let signal = '';
    let signalColor = '';
    if (isInstitutional) {
      signal = optType === 'CE' ? 'Institutional Writing 🔴' : 'Institutional PE Writing 🔴';
      signalColor = 'red';
    } else if (isBuyerRush) {
      signal = optType === 'CE' ? 'Buyers Entering 🟢' : 'PE Buyers Entering 🟢';
      signalColor = 'green';
    } else if (isUnwinding) {
      signal = 'Unwinding ⬜';
      signalColor = 'gray';
    } else {
      signal = 'Mixed Activity 🟡';
      signalColor = 'yellow';
    }

    return {
      ...d,
      dOI,
      NO: Math.max(0, NO),
      SQ: Math.max(0, SQ),
      isInstitutional,
      isBuyerRush,
      isUnwinding,
      signal,
      signalColor
    };
  });

  // ── STEP 2: THREE CONSTANTS ──
  const sv = data.reduce((s: number, d: any) => s + d.volume, 0) || 1;
  const so = data.reduce((s: number, d: any) => s + d.oi, 0) || 1;
  const sn = decomp.reduce((s: number, d: any) => s + d.NO, 0) || 1;

  const vwap = data.reduce((s: number, d: any) =>
    s + ((d.high || d.close) + (d.low || d.close) + d.close) / 3 * d.volume, 0) / sv;
  const oiwap = data.reduce((s: number, d: any) => s + d.close * d.oi, 0) / so;
  const pcb = decomp.reduce((s: number, d: any) => s + d.close * d.NO, 0) / sn;

  // ── STEP 3: OI ANALYSIS ──
  const firstOI = data[0].oi;
  const lastOI = data[data.length - 1].oi;
  const oiGrowthMultiple = lastOI / firstOI;
  const oiExplosion = oiGrowthMultiple > 5;
  const massiveOI = lastOI > 1000000; // 10 lakh+

  // ── STEP 4: PRICE ANALYSIS ──
  const firstClose = data[0].close;
  const lastClose = data[data.length - 1].close;
  const priceChange = lastClose - firstClose;
  const priceChangePct = ((priceChange / firstClose) * 100);

  // Peak price detection
  const maxClose = Math.max(...data.map((d: any) => d.close));
  const maxCloseDay = data.find((d: any) => d.close === maxClose);

  // ── STEP 5: PHASE DETECTION ──
  const phases = detectPhases(decomp, pcb, optType);

  // ── STEP 6: PCB VALIDATION ──
  const pcbValidation = decomp.map((d: any) => {
    const diff = d.close - pcb;
    const pct = ((diff / pcb) * 100);
    const zone = d.close > pcb * 1.05 ? 'BUYER EDGE' :
      d.close < pcb * 0.95 ? 'WRITER EDGE' : 'WAR ZONE';
    return { ...d, diff, pct, zone };
  });

  // ── STEP 7: CRITICAL INSIGHTS ──
  const insights = generateInsights(
    decomp, pcb, vwap, oiwap, lastClose, firstClose,
    oiGrowthMultiple, strike, optType, data
  );

  // ── STEP 8: SCENARIO MATRIX ──
  const matrix = generateMatrix(lastClose, pcb, optType);

  // ── STEP 9: STORY ──
  const story = generateStory(
    data, decomp, pcb, vwap, oiwap,
    strike, optType, expiry, phases,
    oiGrowthMultiple, maxClose, maxCloseDay
  );

  const dte = getDTE(expiry);

  return {
    data,
    decomp,
    pcbValidation,
    strike,
    optType,
    expiry,
    indexName,
    dte,
    vwap: Math.round(vwap * 100) / 100,
    oiwap: Math.round(oiwap * 100) / 100,
    pcb: Math.round(pcb * 100) / 100,
    lc: lastClose,
    firstClose,
    priceChange: Math.round(priceChange * 100) / 100,
    priceChangePct: Math.round(priceChangePct * 100) / 100,
    maxClose,
    maxCloseDay,
    oiGrowthMultiple: Math.round(oiGrowthMultiple * 10) / 10,
    oiExplosion,
    massiveOI,
    phases,
    insights,
    matrix,
    story
  };
}

// ── PHASE DETECTION ──
function detectPhases(decomp: any[], pcb: number, optType: string) {
  const phases: any[] = [];
  let currentPhase: any = null;

  decomp.forEach((d: any, i: number) => {
    const phaseType = d.isInstitutional ? 'writing' :
      d.isBuyerRush ? 'buying' :
      d.isUnwinding ? 'unwinding' : 'mixed';

    if (!currentPhase || currentPhase.type !== phaseType) {
      if (currentPhase) phases.push(currentPhase);
      currentPhase = {
        type: phaseType,
        startDate: d.date,
        endDate: d.date,
        startPrice: d.close,
        endPrice: d.close,
        days: [d]
      };
    } else {
      currentPhase.endDate = d.date;
      currentPhase.endPrice = d.close;
      currentPhase.days.push(d);
    }
  });

  if (currentPhase) phases.push(currentPhase);

  return phases.map((p: any, i: number) => ({
    ...p,
    label: `Phase ${i + 1}`,
    description: p.type === 'writing'
      ? `${optType === 'CE' ? 'Institutional CE Writing' : 'Institutional PE Writing'} — collecting premium`
      : p.type === 'buying'
      ? `${optType === 'CE' ? 'Buyers rushing in' : 'PE buyers entering'} — bullish activity`
      : p.type === 'unwinding'
      ? 'Position unwinding — exits dominating'
      : 'Mixed activity — market indecision'
  }));
}

// ── CRITICAL INSIGHTS ──
function generateInsights(
  decomp: any[], pcb: number, vwap: number, oiwap: number,
  lastClose: number, firstClose: number, oiGrowthMultiple: number,
  strike: number, optType: string, data: any[]
) {
  const insights: string[] = [];
  const lastOI = data[data.length - 1].oi;
  const priceMove = ((lastClose - firstClose) / firstClose * 100);

  // OI explosion insight
  if (oiGrowthMultiple > 10) {
    insights.push(`🔥 MASSIVE OI EXPLOSION: OI grew ${oiGrowthMultiple}x from ${data[0].oi.toLocaleString()} to ${lastOI.toLocaleString()} — extraordinary institutional interest!`);
  } else if (oiGrowthMultiple > 5) {
    insights.push(`⚡ Strong OI buildup: ${oiGrowthMultiple}x growth — significant fresh positioning`);
  }

  // PCB vs current price
  const pcbDiff = ((lastClose - pcb) / pcb * 100);
  if (lastClose > pcb * 1.1) {
    insights.push(`🟢 Price ${pcbDiff.toFixed(1)}% ABOVE God Particle — ${optType === 'CE' ? 'buyers have clear edge, momentum is bullish' : 'PE buyers in control, bearish Nifty view dominant'}`);
  } else if (lastClose < pcb * 0.9) {
    insights.push(`🔴 Price ${Math.abs(pcbDiff).toFixed(1)}% BELOW God Particle — ${optType === 'CE' ? 'writers winning, CE faces strong resistance at PCB' : 'PE writers confident, bullish Nifty view dominant'}`);
  } else {
    insights.push(`⚔️ Price near God Particle ₹${pcb.toFixed(0)} — MAXIMUM WAR ZONE — sharp decisive move expected`);
  }

  // Institutional dominance
  const instDays = decomp.filter((d: any) => d.isInstitutional).length;
  if (instDays >= decomp.length * 0.6) {
    insights.push(`🏛️ INSTITUTIONAL DOMINANCE: Writers controlled ${instDays}/${decomp.length} sessions — powerful hands on the short side`);
  }

  // Buyer rush detection
  const buyerDays = decomp.filter((d: any) => d.isBuyerRush).length;
  if (buyerDays >= 2) {
    insights.push(`💥 BUYER RUSH detected on ${buyerDays} sessions — retail and institutional buyers piling in`);
  }

  // Massive OI warning
  if (lastOI > 2000000) {
    insights.push(`⚠️ ENORMOUS OI: ${(lastOI / 100000).toFixed(1)} lakh open contracts — if squeeze triggers, move can be explosive`);
  }

  // Price recovery/crash
  if (priceMove > 100) {
    insights.push(`🚀 PRICE EXPLOSION: ${priceMove.toFixed(0)}% gain from ₹${firstClose} to ₹${lastClose} over analysis period`);
  } else if (priceMove < -50) {
    insights.push(`💥 PRICE COLLAPSE: ${priceMove.toFixed(0)}% fall — writers completely dominated`);
  }

  // DTE warning
  const dte = getDTE(data[data.length-1].date);
  if (dte <= 2) {
    insights.push(`⏰ EXPIRY ALERT: Only ${dte} day(s) left — theta decay is extreme, gamma is very high`);
  }

  return insights;
}

// ── STORY GENERATOR ──
function generateStory(
  data: any[], decomp: any[], pcb: number, vwap: number, oiwap: number,
  strike: number, optType: string, expiry: string, phases: any[],
  oiGrowthMultiple: number, maxClose: number, maxCloseDay: any
) {
  const first = data[0];
  const last = data[data.length - 1];
  const priceMove = last.close - first.close;
  const priceMovePct = ((priceMove / first.close) * 100).toFixed(1);
  const totalNO = decomp.reduce((s: number, d: any) => s + d.NO, 0);
  const totalSQ = decomp.reduce((s: number, d: any) => s + d.SQ, 0);
  const instDays = decomp.filter((d: any) => d.isInstitutional).length;
  const buyerDays = decomp.filter((d: any) => d.isBuyerRush).length;
  const dte = getDTE(expiry);
  const pcbStatus = last.close > pcb ? 'ABOVE' : last.close < pcb ? 'BELOW' : 'AT';

  let story = `Over ${data.length} sessions, ${strike} ${optType} (Expiry: ${expiry}) `;
  story += `moved from ₹${first.close.toFixed(2)} to ₹${last.close.toFixed(2)} `;
  story += `— a ${priceMove >= 0 ? '+' : ''}₹${priceMove.toFixed(2)} (${priceMove >= 0 ? '+' : ''}${priceMovePct}%) move.\n\n`;

  // Phase summary
  if (phases.length > 0) {
    story += `PHASE ANALYSIS:\n`;
    phases.forEach((p: any) => {
      story += `${p.label} (${p.startDate} → ${p.endDate}): ${p.description}. `;
      story += `Price moved from ₹${p.startPrice.toFixed(0)} to ₹${p.endPrice.toFixed(0)}.\n`;
    });
    story += '\n';
  }

  // Institutional behavior
  if (instDays > 0) {
    story += `INSTITUTIONAL BEHAVIOR:\n`;
    story += `Writers dominated ${instDays} out of ${data.length} sessions. `;
    story += `OI grew ${oiGrowthMultiple}x from ${data[0].oi.toLocaleString()} to ${data[data.length-1].oi.toLocaleString()}. `;
    story += `Total new opens: ${Math.round(totalNO).toLocaleString()} vs square-offs: ${Math.round(totalSQ).toLocaleString()}.\n\n`;
  }

  // Peak price
  if (maxCloseDay) {
    story += `PEAK PRICE:\n`;
    story += `Highest close was ₹${maxClose.toFixed(2)} on ${maxCloseDay.date}. `;
    story += `Current price ₹${last.close.toFixed(2)} is ${((last.close - maxClose) / maxClose * 100).toFixed(1)}% from peak.\n\n`;
  }

  // God Particle status
  story += `GOD PARTICLE STATUS:\n`;
  story += `PCB (God Particle) = ₹${pcb.toFixed(1)}. `;
  story += `Current price is ${pcbStatus} the God Particle. `;
  if (pcbStatus === 'ABOVE') {
    story += optType === 'CE'
      ? `Buyers have the edge — bullish momentum continues.`
      : `PE buyers in control — bearish Nifty view dominates.`;
  } else if (pcbStatus === 'BELOW') {
    story += optType === 'CE'
      ? `Writers are winning — CE faces strong resistance.`
      : `PE writers confident — bullish Nifty view.`;
  } else {
    story += `Maximum war zone — explosive move expected in either direction.`;
  }
  story += `\n\n`;

  // Expiry context
  story += `EXPIRY CONTEXT:\n`;
  story += `${dte} day(s) to expiry. `;
  if (dte <= 1) {
    story += `EXPIRY DAY — avoid OTM buys, intrinsic value plays only.`;
  } else if (dte <= 2) {
    story += `Near expiry — theta is very aggressive. Gamma is high.`;
  } else if (dte <= 4) {
    story += `Theta significant — plan exits carefully. Morning entries preferred.`;
  } else {
    story += `Theta manageable — normal targets apply.`;
  }

  return story;
}

// ── SCENARIO MATRIX ──
function generateMatrix(lc: number, pcb: number, optType: string) {
  const isCE = optType === 'CE';

  function buyZone(multiplier: number) {
    const entry = Math.round(lc * multiplier);
    const low = Math.round(entry * 0.92);
    return { low, high: entry, entry };
  }

  function targets(entry: number) {
    return {
      t1: Math.round(entry * 1.30),
      t2: Math.round(entry * 1.60),
      sl: Math.round(entry * 0.75)
    };
  }

  const scenarios = [
    { gap: 'Gap Up 400+', multiplier: isCE ? 1.55 : 0.42, avoid: !isCE },
    { gap: 'Gap Up 300', multiplier: isCE ? 1.45 : 0.50, avoid: !isCE },
    { gap: 'Gap Up 200', multiplier: isCE ? 1.32 : 0.62, avoid: !isCE },
    { gap: 'Gap Up 100', multiplier: isCE ? 1.18 : 0.78, avoid: false },
    { gap: 'Gap Up 50', multiplier: isCE ? 1.10 : 0.88, avoid: false },
    { gap: 'Flat Open ⭐', multiplier: 1.00, avoid: false },
    { gap: 'Gap Down 50', multiplier: isCE ? 0.88 : 1.10, avoid: isCE },
    { gap: 'Gap Down 100', multiplier: isCE ? 0.78 : 1.18, avoid: isCE },
    { gap: 'Gap Down 200', multiplier: isCE ? 0.62 : 1.32, avoid: isCE },
    { gap: 'Gap Down 300', multiplier: isCE ? 0.50 : 1.45, avoid: isCE },
    { gap: 'Gap Down 400+', multiplier: isCE ? 0.42 : 1.55, avoid: isCE },
  ];

  return scenarios.map(sc => {
    if (sc.avoid) return { ...sc, avoid: true };
    const bz = buyZone(sc.multiplier);
    const t = targets(bz.entry);
    return { ...sc, buyZoneLow: bz.low, buyZoneHigh: bz.high, ...t, avoid: false };
  });
}

// ── DTE CALCULATOR ──
function getDTE(expiry: string): number {
  try {
    const parts = expiry.split('-');
    const months: Record<string, number> = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
    };
    const d = new Date(parseInt(parts[2]), months[parts[1]], parseInt(parts[0]));
    return Math.max(0, Math.ceil((d.getTime() - new Date().getTime()) / 86400000));
  } catch {
    return 5;
  }
}
