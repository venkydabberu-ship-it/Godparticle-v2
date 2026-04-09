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

export async function uploadMarketData(
  indexName: string,
  expiry: string,
  tradeDate: string,
  strikeData: Record<string, any>,
  uploadedBy: string
) {
  const { data, error } = await supabase
    .from('market_data')
    .upsert({
      index_name: indexName,
      expiry,
      trade_date: tradeDate,
      strike_data: strikeData,
      uploaded_by: uploadedBy
    }, {
      onConflict: 'index_name,expiry,trade_date'
    });
  if (error) throw error;
  return data;
}

export async function getMarketData(
  indexName: string,
  expiry: string
) {
  const { data, error } = await supabase
    .from('market_data')
    .select('*')
    .eq('index_name', indexName)
    .eq('expiry', expiry)
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
  const { data, error } = await supabase
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
  return data;
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

export function computeGodParticle(
  data: any[],
  strike: number,
  optType: string,
  expiry: string
) {
  const decomp = data.map((d: any, i: number) => {
    const dOI = d.chng_oi !== 0 ? d.chng_oi : (i === 0 ? 0 : d.oi - data[i - 1].oi);
    return {
      ...d,
      dOI,
      NO: Math.max(0, (d.volume + dOI) / 2),
      SQ: Math.max(0, (d.volume - dOI) / 2)
    };
  });

  const sv = data.reduce((s: number, d: any) => s + d.volume, 0) || 1;
  const so = data.reduce((s: number, d: any) => s + d.oi, 0) || 1;
  const sn = decomp.reduce((s: number, d: any) => s + d.NO, 0) || 1;

  const vwap = data.reduce((s: number, d: any) => s + d.close * d.volume, 0) / sv;
  const oiwap = data.reduce((s: number, d: any) => s + d.close * d.oi, 0) / so;
  const pcb = decomp.reduce((s: number, d: any) => s + d.close * d.NO, 0) / sn;

  const dte = getDTE(expiry);
  const lc = data[data.length - 1].close;

  return {
    data,
    decomp,
    strike,
    optType,
    expiry,
    dte,
    vwap: Math.round(vwap * 100) / 100,
    oiwap: Math.round(oiwap * 100) / 100,
    pcb: Math.round(pcb * 100) / 100,
    lc
  };
}

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