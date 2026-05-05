import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { callEdge } from '../lib/supabase';

interface SectorData {
  name: string;
  sym: string;
  closes: number[];
  changePct: number;
  currentPrice: number;
}

interface RRGPoint { x: number; y: number; }

interface RRGSector {
  name: string;
  tail: RRGPoint[];
  current: RRGPoint;
  phase: 'Leading' | 'Weakening' | 'Lagging' | 'Improving';
  changePct: number;
}

const SECTOR_COLORS: Record<string, string> = {
  'Bank':      '#3b82f6',
  'IT':        '#8b5cf6',
  'Pharma':    '#10b981',
  'Auto':      '#f59e0b',
  'Metal':     '#ef4444',
  'FMCG':      '#ec4899',
  'Realty':    '#06b6d4',
  'Energy':    '#f97316',
  'Financial': '#6366f1',
};

const PHASE_COLOR: Record<string, string> = {
  Leading:   '#22c55e',
  Weakening: '#f97316',
  Lagging:   '#ef4444',
  Improving: '#3b82f6',
};

const SECTOR_STOCKS: Record<string, string[]> = {
  'Bank':      ['HDFCBANK', 'ICICIBANK', 'KOTAKBANK', 'SBIN', 'AXISBANK', 'INDUSINDBK', 'BANKBARODA', 'PNB'],
  'IT':        ['TCS', 'INFY', 'WIPRO', 'HCLTECH', 'TECHM', 'LTIM', 'PERSISTENT', 'COFORGE'],
  'Pharma':    ['SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB', 'LUPIN', 'AUROPHARMA', 'BIOCON'],
  'Auto':      ['MARUTI', 'TATAMOTORS', 'EICHERMOT', 'BAJAJ-AUTO', 'HEROMOTOCO', 'TVSMOTORS', 'MOTHERSON'],
  'Metal':     ['TATASTEEL', 'HINDALCO', 'JSWSTEEL', 'SAIL', 'VEDL', 'NMDC', 'COALINDIA'],
  'FMCG':      ['HINDUNILVR', 'ITC', 'NESTLEIND', 'BRITANNIA', 'DABUR', 'GODREJCP', 'MARICO'],
  'Realty':    ['DLF', 'OBEROIRLTY', 'PRESTIGE', 'PHOENIXLTD', 'GODREJPROP', 'LODHA', 'BRIGADE'],
  'Energy':    ['RELIANCE', 'ONGC', 'BPCL', 'IOC', 'GAIL', 'NTPC', 'POWERGRID'],
  'Financial': ['BAJFINANCE', 'BAJAJFINSV', 'HDFCAMC', 'MUTHOOTFIN', 'CHOLAFIN', 'MANAPPURAM'],
};

function computeRRG(sectors: SectorData[]): RRGSector[] {
  const benchmark = sectors.find(s => s.name === 'NIFTY 50');
  if (!benchmark || benchmark.closes.length < 3) return [];

  const results: RRGSector[] = [];

  for (const sector of sectors) {
    if (sector.name === 'NIFTY 50' || sector.closes.length < 3) continue;

    const n = Math.min(sector.closes.length, benchmark.closes.length);
    const sc = sector.closes.slice(-n);
    const bc = benchmark.closes.slice(-n);

    const rs: number[] = [];
    for (let i = 0; i < n; i++) {
      if (bc[i] > 0) rs.push(sc[i] / bc[i]);
    }
    if (rs.length < 3) continue;

    const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
    const rsRatio = rs.map(r => mean > 0 ? (r / mean) * 100 : 100);

    const tail: RRGPoint[] = [];
    for (let t = 1; t < rsRatio.length; t++) {
      const diff = rsRatio[t] - rsRatio[t - 1];
      tail.push({ x: rsRatio[t], y: diff * 8 + 100 });
    }

    if (!tail.length) continue;

    const current = tail[tail.length - 1];
    let phase: RRGSector['phase'];
    if (current.x >= 100 && current.y >= 100)      phase = 'Leading';
    else if (current.x >= 100 && current.y < 100)  phase = 'Weakening';
    else if (current.x < 100 && current.y < 100)   phase = 'Lagging';
    else                                             phase = 'Improving';

    results.push({ name: sector.name, tail, current, phase, changePct: sector.changePct });
  }

  return results;
}

