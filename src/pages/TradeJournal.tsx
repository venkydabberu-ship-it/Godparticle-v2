import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Trade {
  id: string;
  symbol: string;
  trade_type: string;
  direction: string;
  entry_price: number;
  entry_date: string;
  qty: number;
  exit_price: number | null;
  exit_date: string | null;
  notes: string | null;
  gct_zone: string | null;
  created_at: string;
}

type TradeType = 'CE' | 'PE' | 'STOCK' | 'INTRADAY';
type Direction = 'BUY' | 'SELL';
type GCTZone = 'BUY ZONE' | 'WATCH ZONE' | 'DANGER ZONE' | 'CRASH ZONE' | '';

const SETUP_SQL = `CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol TEXT NOT NULL,
  trade_type TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'BUY',
  entry_price NUMERIC NOT NULL,
  entry_date DATE NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  exit_price NUMERIC,
  exit_date DATE,
  notes TEXT,
  gct_zone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trades_own" ON trades FOR ALL USING (auth.uid() = user_id);`;

// ── Stats helpers ──────────────────────────────────────────────────────────────

function computeStats(trades: Trade[]) {
  const closed = trades.filter(t => t.exit_price !== null);
  const open = trades.filter(t => t.exit_price === null);

  const wins = closed.filter(t => {
    const entry = Number(t.entry_price);
    const exit = Number(t.exit_price!);
    return t.direction === 'BUY' ? exit > entry : exit < entry;
  });

  const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;

  const totalPnL = closed.reduce((sum, t) => {
    const entry = Number(t.entry_price);
    const exit = Number(t.exit_price!);
    const qty = Number(t.qty);
    const pnl = t.direction === 'BUY' ? (exit - entry) * qty : (entry - exit) * qty;
    return sum + pnl;
  }, 0);

  const rrValues = wins.map(t => {
    const entry = Number(t.entry_price);
    const exit = Number(t.exit_price!);
    const risk = entry * 0.03;
    const profit =
      t.direction === 'BUY' ? exit - entry : entry - exit;
    return risk > 0 ? profit / risk : 0;
  }).filter(v => v > 0);

  const avgRR =
    rrValues.length > 0
      ? rrValues.reduce((s, v) => s + v, 0) / rrValues.length
      : 0;

  return {
    totalTrades: trades.length,
    openTrades: open.length,
    closedTrades: closed.length,
    winRate,
    totalPnL,
    avgRR,
    wins: wins.length,
    closedTrades2: closed.length,
  };
}

function tradePnL(t: Trade): number | null {
  if (t.exit_price === null) return null;
  const entry = Number(t.entry_price);
  const exit = Number(t.exit_price);
  const qty = Number(t.qty);
  return t.direction === 'BUY' ? (exit - entry) * qty : (entry - exit) * qty;
}

// ── AI Pattern Insights ────────────────────────────────────────────────────────

function getInsights(trades: Trade[]): string[] {
  const insights: string[] = [];
  if (trades.length === 0) return insights;

  const stats = computeStats(trades);

  if (stats.closedTrades > 2 && stats.winRate < 40) {
    insights.push(
      '⚠ You\'re winning less than 40% of trades. Check if you\'re entering at GCT buy zones.',
    );
  }

  const closed = trades.filter(t => t.exit_price !== null);
  const dangerCrashCount = closed.filter(
    t => t.gct_zone === 'DANGER ZONE' || t.gct_zone === 'CRASH ZONE',
  ).length;
  if (closed.length > 0 && dangerCrashCount > closed.length / 2) {
    insights.push(
      '📍 Most trades entered in Danger/Crash zone — high risk entries. Wait for BUY ZONE.',
    );
  }

  if (stats.closedTrades >= 3 && stats.avgRR > 2) {
    insights.push(
      '✅ Strong R:R ratio — you\'re letting winners run.',
    );
  }

  if (stats.openTrades > 5) {
    insights.push(
      '🚨 You have 5+ open positions — manage risk.',
    );
  }

  return insights.slice(0, 2);
}

// ── Zone badge ─────────────────────────────────────────────────────────────────

