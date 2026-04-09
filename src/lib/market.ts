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
      ce_vol: num(p[3]