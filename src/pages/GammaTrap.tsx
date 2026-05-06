import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface StrikeRow {
  strike: number;
  ce_oi: number;
  pe_oi: number;
  ce_iv: number;
  pe_iv: number;
}

interface GammaRow extends StrikeRow {
  dollarGamma: number;
}

const INDEX_OPTIONS = ['NIFTY50', 'BANKNIFTY', 'FINNIFTY', 'MIDCAPNIFTY'];
const DTE_OPTIONS = [0, 1, 2, 3];

function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function bsGamma(S: number, K: number, T: number, sigma: number): number {
  if (T <= 0 || sigma <= 0 || S <= 0) return 0;
  const d1 = (Math.log(S / K) + (0.065 + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return normPdf(d1) / (S * sigma * Math.sqrt(T));
}

function parseStrikeData(raw: Record<string, any>): StrikeRow[] {
  if (!raw) return [];
  return Object.entries(raw)
    .map(([key, val]: [string, any]) => {
      const strike = parseFloat(key);
      if (isNaN(strike)) return null;
      const ce_oi = parseFloat(val?.ce_oi ?? val?.CE_OI ?? val?.ceOI ?? 0) || 0;
      const pe_oi = parseFloat(val?.pe_oi ?? val?.PE_OI ?? val?.peOI ?? 0) || 0;
      let ce_iv = parseFloat(val?.ce_iv ?? val?.CE_IV ?? val?.ceIV ?? 0) || 0;
      let pe_iv = parseFloat(val?.pe_iv ?? val?.PE_IV ?? val?.peIV ?? 0) || 0;
      if (ce_iv > 0 && ce_iv < 1.0) ce_iv *= 100;
      if (pe_iv > 0 && pe_iv < 1.0) pe_iv *= 100;
      return { strike, ce_oi, pe_oi, ce_iv, pe_iv };
    })
    .filter((r): r is StrikeRow => r !== null)
    .sort((a, b) => a.strike - b.strike);
}

function computeGammaRows(rows: StrikeRow[], spot: number, dte: number): GammaRow[] {
  const T = Math.max(dte, 0.5) / 365;
  return rows.map(r => {
    const avgIV = ((r.ce_iv + r.pe_iv) / 2) / 100;
    const sigma = avgIV > 0 ? avgIV : 0.15;
    const gamma = bsGamma(spot, r.strike, T, sigma);
    const dollarGamma = gamma * (r.ce_oi + r.pe_oi) * spot;
    return { ...r, dollarGamma };
  });
}

function fmtOI(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

function fmtGamma(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(2);
}

function isThursday(): boolean {
  return new Date().getDay() === 4;
}

export default function GammaTrap() {
  const [indexName, setIndexName] = useState('NIFTY50');
  const [expiry, setExpiry] = useState('');
  const [expiries, setExpiries] = useState<string[]>([]);
  const [chainData, setChainData] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [spot, setSpot] = useState('');
  const [dte, setDte] = useState(1);

  useEffect(() => {
    async function loadExpiries() {
      setExpiries([]);
      setExpiry('');
      setChainData(null);
      setError('');
      const { data, error: err } = await supabase
        .from('market_data')
        .select('expiry')
        .eq('index_name', indexName)
        .order('expiry', { ascending: true });
      if (err) { setError(err.message); return; }
      const unique = [...new Set((data ?? []).map((r: any) => r.expiry))];
      setExpiries(unique);
      if (unique.length > 0) setExpiry(unique[0]);
    }
    loadExpiries();
  }, [indexName]);

  useEffect(() => {
    if (!expiry) return;
    async function loadChain() {
      setLoading(true);
      setError('');
      setChainData(null);
      const { data, error: err } = await supabase
        .from('market_data')
        .select('*')
        .eq('index_name', indexName)
        .eq('expiry', expiry)
        .order('trade_date', { ascending: false })
        .limit(1);
      setLoading(false);
      if (err) { setError(err.message); return; }
      if (!data || data.length === 0) { setChainData(null); return; }
      setChainData(data[0]?.strike_data ?? null);
    }
    loadChain();
  }, [indexName, expiry]);

  const spotNum = parseFloat(spot) || 0;
  const rows = parseStrikeData(chainData ?? {});
  const gammaRows = spotNum > 0 && rows.length > 0 ? computeGammaRows(rows, spotNum, dte) : [];

  const sortedByGamma = [...gammaRows].sort((a, b) => b.dollarGamma - a.dollarGamma);
  const topWalls = sortedByGamma.slice(0, 3).map(r => r.strike);
  const pinZone = sortedByGamma[0]?.strike ?? 0;
  const maxDollarGamma = sortedByGamma[0]?.dollarGamma ?? 1;

  const gammaFlipStrike = (() => {
    for (let i = 0; i < gammaRows.length - 1; i++) {
      const curr = gammaRows[i];
      const next = gammaRows[i + 1];
      const currNet = curr.ce_oi - curr.pe_oi;
      const nextNet = next.ce_oi - next.pe_oi;
      if ((currNet > 0 && nextNet <= 0) || (currNet < 0 && nextNet >= 0)) {
        return curr.strike;
      }
    }
    return 0;
  })();

  const spotIdx = gammaRows.findIndex(r => r.strike >= spotNum);
  const visStart = Math.max(0, spotIdx - 15);
  const visEnd = Math.min(gammaRows.length, spotIdx + 16);
  const visRows = spotNum > 0 ? gammaRows.slice(visStart, visEnd) : gammaRows.slice(0, 31);

  const playbook = (() => {
    if (!pinZone || !spotNum) return null;
    const diff = spotNum - pinZone;
    if (diff > 30) return {
      text: `Price above gamma magnet — expect pull BACK toward ₹${pinZone.toLocaleString('en-IN')}. Sell CE above ₹${(pinZone + 50).toLocaleString('en-IN')}, buy PE near ₹${pinZone.toLocaleString('en-IN')}.`,
      color: '#ff4d6d',
    };
    if (diff < -30) return {
      text: `Price below gamma magnet — expect PUSH up toward ₹${pinZone.toLocaleString('en-IN')}. Buy CE near ₹${pinZone.toLocaleString('en-IN')}.`,
      color: '#39d98a',
    };
    return {
      text: `Price AT gamma magnet — expect choppy consolidation. Sell straddle at ₹${pinZone.toLocaleString('en-IN')} strike.`,
      color: '#f0c040',
    };
  })();

  const hasData = rows.length > 0;
  const hasGamma = gammaRows.length > 0 && spotNum > 0;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#1e1e2e]">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#f0c040] rounded-xl flex items-center justify-center text-lg">⚛</div>
          <div className="font-bold text-base">God Particle</div>
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-sm font-black text-[#e8e8f0]">Gamma Trap</span>
          <Link to="/dashboard" className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040]">← Dashboard</Link>
        </div>
      </nav>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-black mb-1">Gamma Trap</h1>
          <p className="text-xs font-mono text-[#6b6b85]">Gamma walls · Pin zones · Expiry day playbook</p>
        </div>

        {/* How to use */}
        <div className="bg-[#ff4d6d]/8 border border-[#ff4d6d]/25 rounded-2xl p-5">
          <div className="text-[10px] font-black uppercase tracking-widest text-[#ff4d6d] mb-3">What is this?</div>
          <div className="space-y-2 text-xs font-mono text-[#6b6b85]">
            <div><span className="text-[#e8e8f0] font-black">Best used on expiry day</span> — every Thursday for Nifty/BankNifty/FinNifty, Friday for Sensex/Bankex.</div>
            <div><span className="text-[#e8e8f0] font-black">1.</span> Select the index and expiry. Enter today's current Nifty/BankNifty spot price. Set DTE (0 = today is expiry).</div>
            <div><span className="text-[#e8e8f0] font-black">2.</span> The <span className="text-[#ff4d6d]">Pin Zone</span> is where the index is magnetically pulled toward at expiry — market makers hedge there aggressively.</div>
            <div><span className="text-[#e8e8f0] font-black">3.</span> <span className="text-[#ff8c42]">Gamma Walls</span> = strikes where the market gets stuck or accelerates violently past. Trade the breakout of a gamma wall.</div>
            <div><span className="text-[#e8e8f0] font-black">💡</span> Requires uploaded option chain data from the God Particle Analysis page.</div>
          </div>
        </div>

        {isThursday() && (
          <div className="bg-[#39d98a]/10 border border-[#39d98a]/40 rounded-xl px-4 py-3 text-sm font-black text-[#39d98a] text-center">
            Today is Expiry Day!
          </div>
        )}

        <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Index</label>
              <div className="flex flex-col gap-1.5">
                {INDEX_OPTIONS.map(idx => (
                  <button
                    key={idx}
                    onClick={() => setIndexName(idx)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all border text-left ${indexName === idx ? 'border-[#f0c040] bg-[#f0c040]/10 text-[#f0c040]' : 'border-[#1e1e2e] bg-[#16161f] text-[#6b6b85] hover:text-[#e8e8f0]'}`}
                  >
                    {idx}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Expiry</label>
              {expiries.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {expiries.map(exp => (
                    <button
                      key={exp}
                      onClick={() => setExpiry(exp)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all border text-left ${expiry === exp ? 'border-[#4d9fff] bg-[#4d9fff]/10 text-[#4d9fff]' : 'border-[#1e1e2e] bg-[#16161f] text-[#6b6b85] hover:text-[#e8e8f0]'}`}
                    >
                      {exp}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-xs font-mono text-[#6b6b85]">No expiries</div>
              )}
            </div>

            <div>
              <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Current Spot</label>
              <input
                type="number"
                value={spot}
                onChange={e => setSpot(e.target.value)}
                placeholder={indexName === 'BANKNIFTY' ? 'e.g. 47000' : 'e.g. 22000'}
                className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]"
              />
              <p className="text-[10px] font-mono text-[#6b6b85] mt-1">Enter live index price</p>
            </div>

            <div>
              <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">DTE (Days to Expiry)</label>
              <div className="grid grid-cols-2 gap-1.5">
                {DTE_OPTIONS.map(d => (
                  <button
                    key={d}
                    onClick={() => setDte(d)}
                    className={`py-2 rounded-lg text-xs font-black transition-all border ${dte === d ? 'border-[#ff8c42] bg-[#ff8c42]/10 text-[#ff8c42]' : 'border-[#1e1e2e] bg-[#16161f] text-[#6b6b85] hover:text-[#e8e8f0]'}`}
                  >
                    {d === 0 ? 'Expiry' : `${d}d`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {loading && (
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-8 text-center">
            <div className="text-xs font-mono text-[#6b6b85] animate-pulse">Loading chain data…</div>
          </div>
        )}

        {error && (
          <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-xl px-4 py-3 text-xs font-mono text-[#ff4d6d]">{error}</div>
        )}

        {!loading && !error && chainData === null && expiry && (
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-10 text-center space-y-3">
            <div className="text-3xl">📭</div>
            <div className="text-sm font-black text-[#6b6b85]">No data available</div>
            <div className="text-xs font-mono text-[#6b6b85] max-w-sm mx-auto">
              Upload option chain data from the God Particle Analysis page first.
            </div>
          </div>
        )}

        {!loading && hasData && !hasGamma && (
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl px-4 py-3 text-xs font-mono text-[#6b6b85]">
            Enter a spot price above to compute gamma profile.
          </div>
        )}

        {!loading && hasGamma && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Pin Zone', value: `₹${pinZone.toLocaleString('en-IN')}`, color: '#f0c040', badge: '📍' },
                { label: 'Gamma Flip', value: gammaFlipStrike ? `₹${gammaFlipStrike.toLocaleString('en-IN')}` : 'N/A', color: '#ff8c42', badge: '🔄' },
                { label: 'Spot', value: `₹${spotNum.toLocaleString('en-IN')}`, color: '#4d9fff', badge: '📊' },
                { label: 'DTE', value: `${dte} day${dte !== 1 ? 's' : ''}`, color: '#6b6b85', badge: '⏱' },
              ].map(card => (
                <div key={card.label} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 text-center">
                  <div className="text-lg mb-1">{card.badge}</div>
                  <div className="text-[10px] font-mono text-[#6b6b85] uppercase tracking-widest mb-1">{card.label}</div>
                  <div className="text-lg font-black font-mono" style={{ color: card.color }}>{card.value}</div>
                </div>
              ))}
            </div>

            <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-black text-[#e8e8f0]">Gamma Profile</h2>
                <div className="flex items-center gap-3 text-[10px] font-mono text-[#6b6b85]">
                  <span className="flex items-center gap-1"><span className="text-[#f0c040]">🧲 WALL</span> = top 3 gamma</span>
                  <span className="flex items-center gap-1"><span className="text-[#f0c040]">📍 PIN</span> = max magnet</span>
                </div>
              </div>

              <div className="space-y-1">
                {visRows.map(r => {
                  const isWall = topWalls.includes(r.strike);
                  const isPin = r.strike === pinZone;
                  const isSpotRow = rows.find(s => s.strike === r.strike) && Math.abs(r.strike - spotNum) === Math.min(...rows.map(s => Math.abs(s.strike - spotNum)));
                  const barPct = maxDollarGamma > 0 ? (r.dollarGamma / maxDollarGamma) * 80 : 0;

                  return (
                    <div
                      key={r.strike}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2 transition-all ${isPin ? 'border border-[#f0c040]/50 bg-[#f0c040]/5' : isWall ? 'border border-[#ff8c42]/30 bg-[#ff8c42]/5' : 'border border-transparent'}`}
                    >
                      <div className="w-20 shrink-0 text-right">
                        <span
                          className="text-[11px] font-black font-mono"
                          style={{ color: isPin ? '#f0c040' : isWall ? '#ff8c42' : '#e8e8f0' }}
                        >
                          {r.strike.toLocaleString('en-IN')}
                        </span>
                        {isSpotRow && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-[#4d9fff] inline-block align-middle" />}
                      </div>

                      <div className="flex-1 relative h-6 flex items-center">
                        <div
                          className="h-4 rounded-sm transition-all"
                          style={{
                            width: `${barPct}%`,
                            background: isPin ? '#f0c040' : isWall ? '#ff8c42' : '#4d9fff',
                            opacity: isPin ? 1 : isWall ? 0.85 : 0.5,
                            minWidth: r.dollarGamma > 0 ? 2 : 0,
                          }}
                        />
                      </div>

                      <div className="w-28 shrink-0 flex items-center gap-2 justify-end">
                        <span className="text-[10px] font-mono text-[#6b6b85]">{fmtGamma(r.dollarGamma)}</span>
                        {isPin && <span className="text-[8px] font-black text-[#f0c040] bg-[#f0c040]/10 px-1 py-0.5 rounded">📍 PIN</span>}
                        {isWall && !isPin && <span className="text-[8px] font-black text-[#ff8c42] bg-[#ff8c42]/10 px-1 py-0.5 rounded">🧲 WALL</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {playbook && (
              <div
                className="bg-[#111118] rounded-2xl p-6 space-y-3 border"
                style={{ borderColor: playbook.color + '40' }}
              >
                <h2 className="text-sm font-black" style={{ color: playbook.color }}>Expiry Day Playbook</h2>
                <p className="text-sm font-mono" style={{ color: playbook.color }}>
                  {playbook.text}
                </p>
                <div className="grid grid-cols-3 gap-3 pt-2">
                  {topWalls.map((w, i) => (
                    <div key={w} className="bg-[#16161f] rounded-xl p-3 text-center border border-[#1e1e2e]">
                      <div className="text-[9px] font-mono text-[#6b6b85] mb-1">GAMMA WALL #{i + 1}</div>
                      <div className="text-sm font-black font-mono text-[#ff8c42]">₹{w.toLocaleString('en-IN')}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
