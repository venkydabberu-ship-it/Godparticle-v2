import { useState } from 'react';
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

function computeRRG(sectors: SectorData[]): RRGSector[] {
  const benchmark = sectors.find(s => s.name === 'NIFTY 50');
  if (!benchmark || benchmark.closes.length < 3) return [];

  const results: RRGSector[] = [];

  for (const sector of sectors) {
    if (sector.name === 'NIFTY 50' || sector.closes.length < 3) continue;

    const n = Math.min(sector.closes.length, benchmark.closes.length);
    const sc = sector.closes.slice(-n);
    const bc = benchmark.closes.slice(-n);

    // Raw RS = sector/benchmark for each week
    const rs: number[] = [];
    for (let i = 0; i < n; i++) {
      if (bc[i] > 0) rs.push(sc[i] / bc[i]);
    }
    if (rs.length < 3) continue;

    // Normalize RS → RS-Ratio (mean = 100)
    const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
    const rsRatio = rs.map(r => mean > 0 ? (r / mean) * 100 : 100);

    // RS-Momentum = change in RS-Ratio, amplified and centered at 100
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

    results.push({ name: sector.name, tail: tail.slice(-6), current, phase, changePct: sector.changePct });
  }

  return results;
}

// Map data coords to SVG coords. Center = (100, 100) → SVG (250, 250). Scale = 12px per unit.
function sx(dataX: number) { return 250 + Math.max(-140, Math.min(140, (dataX - 100) * 12)); }
function sy(dataY: number) { return 250 - Math.max(-140, Math.min(140, (dataY - 100) * 12)); }

export default function SectorRotation() {
  const [sectors, setSectors] = useState<SectorData[]>([]);
  const [rrgData, setRrgData] = useState<RRGSector[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fetched, setFetched] = useState(false);

  async function fetchData() {
    setLoading(true);
    setError('');
    try {
      const data = await callEdge('smooth-endpoint', { type: 'sector_rr' });
      if (!data?.success) throw new Error(data?.error || 'Fetch failed');
      const s: SectorData[] = data.data || [];
      setSectors(s);
      setRrgData(computeRRG(s));
      setFetched(true);
    } catch (err: any) {
      setError(err.message || 'Failed to load sector data');
    } finally {
      setLoading(false);
    }
  }

  const displaySectors = sectors.filter(s => s.name !== 'NIFTY 50');
  const nifty = sectors.find(s => s.name === 'NIFTY 50');

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

        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="text-2xl">🔄</div>
            <h1 className="text-2xl font-black">Sector Rotation</h1>
          </div>
          <p className="text-xs font-mono text-[#6b6b85]">
            Relative Rotation Graph — see which sectors are leading, weakening, lagging or improving vs NIFTY 50
          </p>
        </div>

        {/* Fetch button */}
        <button onClick={fetchData} disabled={loading}
          className="w-full bg-[#f0c040] text-black font-black py-3 rounded-xl text-sm hover:bg-[#ffd060] transition-all disabled:opacity-50">
          {loading ? '⏳ Fetching sector data…' : fetched ? '🔄 Refresh' : '🔄 Load Sector Rotation'}
        </button>

        {error && (
          <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-xl p-4 text-sm text-[#ff4d6d]">{error}</div>
        )}

        {fetched && (
          <>
            {/* Benchmark banner */}
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

            {/* Sector performance grid */}
            <div>
              <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-3">Today's Sector Performance</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[...displaySectors].sort((a, b) => b.changePct - a.changePct).map(s => {
                  const color = SECTOR_COLORS[s.name] || '#f0c040';
                  const rrg = rrgData.find(r => r.name === s.name);
                  return (
                    <div key={s.name} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
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
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RRG Chart */}
            {rrgData.length > 0 && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-4">
                <div className="text-sm font-black mb-1">Relative Rotation Graph</div>
                <p className="text-xs font-mono text-[#6b6b85] mb-4">
                  X = RS-Ratio (outperforming/underperforming vs NIFTY 50) · Y = RS-Momentum (accelerating/decelerating) · Dots trail the last 6 weeks
                </p>

                <div className="w-full overflow-x-auto">
                  <svg viewBox="0 0 500 500" className="w-full max-w-[500px] mx-auto block" style={{ minWidth: 300 }}>
                    {/* Quadrant backgrounds */}
                    <rect x="250" y="0"   width="250" height="250" fill="#22c55e" fillOpacity="0.07" />
                    <rect x="250" y="250" width="250" height="250" fill="#f97316" fillOpacity="0.07" />
                    <rect x="0"   y="250" width="250" height="250" fill="#ef4444" fillOpacity="0.07" />
                    <rect x="0"   y="0"   width="250" height="250" fill="#3b82f6" fillOpacity="0.07" />

                    {/* Quadrant labels */}
                    <text x="370" y="22"  fill="#22c55e" fontSize="11" fontWeight="bold" opacity="0.9">Leading</text>
                    <text x="290" y="490" fill="#f97316" fontSize="11" fontWeight="bold" opacity="0.9">Weakening</text>
                    <text x="20"  y="490" fill="#ef4444" fontSize="11" fontWeight="bold" opacity="0.9">Lagging</text>
                    <text x="20"  y="22"  fill="#3b82f6" fontSize="11" fontWeight="bold" opacity="0.9">Improving</text>

                    {/* Center lines */}
                    <line x1="250" y1="0"   x2="250" y2="500" stroke="#1e1e2e" strokeWidth="1.5" />
                    <line x1="0"   y1="250" x2="500" y2="250" stroke="#1e1e2e" strokeWidth="1.5" />

                    {/* Axis labels */}
                    <text x="250" y="495" fill="#6b6b85" fontSize="9" textAnchor="middle">← Underperforming · RS-Ratio · Outperforming →</text>
                    <text x="8" y="250" fill="#6b6b85" fontSize="9" textAnchor="middle" transform="rotate(-90,8,250)">RS-Momentum</text>

                    {/* Sector trails and dots */}
                    {rrgData.map(sector => {
                      const color = SECTOR_COLORS[sector.name] || '#f0c040';
                      const pts = sector.tail;
                      if (pts.length < 2) return null;
                      const polyPts = pts.map(p => `${sx(p.x)},${sy(p.y)}`).join(' ');
                      const curr = pts[pts.length - 1];
                      return (
                        <g key={sector.name}>
                          {/* Trail line */}
                          <polyline points={polyPts} fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.4" strokeDasharray="4 2" />
                          {/* Trail dots (older = smaller + more transparent) */}
                          {pts.slice(0, -1).map((p, i) => (
                            <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={3 + i * 0.5}
                              fill={color} fillOpacity={0.15 + i * 0.1} />
                          ))}
                          {/* Current position */}
                          <circle cx={sx(curr.x)} cy={sy(curr.y)} r="8" fill={color} fillOpacity="0.9" />
                          <circle cx={sx(curr.x)} cy={sy(curr.y)} r="11" fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.4" />
                          {/* Label */}
                          <text
                            x={sx(curr.x) + (curr.x >= 100 ? 13 : -13)}
                            y={sy(curr.y) + 4}
                            fill={color}
                            fontSize="10"
                            fontWeight="bold"
                            textAnchor={curr.x >= 100 ? 'start' : 'end'}
                          >{sector.name}</text>
                        </g>
                      );
                    })}

                    {/* Center dot (NIFTY 50) */}
                    <circle cx="250" cy="250" r="5" fill="#f0c040" />
                    <text x="263" y="254" fill="#f0c040" fontSize="9" fontWeight="bold">NIFTY 50</text>
                  </svg>
                </div>

                {/* Phase legend */}
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
