import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────────

interface RawRow {
  index_name: string;
  expiry: string;
  trade_date: string;
  strike_data: Record<string, any>;
}

interface ScanResult {
  index: string;
  expiry: string;
  strike: number;
  type: 'CE' | 'PE';
  prevOI: number;
  currOI: number;
  oiChange: number;
  oiChangePct: number;
  ltp: number;
  signal: 'BULLISH_BUILD' | 'BEARISH_BUILD' | 'CE_UNWIND' | 'PE_UNWIND';
  strength: 'HIGH' | 'VERY_HIGH' | 'EXTREME';
}

type FilterType = 'ALL' | 'CE' | 'PE' | 'EXTREME';
type FilterIndex = 'ALL' | 'NIFTY50' | 'BANKNIFTY' | 'FINNIFTY' | 'MIDCAPNIFTY' | 'SENSEX';

// ── Helpers ────────────────────────────────────────────────────────────────────

function getStrength(pct: number): ScanResult['strength'] | null {
  if (pct > 200) return 'EXTREME';
  if (pct > 100) return 'VERY_HIGH';
  if (pct > 50)  return 'HIGH';
  return null;
}

function getSignal(type: 'CE' | 'PE', oiChange: number): ScanResult['signal'] {
  if (type === 'CE') {
    return oiChange > 0 ? 'BEARISH_BUILD' : 'CE_UNWIND';
  }
  return oiChange > 0 ? 'BULLISH_BUILD' : 'PE_UNWIND';
}

function signalLabel(s: ScanResult['signal']): string {
  switch (s) {
    case 'BULLISH_BUILD': return 'BULLISH BUILD';
    case 'BEARISH_BUILD': return 'BEARISH BUILD';
    case 'CE_UNWIND':     return 'CE UNWIND';
    case 'PE_UNWIND':     return 'PE UNWIND';
  }
}

function signalColor(s: ScanResult['signal']): string {
  switch (s) {
    case 'BULLISH_BUILD': return '#39d98a';
    case 'BEARISH_BUILD': return '#ff4d6d';
    case 'CE_UNWIND':     return '#ff8c42';
    case 'PE_UNWIND':     return '#ff8c42';
  }
}

function signalBg(s: ScanResult['signal']): string {
  switch (s) {
    case 'BULLISH_BUILD': return 'bg-[#39d98a]/10 border-[#39d98a]/30 text-[#39d98a]';
    case 'BEARISH_BUILD': return 'bg-[#ff4d6d]/10 border-[#ff4d6d]/30 text-[#ff4d6d]';
    case 'CE_UNWIND':     return 'bg-[#ff8c42]/10 border-[#ff8c42]/30 text-[#ff8c42]';
    case 'PE_UNWIND':     return 'bg-[#ff8c42]/10 border-[#ff8c42]/30 text-[#ff8c42]';
  }
}

function strengthBadge(s: ScanResult['strength']): string {
  switch (s) {
    case 'HIGH':      return 'bg-[#f0c040]/10 border border-[#f0c040]/30 text-[#f0c040]';
    case 'VERY_HIGH': return 'bg-[#ff8c42]/10 border border-[#ff8c42]/30 text-[#ff8c42]';
    case 'EXTREME':   return 'bg-[#ff4d6d]/10 border border-[#ff4d6d]/40 text-[#ff4d6d] animate-pulse';
  }
}

