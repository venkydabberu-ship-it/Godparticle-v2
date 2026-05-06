import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { callEdge } from '../lib/supabase';
import { searchStocks } from '../lib/stockList';

// ── Types ──────────────────────────────────────────────────────────────────────

interface GCTLevels {
  al: number;
  mgc: number;
  cl: number;
  l1: number;
  l2: number;
  u1: number;
  u2: number;
  currentPrice: number;
  zone: string;
}

interface ConfluenceGroup {
  price: number;
  members: { price: number; tf: string; name: string }[];
  label: string;
  strength: 1 | 2 | 3;
}

// ── GCT computation ────────────────────────────────────────────────────────────

// lookback: how many candles to use for the high/low range calculation.
// Fewer candles = tighter, more recent levels (short-term view).
// currentPrice always comes from the very last candle regardless of lookback.
function computeGCT(records: any[], lookback?: number): GCTLevels | null {
  if (records.length < 6) return null;
  const allCloses = records.map(r => parseFloat(r.CH_CLOSING_PRICE)).filter(v => v > 0);
  if (!allCloses.length) return null;
  const currentPrice = allCloses[allCloses.length - 1];

  // Apply lookback window for range calculation
  const window = lookback ? records.slice(-Math.max(lookback, 6)) : records;
  const closes = window.map(r => parseFloat(r.CH_CLOSING_PRICE)).filter(v => v > 0);
  if (!closes.length) return null;

  // Use closing price range — monthly closes span 14 months, daily closes span 20 days,
  // so each timeframe naturally produces genuinely different levels
  const maxHigh = Math.max(...closes);
  const minLow = Math.min(...closes);
  const avgClose = closes.reduce((s, v) => s + v, 0) / closes.length;
  const range = maxHigh - minLow;
  if (range === 0) return null;

  const al = Math.round(maxHigh * 0.97);
  const mgc = Math.round(avgClose);
  const cl = Math.round(minLow + range * 0.15);
  const l1 = Math.round(minLow + range * 0.08);
  const l2 = Math.round(minLow);
  const u1 = Math.round(maxHigh * 1.08);
  const u2 = Math.round(maxHigh * 1.18);

  const zone =
    currentPrice >= al ? 'BUY ZONE'
    : currentPrice >= mgc ? 'WATCH ZONE'
    : currentPrice >= cl ? 'DANGER ZONE'
    : 'CRASH ZONE';

  return { al, mgc, cl, l1, l2, u1, u2, currentPrice, zone };
}

// ── Confluence detection ───────────────────────────────────────────────────────

function findConfluences(
  monthly: GCTLevels,
  weekly: GCTLevels,
  daily: GCTLevels,
): ConfluenceGroup[] {
  const allLevels = [
    { price: monthly.al, tf: 'M', name: 'AL' },
    { price: monthly.mgc, tf: 'M', name: 'MGC' },
    { price: monthly.cl, tf: 'M', name: 'CL' },
    { price: weekly.al, tf: 'W', name: 'AL' },
    { price: weekly.mgc, tf: 'W', name: 'MGC' },
    { price: weekly.cl, tf: 'W', name: 'CL' },
    { price: daily.al, tf: 'D', name: 'AL' },
    { price: daily.mgc, tf: 'D', name: 'MGC' },
    { price: daily.cl, tf: 'D', name: 'CL' },
  ].filter(l => l.price > 0);

  const groups: ConfluenceGroup[] = [];
  const used = new Set<number>();

  for (let i = 0; i < allLevels.length; i++) {
    if (used.has(i)) continue;
    const group = [allLevels[i]];
    used.add(i);
    for (let j = i + 1; j < allLevels.length; j++) {
      if (used.has(j)) continue;
      if (
        Math.abs(allLevels[j].price - allLevels[i].price) / allLevels[i].price <
        0.02
      ) {
        group.push(allLevels[j]);
        used.add(j);
      }
    }
    const avgPrice = Math.round(
      group.reduce((s, m) => s + m.price, 0) / group.length,
    );
    const label = group.map(m => `${m.tf}:${m.name}`).join(' + ');
    const strength = Math.min(3, group.length) as 1 | 2 | 3;
    groups.push({ price: avgPrice, members: group, label, strength });
  }

  return groups.sort((a, b) => b.strength - a.strength);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function zoneBadge(zone: string) {
  if (zone === 'BUY ZONE')
    return (
      <span className="text-[9px] font-black bg-[#39d98a]/20 text-[#39d98a] border border-[#39d98a]/40 px-2 py-0.5 rounded-full">
        {zone}
      </span>
    );
  if (zone === 'WATCH ZONE')
    return (
      <span className="text-[9px] font-black bg-[#f0c040]/20 text-[#f0c040] border border-[#f0c040]/40 px-2 py-0.5 rounded-full">
        {zone}
      </span>
    );
  if (zone === 'DANGER ZONE')
    return (
      <span className="text-[9px] font-black bg-[#ff8c42]/20 text-[#ff8c42] border border-[#ff8c42]/40 px-2 py-0.5 rounded-full">
        {zone}
      </span>
    );
  return (
    <span className="text-[9px] font-black bg-[#ff4d6d]/20 text-[#ff4d6d] border border-[#ff4d6d]/40 px-2 py-0.5 rounded-full">
      {zone}
    </span>
  );
}

interface LevelRowProps {
  label: string;
  price: number;
  highlight?: boolean;
  color?: string;
}

function LevelRow({ label, price, color = '#6b6b85' }: LevelRowProps) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-[#1e1e2e]/50 last:border-0">
      <span className="text-[10px] font-mono" style={{ color }}>
        {label}
      </span>
      <span className="text-[11px] font-black font-mono" style={{ color }}>
        {fmt(price)}
      </span>
    </div>
  );
}

