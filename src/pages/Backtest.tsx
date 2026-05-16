import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getBacktestDates, getMarketDataBefore, getMarketDataForDate,
  computeIndexForecast, formatExpiryDisplay, type IndexForecast,
} from '../lib/market';

const INDICES = [
  { key: 'NIFTY50',     label: 'Nifty 50' },
  { key: 'SENSEX',      label: 'Sensex' },
  { key: 'BANKNIFTY',   label: 'Bank Nifty' },
  { key: 'FINNIFTY',    label: 'Fin Nifty' },
  { key: 'MIDCAPNIFTY', label: 'Midcap Nifty' },
  { key: 'BANKEX',      label: 'Bankex' },
];

function dteBetween(fromDate: string, toDate: string): number {
  const from = new Date(fromDate + 'T00:00:00Z');
  const to   = new Date(toDate   + 'T00:00:00Z');
  return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / 86400000));
}

function fmtDate(d: string) {
  // "2025-04-21" → "21 Apr 2025"
  const [y, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(day)} ${months[parseInt(m) - 1]} ${y}`;
}

export default function Backtest() {
  const { profile } = useAuth();

  const [indexName, setIndexName] = useState('NIFTY50');
  const [btDate,    setBtDate]    = useState('');
  const [openPrice, setOpenPrice] = useState('');

  const [btDates,     setBtDates]     = useState<{ date: string; expiry: string }[]>([]);
  const [loadingDates, setLoadingDates] = useState(false);
  const [running,     setRunning]     = useState(false);
  const [error,       setError]       = useState('');

  const [forecast,    setForecast]    = useState<IndexForecast | null>(null);
  const [btExpiry,    setBtExpiry]    = useState('');
  const [btSpotClose, setBtSpotClose] = useState(0);
  const [actualClose, setActualClose] = useState<number | null>(null);
  const [priorDates,  setPriorDates]  = useState<string[]>([]);

  // Load available dates when index changes
  useEffect(() => {
    setLoadingDates(true);
    setBtDate(''); setForecast(null); setBtDates([]);
    getBacktestDates(indexName)
      .then(d => { setBtDates(d); if (d.length) setBtDate(d[d.length - 1].date); })
      .catch(() => setBtDates([]))
      .finally(() => setLoadingDates(false));
  }, [indexName]);

  async function runBacktest() {
    const open = parseFloat(openPrice);
    if (!open || open <= 0) { setError('Enter a valid open price.'); return; }
    if (!btDate) { setError('Select a date to backtest.'); return; }

    const entry = btDates.find(d => d.date === btDate);
    if (!entry) { setError('Date not found in database.'); return; }
    const expiry = entry.expiry;

    setRunning(true); setError(''); setForecast(null); setActualClose(null);
    setBtExpiry(expiry); setBtSpotClose(0);
    try {
      // Fetch rows BEFORE the backtest date — this is all the model "knew" at the time
      const rows = await getMarketDataBefore(indexName, expiry, btDate, 3);
      if (!rows.length) {
        setError(`No historical data found before ${fmtDate(btDate)} for this index. Need at least one prior trading day of data uploaded.`);
        return;
      }

      const validRow      = [...rows].reverse().find(r => (r.spot_close ?? 0) > 0) ?? rows[rows.length - 1];
      const chainData     = rows[rows.length - 1].strike_data ?? {};
      const prevChainData = rows.length > 1 ? (rows[rows.length - 2].strike_data ?? {}) : {};
      const spotClose     = validRow?.spot_close ?? validRow?.strike_data?._spot_close ?? 0;
      const vix           = rows[rows.length - 1]?.vix ?? 0;
      const dte           = dteBetween(btDate, expiry);
      const historicals   = rows.map((r: any) => r.strike_data?._spot_close ?? 0).filter((c: number) => c > 0);

      setBtSpotClose(spotClose);
      setPriorDates(rows.map((r: any) => r.trade_date));

      const fc = computeIndexForecast(
        open, spotClose, chainData, vix, indexName, dte, historicals, [], prevChainData, 50,
      );
      setForecast(fc);

      // Fetch the actual row for backtest date to compare prediction vs reality
      const actualRow = await getMarketDataForDate(indexName, expiry, btDate);
      if (actualRow) {
        const sc: number | null = actualRow.spot_close ?? actualRow.strike_data?._spot_close ?? null;
        setActualClose(sc);
      }
    } catch (e: any) {
      setError(e.message ?? 'Backtest failed — check your connection and try again.');
    } finally {
      setRunning(false);
    }
  }

  // ── SVG chart ──
  const SVG_W = 700, SVG_H = 360;
  const PAD_L = 80, PAD_R = 20, PAD_T = 30, PAD_B = 40;
  const chartW = SVG_W - PAD_L - PAD_R;
  const chartH = SVG_H - PAD_T - PAD_B;
  const TOTAL_MIN = 375;
  const xOf = (min: number) => PAD_L + (min / TOTAL_MIN) * chartW;

  let svgContent: JSX.Element | null = null;
  let accuracy: { hit: boolean; label: string; detail: string; color: string } | null = null;

  if (forecast) {
    const fc = forecast;
    const pathPrices = [...fc.points.map(p => p.high), ...fc.points.map(p => p.low)];
    if (actualClose !== null) pathPrices.push(actualClose);
    const pad = Math.max(fc.dailyRange * 0.15, 30);
    const priceMin = Math.min(...pathPrices) - pad;
    const priceMax = Math.max(...pathPrices) + pad;
    const priceRange = priceMax - priceMin || 1;
    const yOf = (p: number) => PAD_T + ((priceMax - p) / priceRange) * chartH;
    const pts = fc.points;
    const biasCol = fc.bias === 'BEARISH' ? '#ff4d6d' : fc.bias === 'BULLISH' ? '#39d98a' : '#f0c040';

    const topPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.minuteOffset).toFixed(1)},${yOf(p.high).toFixed(1)}`).join(' ');
    const botPath = [...pts].reverse().map(p => `L${xOf(p.minuteOffset).toFixed(1)},${yOf(p.low).toFixed(1)}`).join(' ');
    const centralPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.minuteOffset).toFixed(1)},${yOf(p.central).toFixed(1)}`).join(' ');

    if (actualClose !== null) {
      const lastPt = pts[pts.length - 1];
      const hit = actualClose >= lastPt.low && actualClose <= lastPt.high;
      const closeToCenter = Math.abs(actualClose - lastPt.central);
      const halfRange = Math.max(1, (lastPt.high - lastPt.low) / 2);
      const pct = Math.round((closeToCenter / halfRange) * 100);
      accuracy = hit
        ? {
            hit: true,
            label: `✅ INSIDE predicted range`,
            detail: `Actual close ${actualClose.toLocaleString('en-IN')} was ${pct}% from the predicted center (${lastPt.central.toLocaleString('en-IN')})`,
            color: '#39d98a',
          }
        : {
            hit: false,
            label: `❌ OUTSIDE predicted range`,
            detail: `Actual close ${actualClose.toLocaleString('en-IN')} missed by ${Math.round(actualClose > lastPt.high ? actualClose - lastPt.high : lastPt.low - actualClose)} pts. Predicted band: ${lastPt.low.toLocaleString('en-IN')}–${lastPt.high.toLocaleString('en-IN')}`,
            color: '#ff4d6d',
          };
    }

    svgContent = (
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full" style={{ maxHeight: 360 }}>
        {[0, 0.25, 0.5, 0.75, 1].map(f => {
          const p = priceMin + f * priceRange;
          const y = yOf(p);
          return (
            <g key={f}>
              <line x1={PAD_L} y1={y} x2={SVG_W - PAD_R} y2={y} stroke="#1e1e2e" strokeWidth="1" />
              <text x={PAD_L - 5} y={y + 4} textAnchor="end" fontSize="9" fill="#6b6b85">{Math.round(p).toLocaleString('en-IN')}</text>
            </g>
          );
        })}
        {fc.levels.map(lv => {
          const y = yOf(lv.price);
          if (y < PAD_T || y > PAD_T + chartH) return null;
          return (
            <g key={lv.label}>
              <line x1={PAD_L} y1={y} x2={SVG_W - PAD_R} y2={y} stroke={lv.color} strokeWidth="1.5" strokeDasharray="6,3" opacity="0.7" />
              <text x={SVG_W - PAD_R + 2} y={y + 4} fontSize="8" fill={lv.color} opacity="0.8">{lv.price.toLocaleString('en-IN')}</text>
            </g>
          );
        })}
        <path d={`${topPath} ${botPath} Z`} fill={biasCol} fillOpacity="0.08" />
        <path d={centralPath} fill="none" stroke={biasCol} strokeWidth="2.5" strokeLinejoin="round" />
        {pts.map(p => (
          <g key={p.timeLabel}>
            <circle cx={xOf(p.minuteOffset)} cy={yOf(p.central)} r="5" fill="#0a0a0f" stroke={biasCol} strokeWidth="2" />
            <text x={xOf(p.minuteOffset)} y={SVG_H - PAD_B + 14} textAnchor="middle" fontSize="9" fill="#6b6b85">{p.timeLabel.split(' ')[0]}</text>
            <text x={xOf(p.minuteOffset)} y={yOf(p.central) - 10} textAnchor="middle" fontSize="9" fill={biasCol} fontWeight="bold">{p.central.toLocaleString('en-IN')}</text>
          </g>
        ))}
        {actualClose !== null && (() => {
          const y = yOf(actualClose);
          return (
            <g>
              <line x1={PAD_L} y1={y} x2={SVG_W - PAD_R} y2={y} stroke="#ffffff" strokeWidth="2" strokeDasharray="5,3" opacity="0.85" />
              <text x={PAD_L + 4} y={y - 5} fontSize="9" fill="#ffffff" fontWeight="bold">ACTUAL {actualClose.toLocaleString('en-IN')}</text>
            </g>
          );
        })()}
        <line x1={PAD_L} y1={PAD_T + chartH} x2={SVG_W - PAD_R} y2={PAD_T + chartH} stroke="#1e1e2e" strokeWidth="1" />
      </svg>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      <nav className="relative z-10 flex items-center justify-between px-4 py-3 border-b border-[#1e1e2e]">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#f0c040] rounded-lg flex items-center justify-center text-base">⚛</div>
          <span className="font-bold text-sm">God Particle</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-[#6b6b85]">
            Credits: <span className="text-[#f0c040] font-bold">{['pro', 'admin'].includes(profile?.role ?? '') ? '∞' : profile?.credits ?? 0}</span>
          </span>
          <Link to="/dashboard" className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040]">← Dashboard</Link>
        </div>
      </nav>

      <div className="relative z-10 max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">⏪</span>
            <h1 className="text-xl font-black">Back Test</h1>
            <span className="text-[10px] font-black bg-[#39d98a] text-black px-2 py-0.5 rounded-full ml-1">FREE</span>
          </div>
          <p className="text-xs font-mono text-[#6b6b85]">
            Pick any past trading date. Enter the open price for that day. We run the exact same prediction model using only data that existed before that date — zero cheating.
          </p>
        </div>

        {/* Controls */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">

            <div>
              <label className="block text-[10px] font-mono text-[#6b6b85] uppercase tracking-widest mb-1">Index</label>
              <select
                value={indexName}
                onChange={e => { setIndexName(e.target.value); setForecast(null); setOpenPrice(''); }}
                className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]"
              >
                {INDICES.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-[#6b6b85] uppercase tracking-widest mb-1">
                Date to Backtest {loadingDates && <span className="text-[#f0c040]">⏳</span>}
              </label>
              <select
                value={btDate}
                onChange={e => { setBtDate(e.target.value); setForecast(null); }}
                disabled={loadingDates || !btDates.length}
                className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040] disabled:opacity-50"
              >
                <option value="">Select date</option>
                {btDates.map(({ date }) => (
                  <option key={date} value={date}>{fmtDate(date)}</option>
                ))}
              </select>
              {!loadingDates && btDates.length === 0 && (
                <div className="text-[10px] font-mono text-[#f0c040] mt-1">No data available — upload CSV data first</div>
              )}
              {btDate && btExpiry === '' && (() => {
                const entry = btDates.find(d => d.date === btDate);
                return entry ? (
                  <div className="text-[10px] font-mono text-[#6b6b85] mt-1">
                    Using expiry: <span className="text-[#a855f7]">{formatExpiryDisplay(entry.expiry)}</span>
                  </div>
                ) : null;
              })()}
              {btExpiry && (
                <div className="text-[10px] font-mono text-[#6b6b85] mt-1">
                  Used expiry: <span className="text-[#a855f7]">{formatExpiryDisplay(btExpiry)}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-mono text-[#6b6b85] uppercase tracking-widest mb-1">
                Open Price on {btDate ? fmtDate(btDate) : 'selected date'}
              </label>
              <input
                type="number"
                value={openPrice}
                onChange={e => { setOpenPrice(e.target.value); setForecast(null); }}
                placeholder={btSpotClose > 0 ? `e.g. ${Math.round(btSpotClose)}` : 'e.g. 23731'}
                step="1"
                className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]"
              />
              {btSpotClose > 0 && openPrice && (
                <div className="text-[10px] font-mono text-[#6b6b85] mt-1">
                  Gap from prev close ({btSpotClose.toLocaleString('en-IN')}): <span className={`font-bold ${parseFloat(openPrice) >= btSpotClose ? 'text-[#39d98a]' : 'text-[#ff4d6d]'}`}>
                    {parseFloat(openPrice) >= btSpotClose ? '+' : ''}{Math.round(parseFloat(openPrice) - btSpotClose)} pts
                  </span>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-lg px-4 py-2 text-xs font-mono text-[#ff4d6d] mb-3">{error}</div>
          )}

          <button
            onClick={runBacktest}
            disabled={running || !btDate || !openPrice}
            className="w-full bg-[#f0c040] text-black font-black py-3 rounded-xl hover:bg-[#ffd060] transition-all disabled:opacity-40 text-sm"
          >
            {running ? '⏳ Running Backtest...' : '⏪ Run Backtest — FREE'}
          </button>
        </div>

        {/* Results */}
        {forecast && (() => {
          const fc = forecast;
          const biasCol = fc.bias === 'BEARISH' ? '#ff4d6d' : fc.bias === 'BULLISH' ? '#39d98a' : '#f0c040';
          const indexLabel = INDICES.find(i => i.key === indexName)?.label ?? indexName;

          return (
            <div className="space-y-4">

              {/* Data provenance */}
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl px-4 py-3 text-xs font-mono text-[#6b6b85]">
                <span className="text-[#e8e8f0] font-bold">Data the model used:</span>{' '}
                {priorDates.length > 0
                  ? priorDates.map(fmtDate).join(', ')
                  : 'no prior data'}
                {' '}· DTE at prediction time: <span className="text-[#e8e8f0]">{fc.dte}d</span>
                {' '}· Expiry: <span className="text-[#a855f7]">{formatExpiryDisplay(btExpiry)}</span>
                {btSpotClose > 0 && <>{' '}· Prev close: <span className="text-[#f0c040]">{btSpotClose.toLocaleString('en-IN')}</span></>}
              </div>

              {/* Bias banner */}
              <div className={`rounded-xl px-4 py-4 text-xs font-mono font-bold ${
                fc.bias === 'BEARISH' ? 'bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 text-[#ff4d6d]'
                : fc.bias === 'BULLISH' ? 'bg-[#39d98a]/10 border border-[#39d98a]/30 text-[#39d98a]'
                : 'bg-[#f0c040]/10 border border-[#f0c040]/30 text-[#f0c040]'
              }`}>
                <div className="text-sm mb-1">
                  {fc.bias === 'BEARISH' ? '📉 Model predicted: BEARISH'
                    : fc.bias === 'BULLISH' ? '📈 Model predicted: BULLISH'
                    : '↔ Model predicted: NEUTRAL (Range Bound)'}
                </div>
                <div className="font-normal opacity-80 mb-2">{fc.summary}</div>
                <div className="text-[10px] opacity-70 space-x-2">
                  <span>Conviction: <strong>{fc.convictionScore > 0 ? '+' : ''}{fc.convictionScore}</strong></span>
                  {fc.gapSignal !== 0 && <span>· Gap signal: <strong>{fc.gapSignal > 0 ? '+' : ''}{fc.gapSignal}</strong></span>}
                  <span>· Max Pain gravity: <strong>{Math.round(fc.mpGravity * 100)}%</strong></span>
                </div>
              </div>

              {/* Accuracy verdict */}
              {accuracy && (
                <div className="rounded-xl px-4 py-4 border" style={{ borderColor: accuracy.color + '50', background: accuracy.color + '12' }}>
                  <div className="text-base font-black mb-1" style={{ color: accuracy.color }}>{accuracy.label}</div>
                  <div className="text-xs font-mono" style={{ color: accuracy.color }}>{accuracy.detail}</div>
                </div>
              )}
              {actualClose === null && !running && (
                <div className="bg-[#f0c040]/10 border border-[#f0c040]/30 rounded-xl px-4 py-3 text-xs font-mono text-[#f0c040]">
                  ⚠️ No actual close data found for {fmtDate(btDate)} in the database. Upload the CSV for that date to see the accuracy comparison.
                </div>
              )}

              {/* Chart */}
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-1 h-5 rounded block" style={{ background: biasCol }} />
                  <span className="text-sm font-black" style={{ color: biasCol }}>
                    Predicted path — {indexLabel} · {fmtDate(btDate)}
                  </span>
                </div>

                <div className="bg-[#0a0a0f] rounded-xl p-2 overflow-x-auto mb-3">
                  {svgContent}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-3 px-1 mb-3">
                  {fc.levels.map(lv => (
                    <div key={lv.label} className="flex items-center gap-1.5 text-[10px] font-mono">
                      <div className="w-4 h-0.5" style={{ background: lv.color }} />
                      <span style={{ color: lv.color }}>{lv.label}</span>
                    </div>
                  ))}
                  {actualClose !== null && (
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-white/70">
                      <div className="w-4 h-0.5 bg-white/70" />
                      <span>Actual Close</span>
                    </div>
                  )}
                </div>

                {/* Checkpoint table */}
                <div className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl overflow-hidden">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-[#1e1e2e]">
                        {['Time', 'Predicted Level', 'Predicted Range'].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-[#6b6b85] uppercase tracking-widest font-normal text-[10px]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fc.points.map((p, i) => (
                        <tr key={i} className="border-b border-[#1e1e2e] last:border-0">
                          <td className="px-3 py-2 text-[#6b6b85]">{p.timeLabel}</td>
                          <td className="px-3 py-2 font-bold" style={{ color: biasCol }}>{p.central.toLocaleString('en-IN')}</td>
                          <td className="px-3 py-2 text-[#6b6b85]">{p.low.toLocaleString('en-IN')} – {p.high.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                      {actualClose !== null && (
                        <tr className="border-t border-white/10 bg-white/5">
                          <td className="px-3 py-2.5 font-bold text-white">Actual Close</td>
                          <td className="px-3 py-2.5 font-black text-white" style={{ color: accuracy?.color }}>{actualClose.toLocaleString('en-IN')}</td>
                          <td className="px-3 py-2.5 text-[10px] font-mono" style={{ color: accuracy?.color }}>{accuracy?.hit ? '✅ Inside band' : '❌ Outside band'}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Key levels */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Max Pain', value: fc.maxPain },
                  { label: 'Prev Close', value: btSpotClose },
                  { label: 'Open (entered)', value: parseFloat(openPrice) },
                ].map((kl, i) => (
                  <div key={i} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-3 text-center">
                    <div className="text-[10px] font-mono text-[#6b6b85] mb-1">{kl.label}</div>
                    <div className="text-lg font-black text-[#f0c040]">{kl.value > 0 ? kl.value.toLocaleString('en-IN') : '—'}</div>
                  </div>
                ))}
              </div>

              <div className="text-[10px] font-mono text-[#6b6b85] text-center pb-4">
                Backtest uses only data available before {fmtDate(btDate)} — no future information. Past accuracy does not guarantee future results.
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
