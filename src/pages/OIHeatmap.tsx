import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface StrikeRow {
  strike: number;
  ce_oi: number;
  pe_oi: number;
}

const INDEX_OPTIONS = ['NIFTY50', 'BANKNIFTY', 'FINNIFTY', 'MIDCAPNIFTY', 'SENSEX', 'BANKEX'];

function computeMaxPain(rows: StrikeRow[]): number {
  let minPain = Infinity;
  let maxPainStrike = rows[0]?.strike ?? 0;
  for (const candidate of rows) {
    const S = candidate.strike;
    let pain = 0;
    for (const r of rows) {
      pain += r.ce_oi * Math.max(0, S - r.strike);
      pain += r.pe_oi * Math.max(0, r.strike - S);
    }
    if (pain < minPain) {
      minPain = pain;
      maxPainStrike = S;
    }
  }
  return maxPainStrike;
}

function parseStrikeData(raw: Record<string, any>): StrikeRow[] {
  if (!raw) return [];
  return Object.entries(raw)
    .map(([key, val]: [string, any]) => {
      const strike = parseFloat(key);
      if (isNaN(strike)) return null;
      const ce_oi = parseFloat(val?.ce_oi ?? val?.CE_OI ?? val?.ceOI ?? 0) || 0;
      const pe_oi = parseFloat(val?.pe_oi ?? val?.PE_OI ?? val?.peOI ?? 0) || 0;
      return { strike, ce_oi, pe_oi };
    })
    .filter((r): r is StrikeRow => r !== null)
    .sort((a, b) => a.strike - b.strike);
}