interface TFCardProps {
  label: string;
  gct: GCTLevels;
}

function TFCard({ label, gct }: TFCardProps) {
  return (
    <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 flex-1 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-black text-[#6b6b85] uppercase tracking-widest">
          {label}
        </span>
        {zoneBadge(gct.zone)}
      </div>
      <div className="text-lg font-black font-mono text-[#e8e8f0] mb-3">
        {fmt(gct.currentPrice)}
      </div>
      <div className="space-y-0">
        <LevelRow label="U2" price={gct.u2} color="#4d9fff" />
        <LevelRow label="U1" price={gct.u1} color="#4d9fff" />
        <LevelRow label="AL" price={gct.al} color="#39d98a" />
        <LevelRow label="MGC" price={gct.mgc} color="#f0c040" />
        <LevelRow label="CL" price={gct.cl} color="#ff8c42" />
        <LevelRow label="L1" price={gct.l1} color="#ff4d6d" />
        <LevelRow label="L2" price={gct.l2} color="#ff4d6d" />
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function MultiGCT() {
  const [symbol, setSymbol] = useState('');
  const [exchange, setExchange] = useState<'NSE' | 'BSE'>('NSE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [monthlyGCT, setMonthlyGCT] = useState<GCTLevels | null>(null);
  const [weeklyGCT, setWeeklyGCT] = useState<GCTLevels | null>(null);
  const [dailyGCT, setDailyGCT] = useState<GCTLevels | null>(null);
  const [confluences, setConfluences] = useState<ConfluenceGroup[]>([]);

  const [suggestions, setSuggestions] = useState<{ symbol: string; name: string }[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  function handleSymbolChange(val: string) {
    setSymbol(val);
    const results = searchStocks(val, exchange);
    setSuggestions(results);
    setShowDropdown(results.length > 0 && val.length > 0);
  }

  function selectSuggestion(s: { symbol: string; name: string }) {
    setSymbol(s.symbol);
    setSuggestions([]);
    setShowDropdown(false);
  }

  async function handleAnalyse() {
    const sym = symbol.trim().toUpperCase();
    if (!sym) {
      setError('Enter a stock symbol first.');
      return;
    }
    setLoading(true);
    setError('');
    setMonthlyGCT(null);
    setWeeklyGCT(null);
    setDailyGCT(null);
    setConfluences([]);

    try {
      const [mRes, wRes, dRes] = await Promise.all([
        callEdge('smooth-endpoint', { type: 'stock_price', symbol: sym, exchange }),
        callEdge('smooth-endpoint', {
          type: 'stock_price',
          symbol: sym,
          exchange,
          interval: 'weekly',
          range: '1y',
        }),
        callEdge('smooth-endpoint', {
          type: 'stock_price',
          symbol: sym,
          exchange,
          interval: 'daily',
          range: '3mo',
        }),
      ]);

      const mRecords: any[] = mRes?.data?.data || [];
      const wRecords: any[] = wRes?.data?.data || [];
      const dRecords: any[] = dRes?.data?.data || [];

      if (!mRecords.length && !wRecords.length && !dRecords.length) {
        throw new Error(
          `No data found for "${sym}" on ${exchange}. Check the symbol (e.g. SBIN, RELIANCE).`,
        );
      }

      // Each timeframe uses a proportional lookback so levels are genuinely different:
      // Monthly: full ~14 candles (long-term structural view)
      // Weekly: last 26 candles (~6 months — medium-term trend)
      // Daily: last 20 candles (~1 trading month — short-term momentum)
      const m = computeGCT(mRecords);
      const w = computeGCT(wRecords, 26);
      const d = computeGCT(dRecords, 20);

      if (!m && !w && !d) {
        throw new Error('Not enough candles to compute GCT. Try a different symbol.');
      }

      setMonthlyGCT(m);
      setWeeklyGCT(w);
      setDailyGCT(d);

      if (m && w && d) {
        setConfluences(findConfluences(m, w, d));
      }
    } catch (err: any) {
      setError(err.message || 'Analysis failed.');
    } finally {
      setLoading(false);
    }
  }

  // ── Trading signal logic ───────────────────────────────────────────────────

  function tradingSignal() {
    if (!monthlyGCT || !weeklyGCT || !dailyGCT) return null;
    const zones = [monthlyGCT.zone, weeklyGCT.zone, dailyGCT.zone];
    const allSame = zones.every(z => z === zones[0]);
    const dominant = zones
      .reduce<Record<string, number>>((acc, z) => {
        acc[z] = (acc[z] || 0) + 1;
        return acc;
      }, {});
    const top = Object.entries(dominant).sort((a, b) => b[1] - a[1])[0];

    const zoneAction: Record<string, string> = {
      'BUY ZONE': 'BUY',
      'WATCH ZONE': 'WAIT',
      'DANGER ZONE': 'CAUTION',
      'CRASH ZONE': 'AVOID / SHORT',
    };

    return {
      allSame,
      zone: zones[0],
      topZone: top[0],
      topCount: top[1],
      action: zoneAction[top[0]] || 'WAIT',
      monthly: monthlyGCT.zone,
      weekly: weeklyGCT.zone,
      daily: dailyGCT.zone,
    };
  }

  const sig = tradingSignal();
  const hasResults = monthlyGCT || weeklyGCT || dailyGCT;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
      {/* grid bg */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#1e1e2e]">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#f0c040] rounded-xl flex items-center justify-center text-lg">
            ⚛
          </div>
          <div className="font-bold text-base">God Particle</div>
        </Link>
        <Link
          to="/dashboard"
          className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040]"
        >
          ← Dashboard
        </Link>
      </nav>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="text-2xl">🔭</div>
            <h1 className="text-2xl font-black">Multi-Timeframe GCT</h1>
          </div>
          <p className="text-xs font-mono text-[#6b6b85]">
            Monthly · Weekly · Daily confluence analysis — identify the strongest
            GCT levels across all timeframes
          </p>
        </div>

        {/* How to use */}
        <div className="bg-[#4d9fff]/8 border border-[#4d9fff]/25 rounded-2xl p-5">
          <div className="text-[10px] font-black uppercase tracking-widest text-[#4d9fff] mb-3">What is this?</div>
          <div className="space-y-2 text-xs font-mono text-[#6b6b85]">
            <div><span className="text-[#e8e8f0] font-black">1.</span> Enter any NSE stock symbol and click Analyse.</div>
            <div><span className="text-[#e8e8f0] font-black">2.</span> The app fetches 3 timeframes — monthly (14 months), weekly (6 months), daily (1 month) — and runs GCT on each.</div>
            <div><span className="text-[#e8e8f0] font-black">3.</span> Where two or more timeframes point to the <span className="text-[#f0c040]">same price level</span>, that's a Confluence Zone — the strongest support/resistance.</div>
            <div><span className="text-[#e8e8f0] font-black">💡</span> Triple Confluence = all 3 timeframes agree → highest conviction level to buy/sell/set SL at.</div>
          </div>
        </div>

        {/* ── Search + controls ── */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Symbol search */}
            <div className="md:col-span-2 relative" ref={dropdownRef}>
              <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                Stock Symbol
              </label>
              <input
                type="text"
                value={symbol}
                onChange={e => handleSymbolChange(e.target.value)}
                onFocus={() => symbol && setShowDropdown(suggestions.length > 0)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                placeholder="e.g. RELIANCE, SBIN, NIFTY50"
                className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040] uppercase placeholder:normal-case placeholder:text-[#6b6b85]"
              />
              {showDropdown && (
                <div className="absolute left-0 right-0 top-[calc(100%+4px)] bg-[#16161f] border border-[#1e1e2e] rounded-xl z-50 overflow-hidden shadow-xl">
                  {suggestions.map(s => (
                    <button
                      key={s.symbol}
                      onMouseDown={() => selectSuggestion(s)}
                      className="w-full text-left px-4 py-2.5 hover:bg-[#1e1e2e] flex items-center justify-between"
                    >
                      <span className="text-xs font-black text-[#e8e8f0]">
                        {s.symbol}
                      </span>
                      <span className="text-[10px] font-mono text-[#6b6b85] truncate max-w-[200px]">
                        {s.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Exchange toggle */}
            <div>
              <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                Exchange
              </label>
              <div className="flex gap-2">
                {(['NSE', 'BSE'] as const).map(ex => (
                  <button
                    key={ex}
                    onClick={() => setExchange(ex)}
                    className={`flex-1 py-2.5 rounded-lg text-xs font-black transition-all border ${
                      exchange === ex
                        ? 'border-[#f0c040] bg-[#f0c040]/10 text-[#f0c040]'
                        : 'border-[#1e1e2e] bg-[#16161f] text-[#6b6b85]'
                    }`}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={handleAnalyse}
            disabled={loading}
            className="w-full bg-[#f0c040] text-black font-black py-3 rounded-xl text-sm hover:bg-[#ffd060] transition-all disabled:opacity-50"
          >
            {loading ? '⏳ Fetching 3 timeframes...' : '🔭 Analyse All Timeframes'}
          </button>

          {error && (
            <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-xl px-4 py-3 text-xs font-mono text-[#ff4d6d]">
              {error}
            </div>
          )}
        </div>

        {/* ── Loading spinner ── */}
        {loading && (
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-12 text-center">
            <div className="text-4xl mb-4 animate-spin inline-block">⚛</div>
            <div className="text-sm font-black text-[#f0c040]">
              Fetching 3 timeframes...
            </div>
            <div className="text-xs font-mono text-[#6b6b85] mt-1">
              Monthly · Weekly · Daily — running in parallel
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {!loading && hasResults && (
          <div className="space-y-6">
            {/* 2-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: 3 TF mini cards */}
              <div className="space-y-3">
                <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest">
                  Timeframe Breakdown
                </div>
                <div className="flex gap-3">
                  {monthlyGCT && <TFCard label="Monthly" gct={monthlyGCT} />}
                  {weeklyGCT && <TFCard label="Weekly" gct={weeklyGCT} />}
                  {dailyGCT && <TFCard label="Daily" gct={dailyGCT} />}
                </div>
              </div>

              {/* Right: Confluence zones */}
              <div className="space-y-3">
                <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest">
                  Confluence Zones
                </div>
                <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5 space-y-3">
                  {confluences.length === 0 ? (
                    <div className="text-center py-6">
                      <div className="text-2xl mb-2">🔍</div>
                      <div className="text-xs font-mono text-[#6b6b85]">
                        No confluence zones found within 2% tolerance.
                      </div>
                    </div>
                  ) : (
                    confluences.map((c, i) => (
                      <div
                        key={i}
                        className={`rounded-xl p-3 border ${
                          c.strength === 3
                            ? 'border-[#ff4d6d]/50 bg-[#ff4d6d]/5'
                            : c.strength === 2
                            ? 'border-[#ff8c42]/50 bg-[#ff8c42]/5'
                            : 'border-[#1e1e2e] bg-[#16161f]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-black font-mono text-[#e8e8f0]">
                            {fmt(c.price)}
                          </span>
                          {c.strength === 3 && (
                            <span className="text-[9px] font-black bg-[#ff4d6d]/20 text-[#ff4d6d] border border-[#ff4d6d]/40 px-2 py-0.5 rounded-full">
                              TRIPLE CONFLUENCE
                            </span>
                          )}
                          {c.strength === 2 && (
                            <span className="text-[9px] font-black bg-[#ff8c42]/20 text-[#ff8c42] border border-[#ff8c42]/40 px-2 py-0.5 rounded-full">
                              DOUBLE CONFLUENCE
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-[#6b6b85]">
                          {c.label}
                        </div>
                        <div className="mt-1.5 flex gap-1 flex-wrap">
                          {c.members.map((m, j) => (
                            <span
                              key={j}
                              className="text-[9px] font-black bg-[#16161f] border border-[#1e1e2e] px-1.5 py-0.5 rounded text-[#4d9fff]"
                            >
                              {m.tf}:{m.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Trading signal card */}
            {sig && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
                <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-4">
                  Trading Signal
                </div>

                {sig.allSame ? (
                  <div className="flex items-start gap-4">
                    <div className="text-3xl">🔥</div>
                    <div>
                      <div className="text-base font-black text-[#e8e8f0] mb-1">
                        Triple Timeframe Alignment on{' '}
                        <span
                          className={
                            sig.zone === 'BUY ZONE'
                              ? 'text-[#39d98a]'
                              : sig.zone === 'WATCH ZONE'
                              ? 'text-[#f0c040]'
                              : sig.zone === 'DANGER ZONE'
                              ? 'text-[#ff8c42]'
                              : 'text-[#ff4d6d]'
                          }
                        >
                          {sig.zone}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-[#6b6b85]">
                        Monthly, Weekly, and Daily all agree — strong{' '}
                        <span className="text-[#e8e8f0] font-black">
                          {sig.action}
                        </span>{' '}
                        signal. Highest conviction entry/exit.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-sm font-black text-[#e8e8f0] mb-2">
                      Mixed timeframe signals — dominant zone:{' '}
                      <span
                        className={
                          sig.topZone === 'BUY ZONE'
                            ? 'text-[#39d98a]'
                            : sig.topZone === 'WATCH ZONE'
                            ? 'text-[#f0c040]'
                            : sig.topZone === 'DANGER ZONE'
                            ? 'text-[#ff8c42]'
                            : 'text-[#ff4d6d]'
                        }
                      >
                        {sig.topZone}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-[#6b6b85] mb-4">
                      Price is in {sig.topZone} on {sig.topCount}/3 timeframes —
                      watch for alignment before committing.
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      {[
                        { label: 'Monthly', zone: sig.monthly },
                        { label: 'Weekly', zone: sig.weekly },
                        { label: 'Daily', zone: sig.daily },
                      ].map(({ label, zone }) => (
                        <div
                          key={label}
                          className="bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2"
                        >
                          <div className="text-[9px] font-mono text-[#6b6b85] uppercase mb-1">
                            {label}
                          </div>
                          {zoneBadge(zone)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top confluences as key levels */}
                {confluences.filter(c => c.strength >= 2).length > 0 && (
                  <div className="mt-4 pt-4 border-t border-[#1e1e2e]">
                    <div className="text-[10px] font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                      Key Confluence Levels to Watch
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {confluences
                        .filter(c => c.strength >= 2)
                        .slice(0, 4)
                        .map((c, i) => (
                          <div
                            key={i}
                            className={`rounded-lg px-3 py-1.5 border ${
                              c.strength === 3
                                ? 'border-[#ff4d6d]/40 bg-[#ff4d6d]/10 text-[#ff4d6d]'
                                : 'border-[#ff8c42]/40 bg-[#ff8c42]/10 text-[#ff8c42]'
                            }`}
                          >
                            <div className="text-xs font-black font-mono">
                              {fmt(c.price)}
                            </div>
                            <div className="text-[9px] font-mono opacity-80">
                              {c.label}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <p className="text-[10px] font-mono text-[#6b6b85] text-center">
              Data from Yahoo Finance · Delayed 15–20 min · Not financial advice
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