function ZoneBadge({ zone }: { zone: string | null }) {
  if (!zone) return <span className="text-[#6b6b85] font-mono text-[10px]">—</span>;
  const map: Record<string, string> = {
    'BUY ZONE': 'text-[#39d98a] bg-[#39d98a]/10 border-[#39d98a]/30',
    'WATCH ZONE': 'text-[#f0c040] bg-[#f0c040]/10 border-[#f0c040]/30',
    'DANGER ZONE': 'text-[#ff8c42] bg-[#ff8c42]/10 border-[#ff8c42]/30',
    'CRASH ZONE': 'text-[#ff4d6d] bg-[#ff4d6d]/10 border-[#ff4d6d]/30',
  };
  const cls = map[zone] ?? 'text-[#6b6b85] bg-[#16161f] border-[#1e1e2e]';
  return (
    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${cls}`}>
      {zone}
    </span>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function TradeJournal() {
  const { user } = useAuth();

  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // Form state
  const [symbol, setSymbol] = useState('');
  const [tradeType, setTradeType] = useState<TradeType>('STOCK');
  const [direction, setDirection] = useState<Direction>('BUY');
  const [entryPrice, setEntryPrice] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [qty, setQty] = useState('1');
  const [exitPrice, setExitPrice] = useState('');
  const [exitDate, setExitDate] = useState('');
  const [gctZone, setGctZone] = useState<GCTZone>('');
  const [notes, setNotes] = useState('');

  // ── Load trades ──────────────────────────────────────────────────────────────

  async function loadTrades() {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .order('entry_date', { ascending: false });

      if (error) {
        if (
          error.message?.toLowerCase().includes('does not exist') ||
          error.code === '42P01'
        ) {
          setSetupRequired(true);
        }
        setTrades([]);
      } else {
        setTrades((data as Trade[]) || []);
        setSetupRequired(false);
      }
    } catch {
      setSetupRequired(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTrades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── Submit ───────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!user) return;
    if (!symbol.trim() || !entryPrice || !entryDate || !qty) {
      setFormError('Symbol, entry price, date, and quantity are required.');
      return;
    }
    setSubmitLoading(true);
    setFormError('');
    try {
      const { error } = await supabase.from('trades').insert({
        user_id: user.id,
        symbol: symbol.trim().toUpperCase(),
        trade_type: tradeType,
        direction,
        entry_price: parseFloat(entryPrice),
        entry_date: entryDate,
        qty: parseInt(qty),
        exit_price: exitPrice ? parseFloat(exitPrice) : null,
        exit_date: exitDate || null,
        gct_zone: gctZone || null,
        notes: notes.trim() || null,
      });
      if (error) throw error;
      resetForm();
      setShowForm(false);
      await loadTrades();
    } catch (err: any) {
      setFormError(err.message || 'Failed to log trade.');
    } finally {
      setSubmitLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!user) return;
    await supabase.from('trades').delete().eq('id', id).eq('user_id', user.id);
    setTrades(prev => prev.filter(t => t.id !== id));
  }

  function resetForm() {
    setSymbol('');
    setTradeType('STOCK');
    setDirection('BUY');
    setEntryPrice('');
    setEntryDate('');
    setQty('1');
    setExitPrice('');
    setExitDate('');
    setGctZone('');
    setNotes('');
    setFormError('');
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const stats = computeStats(trades);
  const insights = getInsights(trades);

  const fmt = (n: number) =>
    `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
      {/* Grid background */}
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

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="text-2xl">📒</div>
              <h1 className="text-2xl font-black">Trade Journal</h1>
            </div>
            <p className="text-xs font-mono text-[#6b6b85]">
              Log every trade · Track P&amp;L · Spot patterns · Improve your edge
            </p>
          </div>
          {!setupRequired && (
            <button
              onClick={() => { setShowForm(s => !s); if (!showForm) resetForm(); }}
              className="shrink-0 bg-[#f0c040] text-black font-black text-xs px-4 py-2.5 rounded-xl hover:bg-[#ffd060] transition-all"
            >
              {showForm ? '✕ Cancel' : '+ Add Trade'}
            </button>
          )}
        </div>

        {/* Setup required banner */}
        {setupRequired && (
          <div className="bg-[#111118] border border-[#ff8c42]/40 rounded-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="text-2xl">⚙</div>
              <div>
                <div className="text-sm font-black text-[#ff8c42] mb-1">
                  Setup Required
                </div>
                <div className="text-xs font-mono text-[#6b6b85]">
                  Run this SQL in your Supabase dashboard to enable Trade Journal:
                </div>
              </div>
            </div>
            <pre className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl p-4 text-[11px] font-mono text-[#4d9fff] overflow-x-auto whitespace-pre-wrap">
              {SETUP_SQL}
            </pre>
          </div>
        )}

        {/* Stats row */}
        {!setupRequired && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                label: 'Open Trades',
                value: stats.openTrades.toString(),
                color: '#4d9fff',
                sub: `of ${stats.totalTrades} total`,
              },
              {
                label: 'Closed',
                value: stats.closedTrades.toString(),
                color: '#e8e8f0',
                sub: `${stats.wins} wins`,
              },
              {
                label: 'Win Rate',
                value:
                  stats.closedTrades > 0
                    ? `${stats.winRate.toFixed(1)}%`
                    : '—',
                color:
                  stats.winRate >= 55
                    ? '#39d98a'
                    : stats.winRate >= 40
                    ? '#f0c040'
                    : stats.closedTrades > 0
                    ? '#ff4d6d'
                    : '#6b6b85',
                sub:
                  stats.closedTrades > 0
                    ? `${stats.wins}W / ${stats.closedTrades - stats.wins}L`
                    : 'no closed trades',
              },
              {
                label: 'Total P&L',
                value:
                  stats.closedTrades > 0
                    ? fmt(Math.abs(stats.totalPnL))
                    : '—',
                color:
                  stats.closedTrades === 0
                    ? '#6b6b85'
                    : stats.totalPnL >= 0
                    ? '#39d98a'
                    : '#ff4d6d',
                sub:
                  stats.totalPnL !== 0
                    ? stats.totalPnL >= 0
                      ? 'Net profit'
                      : 'Net loss'
                    : '',
                prefix: stats.closedTrades > 0 && stats.totalPnL < 0 ? '-' : '',
              },
            ].map(card => (
              <div
                key={card.label}
                className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5"
              >
                <div className="text-[10px] font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                  {card.label}
                </div>
                <div
                  className="text-2xl font-black font-mono"
                  style={{ color: card.color }}
                >
                  {card.prefix}{card.value}
                </div>
                {card.sub && (
                  <div className="text-[10px] font-mono text-[#6b6b85] mt-1">
                    {card.sub}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add Trade form */}
        {showForm && !setupRequired && (
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 space-y-5">
            <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest">
              Log New Trade
            </div>

            {/* Symbol */}
            <div>
              <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                Symbol
              </label>
              <input
                type="text"
                value={symbol}
                onChange={e => setSymbol(e.target.value.toUpperCase())}
                placeholder="e.g. RELIANCE, NIFTY24DECCE"
                className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040] uppercase placeholder:normal-case placeholder:text-[#6b6b85]"
              />
            </div>

            {/* Type + Direction */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                  Trade Type
                </label>
                <div className="flex gap-2">
                  {(['CE', 'PE', 'STOCK', 'INTRADAY'] as TradeType[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setTradeType(t)}
                      className={`flex-1 py-2 rounded-lg text-[10px] font-black transition-all border ${
                        tradeType === t
                          ? 'border-[#f0c040] bg-[#f0c040]/10 text-[#f0c040]'
                          : 'border-[#1e1e2e] bg-[#16161f] text-[#6b6b85]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                  Direction
                </label>
                <div className="flex gap-2">
                  {(['BUY', 'SELL'] as Direction[]).map(d => (
                    <button
                      key={d}
                      onClick={() => setDirection(d)}
                      className={`flex-1 py-2 rounded-lg text-xs font-black transition-all border ${
                        direction === d
                          ? d === 'BUY'
                            ? 'border-[#39d98a] bg-[#39d98a]/10 text-[#39d98a]'
                            : 'border-[#ff4d6d] bg-[#ff4d6d]/10 text-[#ff4d6d]'
                          : 'border-[#1e1e2e] bg-[#16161f] text-[#6b6b85]'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Entry grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                  Entry Price
                </label>
                <input
                  type="number"
                  value={entryPrice}
                  onChange={e => setEntryPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                  Entry Date
                </label>
                <input
                  type="date"
                  value={entryDate}
                  onChange={e => setEntryDate(e.target.value)}
                  className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                  Quantity
                </label>
                <input
                  type="number"
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                  placeholder="1"
                  min="1"
                  className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]"
                />
              </div>
            </div>

            {/* Exit grid (optional) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                  Exit Price{' '}
                  <span className="text-[#6b6b85] normal-case font-mono">(optional)</span>
                </label>
                <input
                  type="number"
                  value={exitPrice}
                  onChange={e => setExitPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                  Exit Date{' '}
                  <span className="text-[#6b6b85] normal-case font-mono">(optional)</span>
                </label>
                <input
                  type="date"
                  value={exitDate}
                  onChange={e => setExitDate(e.target.value)}
                  className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]"
                />
              </div>
            </div>

            {/* GCT Zone */}
            <div>
              <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                GCT Zone at Entry
              </label>
              <select
                value={gctZone}
                onChange={e => setGctZone(e.target.value as GCTZone)}
                className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]"
              >
                <option value="">— Not specified</option>
                <option value="BUY ZONE">BUY ZONE</option>
                <option value="WATCH ZONE">WATCH ZONE</option>
                <option value="DANGER ZONE">DANGER ZONE</option>
                <option value="CRASH ZONE">CRASH ZONE</option>
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Setup, rationale, lessons learned..."
                rows={3}
                className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040] resize-none"
              />
            </div>

            {formError && (
              <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-xl px-4 py-3 text-xs font-mono text-[#ff4d6d]">
                {formError}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitLoading}
              className="w-full bg-[#f0c040] text-black font-black py-3 rounded-xl text-sm hover:bg-[#ffd060] transition-all disabled:opacity-50"
            >
              {submitLoading ? '⏳ Logging...' : '📒 Log Trade'}
            </button>
          </div>
        )}

        {/* Trades table */}
        {!setupRequired && (
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#1e1e2e] flex items-center justify-between">
              <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest">
                Trade Log
              </div>
              <div className="text-xs font-mono text-[#6b6b85]">
                {trades.length} entries
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center">
                <div className="text-3xl mb-3 animate-spin inline-block">⚛</div>
                <div className="text-sm font-black text-[#6b6b85]">Loading trades...</div>
              </div>
            ) : trades.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-3xl mb-3">📒</div>
                <div className="text-sm font-black text-[#6b6b85] mb-1">
                  No trades logged yet
                </div>
                <div className="text-xs font-mono text-[#6b6b85]">
                  Click "Add Trade" to start tracking.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[#1e1e2e]">
                      {[
                        'Date',
                        'Symbol',
                        'Type',
                        'Dir',
                        'Entry',
                        'Exit',
                        'Qty',
                        'P&L',
                        'Zone',
                        'Notes',
                        '',
                      ].map(h => (
                        <th
                          key={h}
                          className="px-4 py-3 text-[10px] font-mono text-[#6b6b85] uppercase tracking-widest whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map(t => {
                      const pnl = tradePnL(t);
                      const pnlColor =
                        pnl === null
                          ? '#6b6b85'
                          : pnl > 0
                          ? '#39d98a'
                          : pnl < 0
                          ? '#ff4d6d'
                          : '#6b6b85';

                      return (
                        <tr
                          key={t.id}
                          className="border-b border-[#1e1e2e]/50 hover:bg-[#16161f] transition-colors"
                        >
                          <td className="px-4 py-3 text-[11px] font-mono text-[#6b6b85] whitespace-nowrap">
                            {t.entry_date}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-black text-[#e8e8f0]">
                              {t.symbol}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[9px] font-black bg-[#16161f] border border-[#1e1e2e] text-[#4d9fff] px-1.5 py-0.5 rounded">
                              {t.trade_type}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-[10px] font-black ${
                                t.direction === 'BUY'
                                  ? 'text-[#39d98a]'
                                  : 'text-[#ff4d6d]'
                              }`}
                            >
                              {t.direction}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[11px] font-mono text-[#e8e8f0] whitespace-nowrap">
                            {fmt(Number(t.entry_price))}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {t.exit_price ? (
                              <span className="text-[11px] font-mono text-[#e8e8f0]">
                                {fmt(Number(t.exit_price))}
                              </span>
                            ) : (
                              <span className="text-[9px] font-black bg-[#4d9fff]/10 text-[#4d9fff] border border-[#4d9fff]/30 px-1.5 py-0.5 rounded">
                                OPEN
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[11px] font-mono text-[#6b6b85]">
                            {t.qty}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {pnl !== null ? (
                              <span
                                className="text-[11px] font-black font-mono"
                                style={{ color: pnlColor }}
                              >
                                {pnl >= 0 ? '+' : ''}
                                {fmt(pnl)}
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-[#6b6b85]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <ZoneBadge zone={t.gct_zone} />
                          </td>
                          <td className="px-4 py-3 max-w-[160px]">
                            {t.notes ? (
                              <span className="text-[10px] font-mono text-[#6b6b85] truncate block max-w-[140px]">
                                {t.notes}
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-[#6b6b85]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleDelete(t.id)}
                              className="text-[10px] text-[#6b6b85] hover:text-[#ff4d6d] transition-colors font-black"
                              title="Delete trade"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* AI Pattern Insight */}
        {!setupRequired && !loading && insights.length > 0 && (
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 space-y-3">
            <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest">
              AI Pattern Insight
            </div>
            {insights.map((insight, i) => (
              <div
                key={i}
                className="bg-[#16161f] border border-[#1e1e2e] rounded-xl px-4 py-3 text-xs font-mono text-[#e8e8f0] leading-relaxed"
              >
                {insight}
              </div>
            ))}
          </div>
        )}

        <p className="text-[10px] font-mono text-[#6b6b85] text-center">
          Your trades are private · Secured by Row Level Security · Not financial advice
        </p>
      </div>
    </div>
  );
}