function fmtOI(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function fmtExpiry(dateStr: string): string {
  if (!dateStr) return '';
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const day = parts[2].replace(/^0/, '');
  const mon = months[parseInt(parts[1], 10) - 1] ?? '';
  return `${day} ${mon}`;
}

function getAction(signal: ScanResult['signal']): { label: string; color: string; bg: string } {
  switch (signal) {
    case 'BULLISH_BUILD': return { label: 'BUY CE',  color: '#39d98a', bg: 'bg-[#39d98a]/10 border-[#39d98a]/40' };
    case 'BEARISH_BUILD': return { label: 'BUY PE',  color: '#ff4d6d', bg: 'bg-[#ff4d6d]/10 border-[#ff4d6d]/40' };
    case 'CE_UNWIND':     return { label: 'BUY',     color: '#39d98a', bg: 'bg-[#39d98a]/10 border-[#39d98a]/40' };
    case 'PE_UNWIND':     return { label: 'SELL',    color: '#ff4d6d', bg: 'bg-[#ff4d6d]/10 border-[#ff4d6d]/40' };
  }
}

const INDICES: FilterIndex[] = ['ALL', 'NIFTY50', 'BANKNIFTY', 'FINNIFTY', 'MIDCAPNIFTY', 'SENSEX'];
const INDEX_LABELS: Record<FilterIndex, string> = {
  ALL: 'All',
  NIFTY50: 'NIFTY',
  BANKNIFTY: 'BANKNIFTY',
  FINNIFTY: 'FINNIFTY',
  MIDCAPNIFTY: 'MIDCAP',
  SENSEX: 'SENSEX',
};

// ── Scanner computation ────────────────────────────────────────────────────────

function computeScans(rows: RawRow[]): {
  results: ScanResult[];
  oneDayIndices: string[];
} {
  // Group by index+expiry
  const groups = new Map<string, RawRow[]>();
  for (const row of rows) {
    const key = `${row.index_name}|||${row.expiry}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const results: ScanResult[] = [];
  const oneDayIndices: string[] = [];

  for (const [, group] of groups) {
    // Sort descending by trade_date, take latest 2
    const sorted = [...group].sort((a, b) =>
      new Date(b.trade_date).getTime() - new Date(a.trade_date).getTime()
    );

    const latest = sorted[0];
    const prev   = sorted[1];

    if (!prev) {
      const label = `${latest.index_name} (${latest.expiry})`;
      if (!oneDayIndices.includes(label)) oneDayIndices.push(label);
      continue;
    }

    const currData = latest.strike_data;
    const prevData = prev.strike_data;

    if (!currData || !prevData) continue;

    // strike_data may be keyed by strike number, each value has CE/PE OI and LTP
    for (const strikeKey of Object.keys(currData)) {
      const strike = parseFloat(strikeKey);
      if (isNaN(strike)) continue;

      const currStrike = currData[strikeKey];
      const prevStrike = prevData[strikeKey];
      if (!currStrike || !prevStrike) continue;

      for (const optType of ['CE', 'PE'] as const) {
        const pfx = optType.toLowerCase(); // 'ce' | 'pe'
        // Support both flat format (ce_oi / pe_oi) and nested format ({ CE: { oi } })
        const currOI = parseFloat(
          currStrike[`${pfx}_oi`] ??
          currStrike[optType]?.oi ??
          currStrike[optType]?.openInterest ?? 0
        );
        const prevOI = parseFloat(
          prevStrike?.[`${pfx}_oi`] ??
          prevStrike?.[optType]?.oi ??
          prevStrike?.[optType]?.openInterest ?? 0
        );
        const ltp = parseFloat(
          currStrike[`${pfx}_ltp`] ??
          currStrike[optType]?.ltp ?? 0
        );

        if (!currOI || !prevOI) continue;
        if (currOI < 500) continue;
        if (prevOI === 0) continue;

        const oiChange    = currOI - prevOI;
        const oiChangePct = Math.abs((oiChange / prevOI) * 100);

        const strength = getStrength(oiChangePct);
        if (!strength) continue;

        const signal = getSignal(optType, oiChange);

        results.push({
          index:    latest.index_name,
          expiry:   latest.expiry,
          strike,
          type:     optType,
          prevOI,
          currOI,
          oiChange,
          oiChangePct,
          ltp,
          signal,
          strength,
        });
      }
    }
  }

  // Sort by oiChangePct desc
  results.sort((a, b) => b.oiChangePct - a.oiChangePct);

  return { results, oneDayIndices };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function OptionsScanner() {
  const [results, setResults]         = useState<ScanResult[]>([]);
  const [oneDayIndices, setOneDayIdx] = useState<string[]>([]);
  const [loading, setLoading]         = useState(false);
  const [scanned, setScanned]         = useState(false);
  const [error, setError]             = useState('');

  const [filterType, setFilterType]   = useState<FilterType>('ALL');
  const [filterIndex, setFilterIndex] = useState<FilterIndex>('ALL');
  const [collapsed, setCollapsed]     = useState<Record<string, boolean>>({});
  const [guideOpen, setGuideOpen]     = useState(false);

  // ── Scan ────────────────────────────────────────────────────────────────────

  async function handleScan() {
    setLoading(true);
    setError('');
    setResults([]);
    setOneDayIdx([]);
    setScanned(false);

    try {
      const { data, error: dbErr } = await supabase
        .from('market_data')
        .select('index_name, expiry, trade_date, strike_data')
        .in('index_name', ['NIFTY50', 'BANKNIFTY', 'FINNIFTY', 'MIDCAPNIFTY', 'SENSEX'])
        .order('trade_date', { ascending: false })
        .limit(50);

      if (dbErr) throw new Error(dbErr.message);

      if (!data || data.length === 0) {
        setScanned(true);
        return;
      }

      // Drop rows for already-expired expiries so scanner only shows live contracts
      const today = new Date().toISOString().split('T')[0];
      const fresh = (data as RawRow[]).filter(r => r.expiry >= today);

      const { results: scans, oneDayIndices: odi } = computeScans(fresh);
      setResults(scans);
      setOneDayIdx(odi);
      setScanned(true);
    } catch (err: any) {
      setError(err.message || 'Scan failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const filtered = results.filter(r => {
    if (filterType === 'CE'      && r.type !== 'CE')          return false;
    if (filterType === 'PE'      && r.type !== 'PE')          return false;
    if (filterType === 'EXTREME' && r.strength !== 'EXTREME') return false;
    if (filterIndex !== 'ALL'    && r.index !== filterIndex)  return false;
    return true;
  });

  const ceCount      = results.filter(r => r.type === 'CE').length;
  const peCount      = results.filter(r => r.type === 'PE').length;
  const extremeCount = results.filter(r => r.strength === 'EXTREME').length;

  // Group filtered results by index
  const byIndex = new Map<string, ScanResult[]>();
  for (const r of filtered) {
    if (!byIndex.has(r.index)) byIndex.set(r.index, []);
    byIndex.get(r.index)!.push(r);
  }

  function toggleSection(idx: string) {
    setCollapsed(prev => ({ ...prev, [idx]: !prev[idx] }));
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
      {/* Grid background */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#1e1e2e]">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#f0c040] rounded-xl flex items-center justify-center text-lg">⚛</div>
          <div className="font-bold text-base">God Particle</div>
        </Link>
        <Link to="/dashboard" className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040]">← Dashboard</Link>
      </nav>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="text-2xl">🔭</div>
            <h1 className="text-2xl font-black">Options Scanner</h1>
          </div>
          <p className="text-xs font-mono text-[#6b6b85]">
            Detect unusual OI buildup across NIFTY, BANKNIFTY &amp; more · Flags institutional positioning
          </p>
        </div>

        {/* How to use */}
        <div className="bg-[#4d9fff]/8 border border-[#4d9fff]/25 rounded-2xl p-5">
          <div className="text-[10px] font-black uppercase tracking-widest text-[#4d9fff] mb-3">What is this?</div>
          <div className="space-y-2 text-xs font-mono text-[#6b6b85]">
            <div><span className="text-[#e8e8f0] font-black">1.</span> First, upload 2+ days of option chains from the <span className="text-[#f0c040]">God Particle Analysis</span> page (Nifty, BankNifty, FinNifty etc.).</div>
            <div><span className="text-[#e8e8f0] font-black">2.</span> Click Scan. The app compares yesterday's OI vs today's OI at every strike.</div>
            <div><span className="text-[#e8e8f0] font-black">3.</span> Strikes where OI jumped suddenly = institutional activity. Big players placed new positions there overnight.</div>
            <div><span className="text-[#e8e8f0] font-black">💡</span> <span className="text-[#39d98a]">PE buildup</span> = institutions writing puts = they expect floor here (bullish). <span className="text-[#ff4d6d]">CE buildup</span> = they expect ceiling here (bearish).</div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 space-y-5">
          {/* Scan button */}
          <button
            onClick={handleScan}
            disabled={loading}
            className="w-full bg-[#f0c040] text-black font-black py-3 rounded-xl text-sm hover:bg-[#ffd060] transition-all disabled:opacity-50"
          >
            {loading ? '⏳ Scanning option chain data...' : scanned ? '🔄 Re-Scan' : '🔭 Scan Now'}
          </button>

          {error && (
            <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-xl px-4 py-3 text-xs font-mono text-[#ff4d6d]">
              {error}
            </div>
          )}

          {/* Filters — only show after scan */}
          {scanned && results.length > 0 && (
            <div className="space-y-4">
              {/* Type filter */}
              <div>
                <div className="text-[10px] font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Type</div>
                <div className="flex gap-2 flex-wrap">
                  {(['ALL', 'CE', 'PE', 'EXTREME'] as FilterType[]).map(f => (
                    <button
                      key={f}
                      onClick={() => setFilterType(f)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-all ${
                        filterType === f
                          ? 'border-[#f0c040] bg-[#f0c040]/10 text-[#f0c040]'
                          : 'border-[#1e1e2e] bg-[#16161f] text-[#6b6b85] hover:border-[#f0c040]/30'
                      }`}
                    >
                      {f === 'EXTREME' ? '🔥 EXTREME' : f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Index filter */}
              <div>
                <div className="text-[10px] font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Index</div>
                <div className="flex gap-2 flex-wrap">
                  {INDICES.map(idx => (
                    <button
                      key={idx}
                      onClick={() => setFilterIndex(idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-all ${
                        filterIndex === idx
                          ? 'border-[#4d9fff] bg-[#4d9fff]/10 text-[#4d9fff]'
                          : 'border-[#1e1e2e] bg-[#16161f] text-[#6b6b85] hover:border-[#4d9fff]/30'
                      }`}
                    >
                      {INDEX_LABELS[idx]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-10 text-center">
            <div className="text-3xl mb-4 animate-pulse">🔭</div>
            <div className="text-sm font-mono text-[#6b6b85] animate-pulse">Scanning option chain data...</div>
            <div className="text-xs font-mono text-[#6b6b85]/60 mt-2">Comparing OI across trade dates</div>
          </div>
        )}

        {/* Stats row */}
        {scanned && !loading && results.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Signals',   value: results.length,   color: '#e8e8f0' },
              { label: 'CE Signals',      value: ceCount,          color: '#ff4d6d' },
              { label: 'PE Signals',      value: peCount,          color: '#39d98a' },
              { label: 'Extreme Signals', value: extremeCount,     color: '#ff8c42' },
            ].map(s => (
              <div key={s.label} className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-4 text-center">
                <div className="text-2xl font-black font-mono" style={{ color: s.color }}>
                  {s.value}
                </div>
                <div className="text-[10px] font-mono text-[#6b6b85] mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* One-day-only warnings */}
        {scanned && !loading && oneDayIndices.length > 0 && (
          <div className="space-y-2">
            {oneDayIndices.map(label => (
              <div
                key={label}
                className="bg-[#ff8c42]/10 border border-[#ff8c42]/30 rounded-xl px-4 py-3 text-xs font-mono text-[#ff8c42]"
              >
                ⚠ Only 1 day of data for {label} — need 2+ days to detect changes.
              </div>
            ))}
          </div>
        )}

        {/* Empty state — no data at all */}
        {scanned && !loading && results.length === 0 && oneDayIndices.length === 0 && (
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-10 text-center">
            <div className="text-4xl mb-4">📭</div>
            <div className="text-sm font-black text-[#6b6b85] mb-2">No option chain data available</div>
            <div className="text-xs font-mono text-[#6b6b85]">
              Upload chains from God Particle Analysis first.
            </div>
          </div>
        )}

        {/* Empty state — data exists but filters hide everything */}
        {scanned && !loading && results.length > 0 && filtered.length === 0 && (
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-8 text-center">
            <div className="text-3xl mb-3">🔍</div>
            <div className="text-sm font-black text-[#6b6b85]">No results match current filters</div>
            <button
              onClick={() => { setFilterType('ALL'); setFilterIndex('ALL'); }}
              className="mt-3 text-xs font-black text-[#f0c040] hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Results grouped by index */}
        {scanned && !loading && filtered.length > 0 && (
          <div className="space-y-4">
            {[...byIndex.entries()].map(([indexName, indexResults]) => (
              <div key={indexName} className="bg-[#111118] border border-[#1e1e2e] rounded-2xl overflow-hidden">
                {/* Section header */}
                <button
                  onClick={() => toggleSection(indexName)}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#16161f] transition-all"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-black text-sm text-[#e8e8f0]">{indexName}</span>
                    <span className="text-[10px] font-mono bg-[#4d9fff]/10 border border-[#4d9fff]/25 text-[#4d9fff] px-2 py-0.5 rounded-full">
                      {indexResults.length} signal{indexResults.length !== 1 ? 's' : ''}
                    </span>
                    {indexResults.some(r => r.strength === 'EXTREME') && (
                      <span className="text-[10px] font-black bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 text-[#ff4d6d] px-2 py-0.5 rounded-full animate-pulse">
                        🔥 EXTREME
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-mono text-[#6b6b85]">
                    {collapsed[indexName] ? '▼ expand' : '▲ collapse'}
                  </span>
                </button>

                {/* Rows */}
                {!collapsed[indexName] && (
                  <div className="border-t border-[#1e1e2e]">
                    {/* Table header */}
                    <div className="hidden md:grid grid-cols-[80px_auto_auto_auto_2fr_auto_auto_auto_auto] gap-3 px-6 py-2.5 bg-[#0d0d14] border-b border-[#1e1e2e] text-[10px] font-mono text-[#6b6b85] uppercase tracking-widest">
                      <span>Expiry</span>
                      <span>Strike</span>
                      <span>Type</span>
                      <span>LTP</span>
                      <span>OI Change</span>
                      <span>% Change</span>
                      <span>Signal</span>
                      <span>Strength</span>
                      <span>Action</span>
                    </div>

                    <div className="divide-y divide-[#1e1e2e]">
                      {indexResults.map((r, i) => (
                        <div
                          key={`${r.index}-${r.expiry}-${r.strike}-${r.type}-${i}`}
                          className="px-6 py-4 hover:bg-[#16161f] transition-all"
                        >
                          {/* Mobile layout */}
                          <div className="md:hidden space-y-2">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-black text-sm text-[#e8e8f0]">{r.strike}</span>
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                                  r.type === 'CE'
                                    ? 'bg-[#ff4d6d]/10 border-[#ff4d6d]/30 text-[#ff4d6d]'
                                    : 'bg-[#39d98a]/10 border-[#39d98a]/30 text-[#39d98a]'
                                }`}>{r.type}</span>
                                <span className="text-[10px] font-black font-mono text-[#f0c040]">{fmtExpiry(r.expiry)}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {(() => { const a = getAction(r.signal); return (
                                  <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${a.bg}`} style={{ color: a.color }}>
                                    {a.label}
                                  </span>
                                ); })()}
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${strengthBadge(r.strength)}`}>
                                  {r.strength}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 flex-wrap text-[11px] font-mono">
                              <span className="text-[#6b6b85]">
                                OI: <span className="text-[#e8e8f0]">{fmtOI(r.prevOI)}</span>
                                {' → '}
                                <span className="text-[#e8e8f0]">{fmtOI(r.currOI)}</span>
                              </span>
                              <span style={{ color: r.oiChange > 0 ? '#39d98a' : '#ff4d6d' }} className="font-black">
                                {r.oiChange > 0 ? '+' : ''}{r.oiChangePct.toFixed(1)}%
                              </span>
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${signalBg(r.signal)}`}>
                                {signalLabel(r.signal)}
                              </span>
                            </div>
                          </div>

                          {/* Desktop layout */}
                          <div className="hidden md:grid grid-cols-[80px_auto_auto_auto_2fr_auto_auto_auto_auto] gap-3 items-center">
                            <div className="font-black text-xs font-mono text-[#f0c040]">
                              {fmtExpiry(r.expiry)}
                            </div>
                            <div className="font-black text-sm font-mono text-[#e8e8f0] text-right">
                              {r.strike.toLocaleString('en-IN')}
                            </div>
                            <div>
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                                r.type === 'CE'
                                  ? 'bg-[#ff4d6d]/10 border-[#ff4d6d]/30 text-[#ff4d6d]'
                                  : 'bg-[#39d98a]/10 border-[#39d98a]/30 text-[#39d98a]'
                              }`}>{r.type}</span>
                            </div>
                            <div className="font-mono text-xs text-[#e8e8f0] text-right">
                              {r.ltp > 0 ? `₹${r.ltp.toFixed(2)}` : '—'}
                            </div>
                            <div className="font-mono text-xs text-[#6b6b85]">
                              {fmtOI(r.prevOI)}
                              <span className="text-[#1e1e2e] mx-1">→</span>
                              <span className="text-[#e8e8f0]">{fmtOI(r.currOI)}</span>
                              <span className="ml-2" style={{ color: r.oiChange > 0 ? '#39d98a' : '#ff4d6d' }}>
                                ({r.oiChange > 0 ? '+' : ''}{fmtOI(Math.abs(r.oiChange))})
                              </span>
                            </div>
                            <div
                              className="font-black font-mono text-sm text-right"
                              style={{ color: r.oiChange > 0 ? '#39d98a' : '#ff4d6d' }}
                            >
                              {r.oiChange > 0 ? '+' : ''}{r.oiChangePct.toFixed(1)}%
                            </div>
                            <div>
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${signalBg(r.signal)}`}>
                                {signalLabel(r.signal)}
                              </span>
                            </div>
                            <div>
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded ${strengthBadge(r.strength)}`}>
                                {r.strength}
                              </span>
                            </div>
                            <div>
                              {(() => { const a = getAction(r.signal); return (
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${a.bg}`} style={{ color: a.color }}>
                                  {a.label}
                                </span>
                              ); })()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Interpretation Guide */}
        {scanned && !loading && (
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl overflow-hidden">
            <button
              onClick={() => setGuideOpen(g => !g)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#16161f] transition-all"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">📖</span>
                <span className="font-black text-sm text-[#e8e8f0]">Interpretation Guide</span>
              </div>
              <span className="text-xs font-mono text-[#6b6b85]">{guideOpen ? '▲ collapse' : '▼ expand'}</span>
            </button>

            {guideOpen && (
              <div className="border-t border-[#1e1e2e] px-6 py-5 space-y-3">
                <div className="flex gap-3 items-start">
                  <span className="shrink-0 text-[10px] font-black bg-[#39d98a]/10 border border-[#39d98a]/30 text-[#39d98a] px-2 py-0.5 rounded mt-0.5">
                    BULLISH BUILD
                  </span>
                  <p className="text-xs font-mono text-[#6b6b85] leading-relaxed">
                    PE OI buildup = institutions writing puts = they expect a floor here.
                    Strong bullish signal for the underlying. Market makers don't expect price to fall below this strike.
                  </p>
                </div>
                <div className="flex gap-3 items-start">
                  <span className="shrink-0 text-[10px] font-black bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 text-[#ff4d6d] px-2 py-0.5 rounded mt-0.5">
                    BEARISH BUILD
                  </span>
                  <p className="text-xs font-mono text-[#6b6b85] leading-relaxed">
                    CE OI buildup = institutions writing calls = they expect a ceiling here.
                    Bearish signal — market expected to stay below this strike through expiry.
                  </p>
                </div>
                <div className="flex gap-3 items-start">
                  <span className="shrink-0 text-[10px] font-black bg-[#ff8c42]/10 border border-[#ff8c42]/30 text-[#ff8c42] px-2 py-0.5 rounded mt-0.5">
                    UNWIND
                  </span>
                  <p className="text-xs font-mono text-[#6b6b85] leading-relaxed">
                    OI declining at a strike = positions being closed or rolled over. May indicate a shift in institutional view.
                    Watch for price action confirmation before acting.
                  </p>
                </div>
                <div className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl p-4 space-y-2">
                  <div className="text-[10px] font-mono text-[#6b6b85] uppercase tracking-widest mb-1">Strength Guide</div>
                  {[
                    { badge: strengthBadge('HIGH'),      label: 'HIGH',      desc: 'OI change > 50% — moderate institutional activity' },
                    { badge: strengthBadge('VERY_HIGH'), label: 'VERY_HIGH', desc: 'OI change > 100% — significant positioning' },
                    { badge: strengthBadge('EXTREME'),   label: 'EXTREME',   desc: 'OI change > 200% — strong institutional signal. Treat as high-conviction level.' },
                  ].map(s => (
                    <div key={s.label} className="flex gap-3 items-center">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded shrink-0 ${s.badge}`}>{s.label}</span>
                      <span className="text-[11px] font-mono text-[#6b6b85]">{s.desc}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] font-mono text-[#6b6b85]">
                  Data sourced from uploaded option chains · Not financial advice · Use in confluence with GCT analysis
                </p>
              </div>
            )}
          </div>
        )}

        {/* Footer note — always visible */}
        {!scanned && !loading && (
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-8 text-center">
            <div className="text-4xl mb-4">🔭</div>
            <div className="text-sm font-black text-[#e8e8f0] mb-2">Ready to scan</div>
            <div className="text-xs font-mono text-[#6b6b85]">
              Hit <span className="text-[#f0c040]">Scan Now</span> to analyse option chain OI across all uploaded indices.
              Signals are based on OI change between the two most recent trade dates.
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