function findATM(rows: StrikeRow[]): number {
  if (!rows.length) return 0;
  // Strike with highest combined OI is closest to ATM (most activity near money)
  return rows.reduce((best, r) =>
    (r.ce_oi + r.pe_oi) > (best.ce_oi + best.pe_oi) ? r : best
  , rows[0]).strike;
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function fmtOI(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function OIHeatmap() {
  const [indexName, setIndexName] = useState('NIFTY50');
  const [expiry, setExpiry] = useState('');
  const [expiries, setExpiries] = useState<string[]>([]);
  const [chainData, setChainData] = useState<Record<string, any> | null>(null);
  const [tradeDate, setTradeDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadExpiries() {
      setExpiries([]);
      setExpiry('');
      setChainData(null);
      setError('');
      const today = new Date().toISOString().split('T')[0];
      const { data, error: err } = await supabase
        .from('market_data')
        .select('expiry')
        .eq('index_name', indexName)
        .gte('expiry', today)
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
      setTradeDate(data[0]?.trade_date ?? '');
    }
    loadChain();
  }, [indexName, expiry]);

  const rows = parseStrikeData(chainData ?? {});
  const maxPain = rows.length ? computeMaxPain(rows) : 0;
  const atm = rows.length ? findATM(rows) : 0;
  const totalCE = rows.reduce((s, r) => s + r.ce_oi, 0);
  const totalPE = rows.reduce((s, r) => s + r.pe_oi, 0);
  const pcr = totalCE > 0 ? totalPE / totalCE : 0;
  // Highest CE OI strike = call writers' resistance wall
  const ceWall = rows.length ? rows.reduce((b, r) => r.ce_oi > b.ce_oi ? r : b, rows[0]) : null;
  // Highest PE OI strike = put writers' support wall
  const peWall = rows.length ? rows.reduce((b, r) => r.pe_oi > b.pe_oi ? r : b, rows[0]) : null;

  const atmIdx = rows.findIndex(r => r.strike === atm);
  // Center view around max pain (best proxy for spot price) rather than OI-balance ATM
  const maxPainIdx = rows.findIndex(r => r.strike === maxPain);
  const centerIdx = maxPainIdx >= 0 ? maxPainIdx : atmIdx;
  const visRows = centerIdx >= 0 ? rows.slice(Math.max(0, centerIdx - 15), centerIdx + 16) : rows.slice(0, 31);
  const maxOI = Math.max(...visRows.map(r => Math.max(r.ce_oi, r.pe_oi)), 1);

  const pcrLabel = pcr > 1.2
    ? 'Bullish bias — PE writers dominating'
    : pcr < 0.8
    ? 'Bearish bias — CE writers dominating'
    : 'Neutral — balanced OI';

  const pcrColor = pcr > 1.2 ? '#39d98a' : pcr < 0.8 ? '#ff4d6d' : '#4d9fff';

  const hasData = rows.length > 0;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#1e1e2e]">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#f0c040] rounded-xl flex items-center justify-center text-lg">⚛</div>
          <div className="font-bold text-base">God Particle</div>
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-sm font-black text-[#e8e8f0]">OI Heatmap</span>
          <Link to="/dashboard" className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040]">← Dashboard</Link>
        </div>
      </nav>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-black mb-1">Open Interest Heatmap</h1>
          <p className="text-xs font-mono text-[#6b6b85]">OI distribution across strikes · Max Pain · PCR analysis</p>
        </div>

        {/* How to use */}
        <div className="bg-[#f0c040]/8 border border-[#f0c040]/25 rounded-2xl p-5">
          <div className="text-[10px] font-black uppercase tracking-widest text-[#f0c040] mb-3">What is this?</div>
          <div className="space-y-2 text-xs font-mono text-[#6b6b85]">
            <div><span className="text-[#e8e8f0] font-black">1.</span> Select an index (Nifty, BankNifty etc.) and expiry date, then click Load.</div>
            <div><span className="text-[#e8e8f0] font-black">2.</span> You'll see a bar chart — green bars are Call (CE) open interest, red bars are Put (PE) open interest at each strike.</div>
            <div><span className="text-[#e8e8f0] font-black">3.</span> <span className="text-[#f0c040]">Max Pain</span> = the price where option buyers collectively lose the most money. Market makers tend to push the index toward this level by expiry.</div>
            <div><span className="text-[#e8e8f0] font-black">💡</span> Requires uploaded option chain data from the God Particle Analysis page.</div>
          </div>
        </div>

        <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Index</label>
              <div className="flex flex-wrap gap-2">
                {INDEX_OPTIONS.map(idx => (
                  <button
                    key={idx}
                    onClick={() => setIndexName(idx)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all border ${indexName === idx ? 'border-[#f0c040] bg-[#f0c040]/10 text-[#f0c040]' : 'border-[#1e1e2e] bg-[#16161f] text-[#6b6b85] hover:text-[#e8e8f0]'}`}
                  >
                    {idx}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Expiry</label>
              {expiries.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {expiries.map(exp => (
                    <button
                      key={exp}
                      onClick={() => setExpiry(exp)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all border ${expiry === exp ? 'border-[#4d9fff] bg-[#4d9fff]/10 text-[#4d9fff]' : 'border-[#1e1e2e] bg-[#16161f] text-[#6b6b85] hover:text-[#e8e8f0]'}`}
                    >
                      {exp}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-xs font-mono text-[#6b6b85]">No expiries found</div>
              )}
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

        {!loading && hasData && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Max Pain', value: `₹${maxPain.toLocaleString('en-IN')}`, color: '#f0c040' },
                { label: 'PCR', value: pcr.toFixed(2), color: pcrColor },
                { label: 'Total CE OI', value: fmtOI(totalCE), color: '#39d98a' },
                { label: 'Total PE OI', value: fmtOI(totalPE), color: '#ff4d6d' },
                { label: 'Date', value: fmtDate(tradeDate), color: '#4d9fff' },
              ].map(card => (
                <div key={card.label} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 text-center">
                  <div className="text-[10px] font-mono text-[#6b6b85] uppercase tracking-widest mb-1">{card.label}</div>
                  <div className="text-lg font-black font-mono" style={{ color: card.color }}>{card.value}</div>
                </div>
              ))}
            </div>

            <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-black text-[#e8e8f0]">OI Distribution</h2>
                <div className="flex items-center gap-4 text-[10px] font-mono text-[#6b6b85]">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-[#39d98a] inline-block" /> CE OI</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-[#ff4d6d] inline-block" /> PE OI</span>
                </div>
              </div>

              <div className="space-y-1">
                {visRows.map(r => {
                  const isMaxPain = r.strike === maxPain;
                  const isATM = r.strike === atm;
                  const cePct = (r.ce_oi / maxOI) * 44;
                  const pePct = (r.pe_oi / maxOI) * 44;

                  return (
                    <div
                      key={r.strike}
                      className={`flex items-center gap-1 rounded-xl px-2 py-1.5 transition-all ${isMaxPain ? 'border border-[#f0c040]/50 bg-[#f0c040]/5' : 'border border-transparent'}`}
                    >
                      <div className="w-[44%] flex items-center justify-end gap-1">
                        <span className="text-[9px] font-mono text-[#6b6b85]">{fmtOI(r.ce_oi)}</span>
                        <div className="h-5 rounded-sm bg-[#39d98a]/70" style={{ width: `${cePct}%`, minWidth: r.ce_oi > 0 ? 2 : 0 }} />
                      </div>

                      <div className="w-[12%] flex flex-col items-center shrink-0">
                        <span
                          className="text-[11px] font-black font-mono leading-tight"
                          style={{ color: isMaxPain ? '#f0c040' : '#e8e8f0' }}
                        >
                          {r.strike.toLocaleString('en-IN')}
                        </span>
                        <div className="flex items-center gap-1 mt-0.5">
                          {isMaxPain && (
                            <span className="text-[8px] font-black text-[#f0c040] bg-[#f0c040]/10 px-1 rounded">⚡ MAX PAIN</span>
                          )}
                          {isATM && !isMaxPain && (
                            <span className="w-2 h-2 rounded-full bg-[#4d9fff] inline-block" />
                          )}
                          {isATM && isMaxPain && (
                            <span className="w-2 h-2 rounded-full bg-[#4d9fff] inline-block ml-1" />
                          )}
                        </div>
                      </div>

                      <div className="w-[44%] flex items-center gap-1">
                        <div className="h-5 rounded-sm bg-[#ff4d6d]/70" style={{ width: `${pePct}%`, minWidth: r.pe_oi > 0 ? 2 : 0 }} />
                        <span className="text-[9px] font-mono text-[#6b6b85]">{fmtOI(r.pe_oi)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center gap-2 text-[10px] font-mono text-[#6b6b85]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#4d9fff] inline-block" /> Highest OI strike</span>
                <span className="mx-2 text-[#1e1e2e]">|</span>
                <span className="flex items-center gap-1"><span className="text-[#f0c040]">⚡ MAX PAIN</span> = likely expiry pin · view centred here</span>
              </div>
            </div>

            <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 space-y-5">
              <h2 className="text-sm font-black text-[#e8e8f0]">Trader's Playbook</h2>

              {/* 3 key levels */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#ff4d6d]/8 border border-[#ff4d6d]/30 rounded-xl p-3 text-center">
                  <div className="text-[9px] font-mono text-[#ff4d6d] uppercase tracking-widest mb-1">CE Wall</div>
                  <div className="text-base font-black font-mono text-[#ff4d6d]">
                    {ceWall ? `₹${ceWall.strike.toLocaleString('en-IN')}` : '—'}
                  </div>
                  <div className="text-[9px] font-mono text-[#6b6b85] mt-0.5">
                    {ceWall ? `${fmtOI(ceWall.ce_oi)} calls` : ''}
                  </div>
                  <div className="text-[9px] font-black text-[#ff4d6d] mt-1">RESISTANCE</div>
                </div>
                <div className="bg-[#f0c040]/8 border border-[#f0c040]/30 rounded-xl p-3 text-center">
                  <div className="text-[9px] font-mono text-[#f0c040] uppercase tracking-widest mb-1">⚡ Max Pain</div>
                  <div className="text-base font-black font-mono text-[#f0c040]">
                    ₹{maxPain.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[9px] font-mono text-[#6b6b85] mt-0.5">expiry pin target</div>
                  <div className="text-[9px] font-black text-[#f0c040] mt-1">MAGNET</div>
                </div>
                <div className="bg-[#39d98a]/8 border border-[#39d98a]/30 rounded-xl p-3 text-center">
                  <div className="text-[9px] font-mono text-[#39d98a] uppercase tracking-widest mb-1">PE Wall</div>
                  <div className="text-base font-black font-mono text-[#39d98a]">
                    {peWall ? `₹${peWall.strike.toLocaleString('en-IN')}` : '—'}
                  </div>
                  <div className="text-[9px] font-mono text-[#6b6b85] mt-0.5">
                    {peWall ? `${fmtOI(peWall.pe_oi)} puts` : ''}
                  </div>
                  <div className="text-[9px] font-black text-[#39d98a] mt-1">SUPPORT</div>
                </div>
              </div>

              {/* PCR */}
              <div
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-black border"
                style={{ color: pcrColor, borderColor: pcrColor + '40', background: pcrColor + '10' }}
              >
                <span>PCR {pcr.toFixed(2)}</span>
                <span>—</span>
                <span>{pcrLabel}</span>
              </div>

              {/* Scenarios */}
              <div className="space-y-2">
                <div className="text-[10px] font-mono text-[#6b6b85] uppercase tracking-widest">What to do now</div>
                <div className="bg-[#39d98a]/8 border border-[#39d98a]/25 rounded-xl p-3 flex items-start gap-3">
                  <span className="text-[#39d98a] text-xs font-black shrink-0 whitespace-nowrap">
                    ↑ Above ₹{maxPain.toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs font-mono text-[#6b6b85] leading-relaxed">
                    PE wall at{' '}
                    <span className="text-[#39d98a] font-black">
                      ₹{peWall?.strike.toLocaleString('en-IN')}
                    </span>{' '}
                    acts as floor →{' '}
                    <span className="text-[#39d98a] font-black">BUY CE</span>{' '}
                    near max pain for upside momentum
                  </span>
                </div>
                <div className="bg-[#ff4d6d]/8 border border-[#ff4d6d]/25 rounded-xl p-3 flex items-start gap-3">
                  <span className="text-[#ff4d6d] text-xs font-black shrink-0 whitespace-nowrap">
                    ↓ Below ₹{maxPain.toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs font-mono text-[#6b6b85] leading-relaxed">
                    CE wall at{' '}
                    <span className="text-[#ff4d6d] font-black">
                      ₹{ceWall?.strike.toLocaleString('en-IN')}
                    </span>{' '}
                    acts as ceiling →{' '}
                    <span className="text-[#ff4d6d] font-black">BUY PE</span>{' '}
                    near max pain for downside momentum
                  </span>
                </div>
                <div className="bg-[#f0c040]/8 border border-[#f0c040]/25 rounded-xl p-3 flex items-start gap-3">
                  <span className="text-[#f0c040] text-xs font-black shrink-0 whitespace-nowrap">
                    ⚡ At ₹{maxPain.toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs font-mono text-[#6b6b85] leading-relaxed">
                    Max pain zone — market likely to pin here on expiry →{' '}
                    <span className="text-[#f0c040] font-black">SELL strangle</span>{' '}
                    outside{' '}
                    <span className="text-[#39d98a] font-black">
                      ₹{peWall?.strike.toLocaleString('en-IN')}
                    </span>
                    {' '}PE and{' '}
                    <span className="text-[#ff4d6d] font-black">
                      ₹{ceWall?.strike.toLocaleString('en-IN')}
                    </span>
                    {' '}CE
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