function sx(dataX: number) { return 250 + Math.max(-140, Math.min(140, (dataX - 100) * 12)); }
function sy(dataY: number) { return 250 - Math.max(-140, Math.min(140, (dataY - 100) * 12)); }

export default function SectorRotation() {
  const [sectors, setSectors] = useState<SectorData[]>([]);
  const [rrgData, setRrgData] = useState<RRGSector[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fetched, setFetched] = useState(false);

  const [animFrame, setAnimFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxFrames = rrgData.length > 0 ? Math.max(...rrgData.map(s => s.tail.length)) : 1;

  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [sectorMovers, setSectorMovers] = useState<any[]>([]);
  const [sectorMoversLoading, setSectorMoversLoading] = useState(false);

  useEffect(() => {
    if (!isPlaying) return;
    intervalRef.current = setInterval(() => {
      setAnimFrame(prev => {
        if (prev >= maxFrames - 1) {
          setIsPlaying(false);
          return maxFrames - 1;
        }
        return prev + 1;
      });
    }, 550);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, maxFrames]);

  async function fetchData() {
    setLoading(true);
    setError('');
    try {
      const data = await callEdge('smooth-endpoint', { type: 'sector_rr' });
      if (!data?.success) throw new Error(data?.error || 'Fetch failed');
      const s: SectorData[] = data.data || [];
      setSectors(s);
      const rrg = computeRRG(s);
      setRrgData(rrg);
      setFetched(true);
      const mf = rrg.length > 0 ? Math.max(...rrg.map(r => r.tail.length)) - 1 : 0;
      setAnimFrame(mf);
    } catch (err: any) {
      setError(err.message || 'Failed to load sector data');
    } finally {
      setLoading(false);
    }
  }

  async function loadSectorMovers(name: string) {
    const stocks = SECTOR_STOCKS[name];
    if (!stocks?.length) return;
    setSectorMoversLoading(true);
    setSectorMovers([]);
    try {
      const data = await callEdge('smooth-endpoint', { type: 'market_movers', symbols: stocks, exchange: 'NSE' });
      if (data?.success) {
        setSectorMovers([...(data.data || [])].sort((a: any, b: any) => b.changePct - a.changePct));
      }
    } catch (_e) {}
    setSectorMoversLoading(false);
  }

  function handleSectorClick(name: string) {
    if (selectedSector === name) {
      setSelectedSector(null);
      setSectorMovers([]);
    } else {
      setSelectedSector(name);
      loadSectorMovers(name);
    }
  }

  function playPause() {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (animFrame >= maxFrames - 1) setAnimFrame(0);
      setIsPlaying(true);
    }
  }

  const displaySectors = sectors.filter(s => s.name !== 'NIFTY 50');
  const nifty = sectors.find(s => s.name === 'NIFTY 50');
  const gainers = sectorMovers.filter(s => s.changePct >= 0);
  const losers = [...sectorMovers].filter(s => s.changePct < 0).reverse();

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

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-8 space-y-8">

        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="text-2xl">🔄</div>
            <h1 className="text-2xl font-black">Sector Rotation</h1>
          </div>
          <p className="text-xs font-mono text-[#6b6b85]">
            Animated RRG — 6-month history · tap a sector to see top stocks
          </p>
        </div>

        <button onClick={fetchData} disabled={loading}
          className="w-full bg-[#f0c040] text-black font-black py-3 rounded-xl text-sm hover:bg-[#ffd060] transition-all disabled:opacity-50">
          {loading ? '⏳ Fetching sector data…' : fetched ? '🔄 Refresh' : '🔄 Load Sector Rotation'}
        </button>

        {error && (
          <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-xl p-4 text-sm text-[#ff4d6d]">{error}</div>
        )}

        {fetched && (
          <>
            {nifty && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl px-5 py-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest">Benchmark — NIFTY 50</div>
                  <div className="text-lg font-black mt-0.5">₹{nifty.currentPrice?.toLocaleString('en-IN')}</div>
                </div>
                <div className={`text-xl font-black ${nifty.changePct >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                  {nifty.changePct >= 0 ? '+' : ''}{nifty.changePct.toFixed(2)}%
                </div>
              </div>
            )}

            {/* Sector filter buttons */}
            <div>
              <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-3">
                Filter Sectors · Tap to see top gainers &amp; losers
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setSelectedSector(null); setSectorMovers([]); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all border ${!selectedSector ? 'border-[#f0c040] bg-[#f0c040]/10 text-[#f0c040]' : 'border-[#1e1e2e] text-[#6b6b85] hover:border-[#6b6b85]'}`}>
                  All
                </button>
                {displaySectors.map(s => {
                  const color = SECTOR_COLORS[s.name] || '#f0c040';
                  const rrg = rrgData.find(r => r.name === s.name);
                  const isSelected = selectedSector === s.name;
                  return (
                    <button key={s.name} onClick={() => handleSectorClick(s.name)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all border"
                      style={isSelected
                        ? { color, borderColor: color, background: color + '18' }
                        : { color: '#6b6b85', borderColor: '#1e1e2e' }}>
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      {s.name}
                      {rrg && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-black"
                          style={{ background: PHASE_COLOR[rrg.phase] + '30', color: PHASE_COLOR[rrg.phase] }}>
                          {rrg.phase[0]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sector performance grid */}
            <div>
              <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-3">Today's Performance</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[...displaySectors].sort((a, b) => b.changePct - a.changePct).map(s => {
                  const color = SECTOR_COLORS[s.name] || '#f0c040';
                  const rrg = rrgData.find(r => r.name === s.name);
                  const isSelected = selectedSector === s.name;
                  const isDimmed = selectedSector !== null && !isSelected;
                  return (
                    <button key={s.name} onClick={() => handleSectorClick(s.name)}
                      className={`bg-[#111118] rounded-xl p-4 text-left transition-all ${isDimmed ? 'opacity-35' : ''}`}
                      style={{ border: isSelected ? `2px solid ${color}` : '1px solid #1e1e2e' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                        <div className="text-xs font-mono text-[#6b6b85]">{s.name}</div>
                      </div>
                      <div className={`text-lg font-black ${s.changePct >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                        {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%
                      </div>
                      {rrg && (
                        <div className="mt-1.5 inline-block text-[10px] font-black px-2 py-0.5 rounded-full"
                          style={{ background: PHASE_COLOR[rrg.phase] + '22', color: PHASE_COLOR[rrg.phase] }}>
                          {rrg.phase}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sector stocks panel */}
            {selectedSector && (
              <div className="bg-[#111118] border rounded-2xl p-5 transition-all"
                style={{ borderColor: (SECTOR_COLORS[selectedSector] || '#f0c040') + '60' }}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm font-black" style={{ color: SECTOR_COLORS[selectedSector] || '#f0c040' }}>
                      {selectedSector} — Top Stocks
                    </div>
                    <div className="text-xs font-mono text-[#6b6b85]">Today's gainers &amp; losers</div>
                  </div>
                  {sectorMoversLoading && (
                    <div className="w-4 h-4 border-2 border-[#f0c040] border-t-transparent rounded-full animate-spin" />
                  )}
                </div>

                {!sectorMoversLoading && sectorMovers.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] font-mono text-[#22c55e] uppercase tracking-widest mb-2">Top Gainers</div>
                      <div className="space-y-2">
                        {gainers.slice(0, 4).map(s => (
                          <div key={s.symbol} className="flex items-center justify-between bg-[#16161f] rounded-xl px-3 py-2.5">
                            <div className="min-w-0">
                              <div className="text-xs font-black text-[#e8e8f0]">{s.symbol}</div>
                              <div className="text-[10px] font-mono text-[#6b6b85] truncate">{s.name}</div>
                            </div>
                            <div className="text-right shrink-0 ml-2">
                              <div className="text-xs font-black text-[#e8e8f0]">₹{s.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                              <div className="text-xs font-black text-[#22c55e]">+{s.changePct.toFixed(2)}%</div>
                            </div>
                          </div>
                        ))}
                        {gainers.length === 0 && <div className="text-xs font-mono text-[#6b6b85] py-2">No gainers today</div>}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono text-[#ef4444] uppercase tracking-widest mb-2">Top Losers</div>
                      <div className="space-y-2">
                        {losers.slice(0, 4).map(s => (
                          <div key={s.symbol} className="flex items-center justify-between bg-[#16161f] rounded-xl px-3 py-2.5">
                            <div className="min-w-0">
                              <div className="text-xs font-black text-[#e8e8f0]">{s.symbol}</div>
                              <div className="text-[10px] font-mono text-[#6b6b85] truncate">{s.name}</div>
                            </div>
                            <div className="text-right shrink-0 ml-2">
                              <div className="text-xs font-black text-[#e8e8f0]">₹{s.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                              <div className="text-xs font-black text-[#ef4444]">{s.changePct.toFixed(2)}%</div>
                            </div>
                          </div>
                        ))}
                        {losers.length === 0 && <div className="text-xs font-mono text-[#6b6b85] py-2">No losers today</div>}
                      </div>
                    </div>
                  </div>
                )}

                {!sectorMoversLoading && sectorMovers.length === 0 && (
                  <div className="text-xs font-mono text-[#6b6b85] text-center py-4">No data available</div>
                )}
              </div>
            )}

            {/* RRG Chart */}
            {rrgData.length > 0 && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-black">Relative Rotation Graph</div>
                  <div className="text-[10px] font-mono text-[#f0c040] bg-[#f0c040]/10 px-2 py-1 rounded-lg">
                    Week {animFrame + 1} / {maxFrames}
                  </div>
                </div>
                <p className="text-xs font-mono text-[#6b6b85] mb-3">
                  X = RS-Ratio · Y = RS-Momentum · 6-month animated history · tap sector to highlight
                </p>

                {/* Animation controls */}
                <div className="flex items-center gap-2 mb-3">
                  <button onClick={() => { setIsPlaying(false); setAnimFrame(0); }}
                    className="px-3 py-1.5 text-[10px] font-black bg-[#16161f] border border-[#1e1e2e] rounded-lg text-[#6b6b85] hover:text-[#e8e8f0] transition-all">
                    ⏮
                  </button>
                  <button onClick={playPause}
                    className={`flex-1 py-1.5 text-xs font-black rounded-lg transition-all border ${isPlaying ? 'bg-[#ff4d6d]/15 border-[#ff4d6d]/40 text-[#ff4d6d]' : 'bg-[#f0c040]/15 border-[#f0c040]/40 text-[#f0c040]'}`}>
                    {isPlaying ? '⏸ Pause' : '▶ Play 6-Month Animation'}
                  </button>
                  <button onClick={() => { setIsPlaying(false); setAnimFrame(maxFrames - 1); }}
                    className="px-3 py-1.5 text-[10px] font-black bg-[#16161f] border border-[#1e1e2e] rounded-lg text-[#6b6b85] hover:text-[#e8e8f0] transition-all">
                    ⏭
                  </button>
                </div>

                {/* Progress bar — also scrubable */}
                <div className="h-1.5 bg-[#1e1e2e] rounded-full mb-4 overflow-hidden cursor-pointer"
                  onClick={(e) => {
                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                    const pct = (e.clientX - rect.left) / rect.width;
                    setAnimFrame(Math.round(pct * (maxFrames - 1)));
                  }}>
                  <div className="h-full bg-[#f0c040] rounded-full transition-all"
                    style={{ width: `${((animFrame + 1) / maxFrames) * 100}%` }} />
                </div>

                <div className="w-full overflow-x-auto">
                  <svg viewBox="0 0 500 500" className="w-full max-w-[500px] mx-auto block" style={{ minWidth: 300 }}>
                    {/* Quadrant backgrounds */}
                    <rect x="250" y="0"   width="250" height="250" fill="#22c55e" fillOpacity="0.07" />
                    <rect x="250" y="250" width="250" height="250" fill="#f97316" fillOpacity="0.07" />
                    <rect x="0"   y="250" width="250" height="250" fill="#ef4444" fillOpacity="0.07" />
                    <rect x="0"   y="0"   width="250" height="250" fill="#3b82f6" fillOpacity="0.07" />

                    <text x="370" y="22"  fill="#22c55e" fontSize="11" fontWeight="bold" opacity="0.9">Leading</text>
                    <text x="290" y="490" fill="#f97316" fontSize="11" fontWeight="bold" opacity="0.9">Weakening</text>
                    <text x="20"  y="490" fill="#ef4444" fontSize="11" fontWeight="bold" opacity="0.9">Lagging</text>
                    <text x="20"  y="22"  fill="#3b82f6" fontSize="11" fontWeight="bold" opacity="0.9">Improving</text>

                    <line x1="250" y1="0"   x2="250" y2="500" stroke="#1e1e2e" strokeWidth="1.5" />
                    <line x1="0"   y1="250" x2="500" y2="250" stroke="#1e1e2e" strokeWidth="1.5" />

                    <text x="250" y="495" fill="#6b6b85" fontSize="9" textAnchor="middle">← Underperforming · RS-Ratio · Outperforming →</text>
                    <text x="8" y="250" fill="#6b6b85" fontSize="9" textAnchor="middle" transform="rotate(-90,8,250)">RS-Momentum</text>

                    {rrgData.map(sector => {
                      const color = SECTOR_COLORS[sector.name] || '#f0c040';
                      const isSelected = selectedSector === sector.name;
                      const isDimmed = selectedSector !== null && !isSelected;
                      const baseOpacity = isDimmed ? 0.15 : 1;

                      const allPts = sector.tail;
                      const visiblePts = allPts.slice(0, animFrame + 1);
                      if (visiblePts.length < 1) return null;
                      const currPt = visiblePts[visiblePts.length - 1];

                      return (
                        <g key={sector.name} opacity={baseOpacity} style={{ cursor: 'pointer' }}
                          onClick={() => handleSectorClick(sector.name)}>
                          {/* Ghost full trail */}
                          {allPts.length > 1 && (
                            <polyline
                              points={allPts.map(p => `${sx(p.x)},${sy(p.y)}`).join(' ')}
                              fill="none" stroke={color} strokeWidth="1" strokeOpacity="0.1" />
                          )}
                          {/* Active trail */}
                          {visiblePts.length > 1 && (
                            <polyline
                              points={visiblePts.map(p => `${sx(p.x)},${sy(p.y)}`).join(' ')}
                              fill="none" stroke={color} strokeWidth={isSelected ? 2.5 : 1.8}
                              strokeOpacity="0.7" strokeDasharray="4 2" />
                          )}
                          {/* Trail history dots */}
                          {visiblePts.slice(0, -1).map((p, i) => (
                            <circle key={i} cx={sx(p.x)} cy={sy(p.y)}
                              r={1.5 + (i / Math.max(visiblePts.length - 1, 1)) * 2.5}
                              fill={color}
                              fillOpacity={0.1 + (i / Math.max(visiblePts.length - 1, 1)) * 0.45} />
                          ))}
                          {/* Current dot */}
                          <circle cx={sx(currPt.x)} cy={sy(currPt.y)}
                            r={isSelected ? 10 : 7} fill={color} fillOpacity="0.9" />
                          <circle cx={sx(currPt.x)} cy={sy(currPt.y)}
                            r={isSelected ? 14 : 10} fill="none" stroke={color}
                            strokeWidth={isSelected ? 2 : 1.5} strokeOpacity="0.45" />
                          {/* Label */}
                          <text
                            x={sx(currPt.x) + (currPt.x >= 100 ? 14 : -14)}
                            y={sy(currPt.y) + 4}
                            fill={color}
                            fontSize={isSelected ? 11 : 10}
                            fontWeight="bold"
                            textAnchor={currPt.x >= 100 ? 'start' : 'end'}>
                            {sector.name}
                          </text>
                        </g>
                      );
                    })}

                    <circle cx="250" cy="250" r="5" fill="#f0c040" />
                    <text x="263" y="254" fill="#f0c040" fontSize="9" fontWeight="bold">NIFTY 50</text>
                  </svg>
                </div>

                <div className="flex flex-wrap gap-3 mt-4 justify-center">
                  {(['Leading', 'Weakening', 'Lagging', 'Improving'] as const).map(phase => (
                    <div key={phase} className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full" style={{ background: PHASE_COLOR[phase] }} />
                      <span className="text-xs font-mono text-[#6b6b85]">{phase}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Phase guide */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { phase: 'Leading', icon: '🟢', desc: 'Outperforming & gaining momentum — best sectors to be in' },
                { phase: 'Weakening', icon: '🟡', desc: 'Still outperforming but momentum is fading — consider exiting soon' },
                { phase: 'Lagging', icon: '🔴', desc: 'Underperforming & losing momentum — avoid or short' },
                { phase: 'Improving', icon: '🔵', desc: 'Underperforming but momentum is turning — early opportunity' },
              ].map(p => (
                <div key={p.phase} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span>{p.icon}</span>
                    <span className="text-sm font-black" style={{ color: PHASE_COLOR[p.phase] }}>{p.phase}</span>
                  </div>
                  <p className="text-[11px] font-mono text-[#6b6b85] leading-relaxed">{p.desc}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
