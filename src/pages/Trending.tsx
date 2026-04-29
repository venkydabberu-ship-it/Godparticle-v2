import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { NSE_STOCKS } from '../lib/stockList';

interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  prevClose: number;
  open: number;
  high52: number;
  low52: number;
  volume: number;
}

type SortMode = 'gainers' | 'losers' | 'breakout';

const BATCH_SIZE = 50;

export default function Trending() {
  const navigate = useNavigate();
  const [capital, setCapital] = useState('');
  const [minShares, setMinShares] = useState('5');
  const [sortMode, setSortMode] = useState<SortMode>('gainers');
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [fetched, setFetched] = useState(false);

  const cap = parseFloat(capital) || 0;
  const minSh = parseInt(minShares) || 5;

  async function fetchTrending() {
    setLoading(true);
    setError('');
    setQuotes([]);
    setFetched(false);
    setProgress('');

    try {
      const symbols = NSE_STOCKS.filter(s => !s.symbol.includes('&')).map(s => s.symbol);
      const all: StockQuote[] = [];

      // Fetch in batches to avoid URL length limits
      for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
        const batch = symbols.slice(i, i + BATCH_SIZE);
        setProgress(`Fetching ${Math.min(i + BATCH_SIZE, symbols.length)} / ${symbols.length} stocks…`);
        const { data, error: fnErr } = await supabase.functions.invoke('smooth-endpoint', {
          body: { type: 'market_movers', symbols: batch, exchange: 'NSE' },
        });
        if (fnErr || !data?.success) throw new Error(data?.error || 'Fetch failed');
        all.push(...(data.data as StockQuote[]));
      }

      setQuotes(all);
      setFetched(true);
      setProgress('');
    } catch (err: any) {
      setError(err.message || 'Could not fetch market data.');
    } finally {
      setLoading(false);
    }
  }

  // Filter by capital
  const filtered = quotes.filter(q => {
    if (!cap) return true;
    const maxPrice = cap / minSh;
    return q.price <= maxPrice && q.price > 0;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (sortMode === 'gainers') return b.changePct - a.changePct;
    if (sortMode === 'losers')  return a.changePct - b.changePct;
    // breakout: closest to 52-week high (smallest % gap to high52)
    const gapA = a.high52 > 0 ? (a.high52 - a.price) / a.high52 : 999;
    const gapB = b.high52 > 0 ? (b.high52 - b.price) / b.high52 : 999;
    return gapA - gapB;
  });

  const top = sorted.slice(0, 20);

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
  const shares = (price: number) => cap > 0 ? Math.floor(cap / price) : null;
  const fromHigh = (q: StockQuote) => q.high52 > 0 ? ((q.high52 - q.price) / q.high52 * 100).toFixed(1) : null;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#1e1e2e]">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#f0c040] rounded-xl flex items-center justify-center text-lg">⚛</div>
          <div className="font-bold text-base">God Particle</div>
        </Link>
        <Link to="/dashboard" className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040]">← Dashboard</Link>
      </nav>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="text-2xl">🔥</div>
            <h1 className="text-2xl font-black">Trending Stocks</h1>
          </div>
          <p className="text-xs font-mono text-[#6b6b85]">Find the best NSE stocks in your budget · Top gainers · Near breakout</p>
        </div>

        {/* ── Controls ── */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">My Capital (₹)</label>
              <input
                type="number"
                value={capital}
                onChange={e => setCapital(e.target.value)}
                placeholder="e.g. 50000"
                className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]"
              />
              <p className="text-[10px] font-mono text-[#6b6b85] mt-1">Leave blank to see all stocks</p>
            </div>
            <div>
              <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Minimum Shares to Buy</label>
              <div className="flex gap-2">
                {['1','5','10','20'].map(v => (
                  <button key={v} onClick={() => setMinShares(v)}
                    className={`flex-1 py-2.5 rounded-lg text-xs font-black transition-all border ${minShares === v ? 'border-[#f0c040] bg-[#f0c040]/10 text-[#f0c040]' : 'border-[#1e1e2e] bg-[#16161f] text-[#6b6b85]'}`}>
                    {v}
                  </button>
                ))}
              </div>
              <p className="text-[10px] font-mono text-[#6b6b85] mt-1">
                {cap > 0 ? `Shows stocks priced up to ${fmt(cap / parseInt(minShares || '5'))} per share` : 'Set capital above to filter'}
              </p>
            </div>
          </div>

          <button onClick={fetchTrending} disabled={loading}
            className="w-full bg-[#f0c040] text-black font-black py-3 rounded-xl text-sm hover:bg-[#ffd060] transition-all disabled:opacity-50">
            {loading ? `⏳ ${progress}` : fetched ? '🔄 Refresh Data' : '🔥 Fetch Trending Stocks'}
          </button>

          {error && (
            <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-xl px-4 py-3 text-xs font-mono text-[#ff4d6d]">{error}</div>
          )}
        </div>

        {/* ── Results ── */}
        {fetched && (
          <div className="space-y-4">
            {/* Sort tabs + summary */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="text-xs font-mono text-[#6b6b85]">
                {filtered.length} stocks in budget · showing top {Math.min(20, top.length)}
              </div>
              <div className="flex gap-1 bg-[#111118] rounded-xl p-1">
                {([
                  { id: 'gainers',  label: '🔥 Top Gainers' },
                  { id: 'losers',   label: '📉 Top Losers' },
                  { id: 'breakout', label: '🚀 Near Breakout' },
                ] as { id: SortMode; label: string }[]).map(t => (
                  <button key={t.id} onClick={() => setSortMode(t.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${sortMode === t.id ? 'bg-[#16161f] text-[#e8e8f0] border border-[#1e1e2e]' : 'text-[#6b6b85]'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {top.length === 0 ? (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-8 text-center">
                <div className="text-3xl mb-3">🪣</div>
                <div className="text-sm font-black text-[#6b6b85] mb-1">No stocks in budget</div>
                <div className="text-xs font-mono text-[#6b6b85]">Try increasing capital or reducing minimum shares.</div>
              </div>
            ) : (
              <div className="space-y-2">
                {top.map((q, i) => {
                  const sh = shares(q.price);
                  const gap = fromHigh(q);
                  const isGainer = q.changePct >= 0;
                  const nearBreakout = parseFloat(gap || '999') < 5;
                  const chgColor = isGainer ? '#39d98a' : '#ff4d6d';

                  return (
                    <div key={q.symbol} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 hover:border-[#f0c040]/40 transition-all">
                      <div className="flex items-start justify-between gap-3">
                        {/* Left: rank + name */}
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="text-lg font-black text-[#6b6b85] w-6 shrink-0 mt-0.5">{i + 1}</div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-sm text-[#e8e8f0]">{q.symbol}</span>
                              {nearBreakout && (
                                <span className="text-[9px] font-black bg-[#f0c040]/20 text-[#f0c040] px-1.5 py-0.5 rounded-full">🚀 NEAR HIGH</span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-[#6b6b85] truncate max-w-[220px]">{q.name}</div>
                          </div>
                        </div>

                        {/* Right: price + change */}
                        <div className="text-right shrink-0">
                          <div className="text-lg font-black text-[#e8e8f0]">{fmt(q.price)}</div>
                          <div className="text-xs font-black" style={{ color: chgColor }}>{pct(q.changePct)}</div>
                        </div>
                      </div>

                      {/* Stats row */}
                      <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-mono">
                        <span className="bg-[#16161f] rounded px-2 py-1 text-[#6b6b85]">
                          Prev close {fmt(q.prevClose)}
                        </span>
                        {gap !== null && (
                          <span className="bg-[#16161f] rounded px-2 py-1 text-[#6b6b85]">
                            {parseFloat(gap) < 5
                              ? <span className="text-[#f0c040]">52W High {fmt(q.high52)} — only {gap}% away ⚡</span>
                              : `52W High ${fmt(q.high52)} — ${gap}% away`}
                          </span>
                        )}
                        {sh !== null && sh > 0 && (
                          <span className="bg-[#39d98a]/10 border border-[#39d98a]/25 rounded px-2 py-1 text-[#39d98a]">
                            💰 {sh} shares · {fmt(sh * q.price)} used
                          </span>
                        )}
                      </div>

                      {/* Analyse button */}
                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={() => navigate('/stock-analysis', { state: { prefill: { symbol: q.symbol, name: q.name } } })}
                          className="text-[10px] font-black border border-[#f0c040]/40 text-[#f0c040] px-3 py-1.5 rounded-lg hover:bg-[#f0c040]/10 transition-all">
                          Analyse with GCT →
                        </button>
                      </div>
                    </div>
                  );
                })}
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
