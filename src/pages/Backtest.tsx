import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getBacktestDates, getMarketDataBefore, getIndexOHLC, getOHLCDates,
  getRecentOHLC, computeATR, getFIIActivity,
  computeIndexForecast, formatExpiryDisplay, type IndexForecast, type IndexOHLC,
} from '../lib/market';

const INDICES = [
  { key: 'NIFTY50',     label: 'Nifty 50' },
  { key: 'SENSEX',      label: 'Sensex' },
  { key: 'BANKNIFTY',   label: 'Bank Nifty' },
  { key: 'FINNIFTY',    label: 'Fin Nifty' },
  { key: 'MIDCAPNIFTY', label: 'Midcap Nifty' },
  { key: 'BANKEX',      label: 'Bankex' },
];

// Per-index tolerance for "accurate" (±pts on H, L, Close)
const TOLERANCE: Record<string, number> = {
  NIFTY50: 25, BANKNIFTY: 100, FINNIFTY: 50, MIDCAPNIFTY: 30,
  NIFTYNEXT50: 25, SENSEX: 75, BANKEX: 100,
};

interface BatchResult {
  date: string;
  predHigh: number; predLow: number; predClose: number;
  actualHigh: number; actualLow: number; actualClose: number;
  diffH: number; diffL: number; diffC: number;
  passH: boolean; passL: boolean; passC: boolean;
  pass: boolean;
  bias: string;
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_SHORT = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function dteBetween(fromDate: string, toDate: string): number {
  const from = new Date(fromDate + 'T00:00:00Z');
  const to   = new Date(toDate   + 'T00:00:00Z');
  return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / 86400000));
}

function fmtDate(d: string) {
  const [y, m, day] = d.split('-');
  return `${parseInt(day)} ${MONTHS[parseInt(m) - 1]} ${y}`;
}

// ── Calendar component ──
function DateCalendar({
  available,
  selected,
  onSelect,
}: {
  available: Set<string>;
  selected: string;
  onSelect: (d: string) => void;
}) {
  // Start at the month of the most recent available date
  const lastAvailable = [...available].sort().pop() ?? new Date().toISOString().slice(0, 7) + '-01';
  const initialYM = lastAvailable.slice(0, 7);

  const [ym, setYm] = useState(initialYM);

  const [year, month] = ym.split('-').map(Number);

  function prevMonth() {
    const d = new Date(year, month - 2, 1);
    setYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  function nextMonth() {
    const d = new Date(year, month, 1);
    setYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }

  return (
    <div className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl p-3">
      {/* Month/year header */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="text-[#6b6b85] hover:text-[#f0c040] px-2 py-1 rounded transition-colors text-lg leading-none">‹</button>
        <span className="text-sm font-black text-[#e8e8f0]">{MONTHS[month - 1]} {year}</span>
        <button onClick={nextMonth} className="text-[#6b6b85] hover:text-[#f0c040] px-2 py-1 rounded transition-colors text-lg leading-none">›</button>
      </div>

      {/* Day-of-week labels */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAYS_SHORT.map(d => (
          <div key={d} className="text-center text-[9px] font-mono text-[#6b6b85] py-0.5">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} />;
          const hasData = available.has(date);
          const isSelected = date === selected;
          return (
            <button
              key={date}
              onClick={() => hasData && onSelect(date)}
              disabled={!hasData}
              title={hasData ? fmtDate(date) : 'No data'}
              className={`
                aspect-square rounded-lg text-xs font-bold transition-all flex items-center justify-center
                ${isSelected
                  ? 'bg-[#f0c040] text-black ring-2 ring-[#f0c040] ring-offset-1 ring-offset-[#0a0a0f]'
                  : hasData
                    ? 'bg-[#f0c040]/15 text-[#f0c040] hover:bg-[#f0c040]/30 cursor-pointer'
                    : 'text-[#2a2a3a] cursor-not-allowed'}
              `}
            >
              {parseInt(date.split('-')[2])}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-3 mt-3 text-[9px] font-mono text-[#6b6b85]">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#f0c040]/20 inline-block" />Data available</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#f0c040] inline-block" />Selected</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#1e1e2e] inline-block" />No data</span>
      </div>
    </div>
  );
}

// ── Accuracy calculation ──
function computeAccuracy(fc: IndexForecast, ohlc: IndexOHLC): {
  score: number;
  directionCorrect: boolean;
  inRange: boolean;
  directionLabel: string;
  rangeLabel: string;
} {
  const actualMove = ohlc.close - ohlc.open;
  let directionCorrect = false;
  if (fc.bias === 'BULLISH') directionCorrect = actualMove > 0;
  else if (fc.bias === 'BEARISH') directionCorrect = actualMove < 0;
  else directionCorrect = Math.abs(actualMove) < fc.dailyRange * 0.3;

  const lastPt = fc.points[fc.points.length - 1];
  const inRange = ohlc.close >= lastPt.low && ohlc.close <= lastPt.high;

  const halfRange = Math.max(1, (lastPt.high - lastPt.low) / 2);
  const dist = inRange ? Math.abs(ohlc.close - lastPt.central) : Math.abs(ohlc.close > lastPt.high ? ohlc.close - lastPt.high : lastPt.low - ohlc.close) + halfRange;
  const rangeScore = Math.max(0, Math.round(50 * (1 - dist / (halfRange * 3))));

  const directionScore = directionCorrect ? 50 : 0;
  const score = Math.min(100, directionScore + rangeScore);

  const directionLabel = directionCorrect
    ? `✅ Correct direction (predicted ${fc.bias}, market moved ${actualMove > 0 ? '▲' : '▼'} ${Math.abs(Math.round(actualMove))} pts)`
    : `❌ Wrong direction (predicted ${fc.bias}, market moved ${actualMove > 0 ? '▲ UP' : '▼ DOWN'} ${Math.abs(Math.round(actualMove))} pts)`;

  const rangeLabel = inRange
    ? `✅ Actual close ${ohlc.close.toLocaleString('en-IN')} was INSIDE predicted range (${lastPt.low.toLocaleString('en-IN')}–${lastPt.high.toLocaleString('en-IN')})`
    : `❌ Actual close ${ohlc.close.toLocaleString('en-IN')} was OUTSIDE predicted range by ${Math.round(ohlc.close > lastPt.high ? ohlc.close - lastPt.high : lastPt.low - ohlc.close)} pts`;

  return { score, directionCorrect, inRange, directionLabel, rangeLabel };
}

export default function Backtest() {
  const { profile } = useAuth();

  const [indexName, setIndexName] = useState('NIFTY50');
  const [btDate,    setBtDate]    = useState('');

  // Dates with option chain data (for expiry auto-selection)
  const [btDates,      setBtDates]      = useState<{ date: string; expiry: string }[]>([]);
  // Dates with OHLC data (for calendar highlights)
  const [ohlcDates,    setOhlcDates]    = useState<Set<string>>(new Set());
  const [loadingDates, setLoadingDates] = useState(false);

  const [running,     setRunning]     = useState(false);
  const [error,       setError]       = useState('');

  // Batch analysis
  const [batchRunning,  setBatchRunning]  = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchResults,  setBatchResults]  = useState<BatchResult[]>([]);
  const [batchDone,     setBatchDone]     = useState(false);

  const [forecast,    setForecast]    = useState<IndexForecast | null>(null);
  const [btOHLC,      setBtOHLC]      = useState<IndexOHLC | null>(null);
  const [btExpiry,    setBtExpiry]    = useState('');
  const [btSpotClose, setBtSpotClose] = useState(0);
  const [priorDates,  setPriorDates]  = useState<string[]>([]);

  // Load dates when index changes
  useEffect(() => {
    setLoadingDates(true);
    setBtDate(''); setForecast(null); setBtDates([]); setOhlcDates(new Set()); setBtOHLC(null);
    Promise.all([
      getBacktestDates(indexName).catch(() => [] as { date: string; expiry: string }[]),
      getOHLCDates(indexName).catch(() => [] as string[]),
    ]).then(([chainDates, ohlcDateList]) => {
      setBtDates(chainDates);
      setOhlcDates(new Set(ohlcDateList));
      // Default to most recent date that has BOTH chain data and OHLC
      const both = chainDates.filter(d => ohlcDateList.includes(d.date));
      if (both.length) setBtDate(both[both.length - 1].date);
      else if (chainDates.length) setBtDate(chainDates[chainDates.length - 1].date);
    }).finally(() => setLoadingDates(false));
  }, [indexName]);

  // Auto-run backtest when date changes (if OHLC available)
  useEffect(() => {
    if (!btDate) return;
    if (ohlcDates.has(btDate)) {
      runBacktest(btDate);
    } else {
      setForecast(null); setBtOHLC(null); setError('');
    }
  }, [btDate]);

  async function runBacktest(date: string) {
    const entry = btDates.find(d => d.date === date);
    if (!entry) { setError('No option chain data found for this date.'); return; }
    const expiry = entry.expiry;

    setRunning(true); setError(''); setForecast(null); setBtOHLC(null); setBtExpiry(expiry); setBtSpotClose(0);
    try {
      // Fetch OHLC for the selected date (provides the open price)
      const ohlc = await getIndexOHLC(indexName, date);
      if (!ohlc) {
        setError(`No OHLC data for ${fmtDate(date)}. Upload historical OHLC CSV from Admin Panel → Auto Fetch.`);
        return;
      }
      setBtOHLC(ohlc);

      // Fetch option chain rows BEFORE backtest date (what the model "knew")
      const rows = await getMarketDataBefore(indexName, expiry, date, 3);
      if (!rows.length) {
        setError(`No historical option chain data before ${fmtDate(date)}. Need at least 1 prior day.`);
        return;
      }

      const validRow      = [...rows].reverse().find(r => (r.spot_close ?? 0) > 0) ?? rows[rows.length - 1];
      const chainData     = rows[rows.length - 1].strike_data ?? {};
      const prevChainData = rows.length > 1 ? (rows[rows.length - 2].strike_data ?? {}) : {};
      const vix           = rows[rows.length - 1]?.vix ?? 0;
      const dte           = dteBetween(date, expiry);
      const historicals   = rows.map((r: any) => r.strike_data?._spot_close ?? 0).filter((c: number) => c > 0);

      // Real ATR from last 10 OHLC sessions (more accurate than VIX formula)
      const [recentOHLC, fiiActivity] = await Promise.all([
        getRecentOHLC(indexName, date, 10),
        getFIIActivity(date),
      ]);
      const atr = computeATR(recentOHLC);
      // Use actual previous-day close from index_ohlc when available — more accurate
      // than the spot_close recorded in the options chain data (which can lag by a day).
      const prevClose = recentOHLC.length > 0 ? recentOHLC[0].close
        : (validRow?.spot_close ?? validRow?.strike_data?._spot_close ?? 0);
      const spotClose = prevClose;

      setBtSpotClose(spotClose);
      setPriorDates(rows.map((r: any) => r.trade_date));

      const fc = computeIndexForecast(
        ohlc.open, spotClose, chainData, vix, indexName, dte, historicals, [], prevChainData,
        50, atr, fiiActivity?.fii_cm_net ?? 0, fiiActivity?.fii_idx_fut_net ?? 0,
      );
      setForecast(fc);
    } catch (e: any) {
      setError(e.message ?? 'Backtest failed — check connection and try again.');
    } finally {
      setRunning(false);
    }
  }

  // ── Batch backtest ──
  async function runBatchBacktest() {
    setBatchRunning(true); setBatchResults([]); setBatchDone(false); setBatchProgress(0);
    const tol = TOLERANCE[indexName] ?? 25;
    const eligible = btDates.filter(d => ohlcDates.has(d.date));
    const results: BatchResult[] = [];

    for (let i = 0; i < eligible.length; i++) {
      const entry = eligible[i];
      try {
        const ohlc = await getIndexOHLC(indexName, entry.date);
        if (!ohlc) continue;
        const rows = await getMarketDataBefore(indexName, entry.expiry, entry.date, 3);
        if (!rows.length) continue;

        const validRow      = [...rows].reverse().find((r: any) => (r.spot_close ?? 0) > 0) ?? rows[rows.length - 1];
        const chainData     = rows[rows.length - 1].strike_data ?? {};
        const prevChainData = rows.length > 1 ? (rows[rows.length - 2].strike_data ?? {}) : {};
        const vix           = rows[rows.length - 1]?.vix ?? 0;
        const dte           = dteBetween(entry.date, entry.expiry);
        const historicals   = rows.map((r: any) => r.strike_data?._spot_close ?? 0).filter((c: number) => c > 0);

        const [recentOHLC, fiiActivity] = await Promise.all([
          getRecentOHLC(indexName, entry.date, 10),
          getFIIActivity(entry.date),
        ]);
        const atr       = computeATR(recentOHLC);
        const prevClose = recentOHLC.length > 0 ? recentOHLC[0].close
          : (validRow?.spot_close ?? 0);
        const spotClose = prevClose;

        const fc = computeIndexForecast(
          ohlc.open, spotClose, chainData, vix, indexName, dte, historicals, [], prevChainData,
          50, atr, fiiActivity?.fii_cm_net ?? 0, fiiActivity?.fii_idx_fut_net ?? 0,
        );

        const predHigh  = fc.predictedHigh;
        const predLow   = fc.predictedLow;
        const predClose = fc.eodTarget;

        const diffH = Math.abs(predHigh - ohlc.high);
        const diffL = Math.abs(predLow  - ohlc.low);
        const diffC = Math.abs(predClose - ohlc.close);
        const passH = diffH <= tol, passL = diffL <= tol, passC = diffC <= tol;

        results.push({
          date: entry.date, predHigh, predLow, predClose,
          actualHigh: ohlc.high, actualLow: ohlc.low, actualClose: ohlc.close,
          diffH, diffL, diffC, passH, passL, passC,
          pass: passH && passL && passC, bias: fc.bias,
        });
      } catch (_) { /* skip */ }
      setBatchProgress(Math.round(((i + 1) / eligible.length) * 100));
    }

    setBatchResults(results); setBatchRunning(false); setBatchDone(true);
  }

  // ── SVG chart ──
  const SVG_W = 700, SVG_H = 360;
  const PAD_L = 80, PAD_R = 20, PAD_T = 30, PAD_B = 40;
  const chartW = SVG_W - PAD_L - PAD_R;
  const chartH = SVG_H - PAD_T - PAD_B;
  const TOTAL_MIN = 375;
  const xOf = (min: number) => PAD_L + (min / TOTAL_MIN) * chartW;

  let svgContent: JSX.Element | null = null;
  let accuracy: ReturnType<typeof computeAccuracy> | null = null;

  if (forecast && btOHLC) {
    const fc = forecast;
    const pathPrices = [...fc.points.map(p => p.high), ...fc.points.map(p => p.low), btOHLC.close, btOHLC.high, btOHLC.low];
    const pad = Math.max(fc.dailyRange * 0.15, 30);
    const priceMin = Math.min(...pathPrices) - pad;
    const priceMax = Math.max(...pathPrices) + pad;
    const priceRange = priceMax - priceMin || 1;
    const yOf = (p: number) => PAD_T + ((priceMax - p) / priceRange) * chartH;
    const pts = fc.points;
    const biasCol = fc.bias === 'BEARISH' ? '#ff4d6d' : fc.bias === 'BULLISH' ? '#39d98a' : '#f0c040';

    accuracy = computeAccuracy(fc, btOHLC);

    const topPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.minuteOffset).toFixed(1)},${yOf(p.high).toFixed(1)}`).join(' ');
    const botPath = [...pts].reverse().map(p => `L${xOf(p.minuteOffset).toFixed(1)},${yOf(p.low).toFixed(1)}`).join(' ');
    const centralPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.minuteOffset).toFixed(1)},${yOf(p.central).toFixed(1)}`).join(' ');
    const actualOpenY  = yOf(btOHLC.open);
    const actualCloseY = yOf(btOHLC.close);
    const actualHighY  = yOf(btOHLC.high);
    const actualLowY   = yOf(btOHLC.low);
    const actualColor  = btOHLC.close >= btOHLC.open ? '#39d98a' : '#ff4d6d';
    // Candlestick body rect (open→close) drawn at 3:30 PM x position
    const candleX    = xOf(TOTAL_MIN);
    const candleW    = 16;
    const bodyTop    = Math.min(actualOpenY, actualCloseY);
    const bodyHeight = Math.max(Math.abs(actualCloseY - actualOpenY), 2);

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
        {/* Predicted band */}
        <path d={`${topPath} ${botPath} Z`} fill={biasCol} fillOpacity="0.07" />
        {/* Predicted central path (dashed) */}
        <path d={centralPath} fill="none" stroke={biasCol} strokeWidth="2" strokeDasharray="8,4" strokeLinejoin="round" opacity="0.7" />

        {/* ── Actual OHLC ── */}
        {/* High horizontal line */}
        <line x1={PAD_L} y1={actualHighY} x2={SVG_W - PAD_R} y2={actualHighY} stroke="#39d98a" strokeWidth="1" strokeDasharray="4,3" opacity="0.55" />
        <text x={PAD_L + 4} y={actualHighY - 3} fontSize="8" fill="#39d98a" fontWeight="bold">H {btOHLC.high.toLocaleString('en-IN')}</text>
        {/* Low horizontal line */}
        <line x1={PAD_L} y1={actualLowY} x2={SVG_W - PAD_R} y2={actualLowY} stroke="#ff4d6d" strokeWidth="1" strokeDasharray="4,3" opacity="0.55" />
        <text x={PAD_L + 4} y={actualLowY + 11} fontSize="8" fill="#ff4d6d" fontWeight="bold">L {btOHLC.low.toLocaleString('en-IN')}</text>
        {/* Candlestick wick (low → high) at 3:30 PM */}
        <line x1={candleX} y1={actualHighY} x2={candleX} y2={actualLowY} stroke={actualColor} strokeWidth="1.5" opacity="0.5" />
        {/* Candlestick body (open → close) */}
        <rect x={candleX - candleW / 2} y={bodyTop} width={candleW} height={bodyHeight} fill={actualColor} opacity="0.25" rx="2" />
        <rect x={candleX - candleW / 2} y={bodyTop} width={candleW} height={bodyHeight} fill="none" stroke={actualColor} strokeWidth="1.5" rx="2" />
        {/* Open→close diagonal line */}
        <line x1={xOf(0)} y1={actualOpenY} x2={candleX} y2={actualCloseY} stroke={actualColor} strokeWidth="2" strokeDasharray="5,3" opacity="0.7" />
        {/* Open dot + label */}
        <circle cx={xOf(0)} cy={actualOpenY} r="5" fill="#0a0a0f" stroke={actualColor} strokeWidth="2" />
        <text x={xOf(0) + 7} y={actualOpenY - 6} fontSize="9" fill={actualColor} fontWeight="bold">O {btOHLC.open.toLocaleString('en-IN')}</text>
        {/* Close label next to candlestick */}
        <text x={candleX + candleW / 2 + 4} y={actualCloseY + 4} fontSize="9" fill={actualColor} fontWeight="bold">C {btOHLC.close.toLocaleString('en-IN')}</text>

        {/* Predicted checkpoints */}
        {pts.map(p => (
          <g key={p.timeLabel}>
            <circle cx={xOf(p.minuteOffset)} cy={yOf(p.central)} r="4" fill="#0a0a0f" stroke={biasCol} strokeWidth="1.5" opacity="0.8" />
            <text x={xOf(p.minuteOffset)} y={SVG_H - PAD_B + 14} textAnchor="middle" fontSize="9" fill="#6b6b85">{p.timeLabel.split(' ')[0]}</text>
          </g>
        ))}
        <line x1={PAD_L} y1={PAD_T + chartH} x2={SVG_W - PAD_R} y2={PAD_T + chartH} stroke="#1e1e2e" strokeWidth="1" />
      </svg>
    );
  } else if (forecast && !btOHLC) {
    // Show forecast only (no actual comparison)
    const fc = forecast;
    const pathPrices = [...fc.points.map(p => p.high), ...fc.points.map(p => p.low)];
    const pad = Math.max(fc.dailyRange * 0.15, 30);
    const priceMin = Math.min(...pathPrices) - pad;
    const priceMax = Math.max(...pathPrices) + pad;
    const priceRange = priceMax - priceMin || 1;
    const yOf = (p: number) => PAD_T + ((priceMax - p) / priceRange) * chartH;
    const biasCol = fc.bias === 'BEARISH' ? '#ff4d6d' : fc.bias === 'BULLISH' ? '#39d98a' : '#f0c040';
    const pts = fc.points;
    const topPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.minuteOffset).toFixed(1)},${yOf(p.high).toFixed(1)}`).join(' ');
    const botPath = [...pts].reverse().map(p => `L${xOf(p.minuteOffset).toFixed(1)},${yOf(p.low).toFixed(1)}`).join(' ');
    const centralPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.minuteOffset).toFixed(1)},${yOf(p.central).toFixed(1)}`).join(' ');
    svgContent = (
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full" style={{ maxHeight: 360 }}>
        {[0,0.25,0.5,0.75,1].map(f => {
          const p = priceMin + f * priceRange;
          const y = yOf(p);
          return <g key={f}><line x1={PAD_L} y1={y} x2={SVG_W-PAD_R} y2={y} stroke="#1e1e2e" strokeWidth="1"/><text x={PAD_L-5} y={y+4} textAnchor="end" fontSize="9" fill="#6b6b85">{Math.round(p).toLocaleString('en-IN')}</text></g>;
        })}
        <path d={`${topPath} ${botPath} Z`} fill={biasCol} fillOpacity="0.08"/>
        <path d={centralPath} fill="none" stroke={biasCol} strokeWidth="2.5" strokeLinejoin="round"/>
        {pts.map(p => <g key={p.timeLabel}><circle cx={xOf(p.minuteOffset)} cy={yOf(p.central)} r="5" fill="#0a0a0f" stroke={biasCol} strokeWidth="2"/><text x={xOf(p.minuteOffset)} y={SVG_H-PAD_B+14} textAnchor="middle" fontSize="9" fill="#6b6b85">{p.timeLabel.split(' ')[0]}</text><text x={xOf(p.minuteOffset)} y={yOf(p.central)-10} textAnchor="middle" fontSize="9" fill={biasCol} fontWeight="bold">{p.central.toLocaleString('en-IN')}</text></g>)}
        <line x1={PAD_L} y1={PAD_T+chartH} x2={SVG_W-PAD_R} y2={PAD_T+chartH} stroke="#1e1e2e" strokeWidth="1"/>
      </svg>
    );
  }

  const indexLabel = INDICES.find(i => i.key === indexName)?.label ?? indexName;

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
            Credits: <span className="text-[#f0c040] font-bold">{['pro','admin'].includes(profile?.role ?? '') ? '∞' : profile?.credits ?? 0}</span>
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
            Select any past trading date. We run the exact same prediction model using only data that existed before that date, then compare with what actually happened.
          </p>
        </div>

        {/* Index selector */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5">
          <label className="block text-[10px] font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Index</label>
          <div className="flex flex-wrap gap-2 mb-5">
            {INDICES.map(i => (
              <button
                key={i.key}
                onClick={() => setIndexName(i.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${indexName === i.key ? 'bg-[#f0c040] text-black' : 'border border-[#1e1e2e] text-[#6b6b85] hover:border-[#f0c040]/40'}`}
              >
                {i.label}
              </button>
            ))}
          </div>

          {loadingDates ? (
            <div className="text-xs font-mono text-[#6b6b85] py-8 text-center">⏳ Loading available dates...</div>
          ) : ohlcDates.size === 0 && btDates.length === 0 ? (
            <div className="bg-[#f0c040]/10 border border-[#f0c040]/30 rounded-xl px-4 py-4 text-xs font-mono text-[#f0c040] text-center">
              ⚠️ No data uploaded for {indexLabel} yet.<br/>
              <span className="opacity-70">Upload option chain CSV in Analysis, and OHLC CSV in Admin Panel.</span>
            </div>
          ) : (
            <>
              <label className="block text-[10px] font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                Select Date {loadingDates && '⏳'}
                {btDate && <span className="text-[#f0c040] ml-2 normal-case font-normal">— {fmtDate(btDate)}</span>}
              </label>
              <DateCalendar
                available={ohlcDates.size > 0 ? ohlcDates : new Set(btDates.map(d => d.date))}
                selected={btDate}
                onSelect={d => setBtDate(d)}
              />
              {ohlcDates.size === 0 && btDates.length > 0 && (
                <div className="mt-3 text-[10px] font-mono text-[#f0c040] bg-[#f0c040]/10 rounded-lg px-3 py-2">
                  ⚠️ OHLC data not uploaded yet. Calendar shows option chain dates. Select a date — you'll need to upload OHLC CSV from Admin Panel for accuracy comparison.
                </div>
              )}
            </>
          )}
        </div>

        {/* Loading */}
        {running && (
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl px-6 py-8 text-center">
            <div className="text-2xl mb-2">⏳</div>
            <div className="text-sm font-bold text-[#f0c040]">Running backtest for {fmtDate(btDate)}...</div>
            <div className="text-xs font-mono text-[#6b6b85] mt-1">Fetching historical data and computing prediction</div>
          </div>
        )}

        {/* Error */}
        {error && !running && (
          <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-xl px-4 py-3 text-xs font-mono text-[#ff4d6d]">
            {error}
          </div>
        )}

        {/* Results */}
        {forecast && !running && (() => {
          const fc = forecast;
          const biasCol = fc.bias === 'BEARISH' ? '#ff4d6d' : fc.bias === 'BULLISH' ? '#39d98a' : '#f0c040';

          return (
            <div className="space-y-4">

              {/* Accuracy score card */}
              {accuracy && (
                <div className={`rounded-2xl p-5 border ${accuracy.score >= 70 ? 'border-[#39d98a]/40 bg-[#39d98a]/5' : accuracy.score >= 40 ? 'border-[#f0c040]/40 bg-[#f0c040]/5' : 'border-[#ff4d6d]/40 bg-[#ff4d6d]/5'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest">Prediction Accuracy</div>
                    <div className={`text-3xl font-black ${accuracy.score >= 70 ? 'text-[#39d98a]' : accuracy.score >= 40 ? 'text-[#f0c040]' : 'text-[#ff4d6d]'}`}>
                      {accuracy.score}<span className="text-lg text-[#6b6b85]">/100</span>
                    </div>
                  </div>
                  <div className="w-full h-3 bg-[#16161f] rounded-full overflow-hidden mb-3">
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${accuracy.score}%`,
                      background: accuracy.score >= 70 ? '#39d98a' : accuracy.score >= 40 ? '#f0c040' : '#ff4d6d'
                    }} />
                  </div>
                  <div className="space-y-1.5 text-xs font-mono">
                    <div style={{ color: accuracy.directionCorrect ? '#39d98a' : '#ff4d6d' }}>{accuracy.directionLabel}</div>
                    <div style={{ color: accuracy.inRange ? '#39d98a' : '#ff4d6d' }}>{accuracy.rangeLabel}</div>
                  </div>
                  {btOHLC && (
                    <div className="mt-3 grid grid-cols-4 gap-2 text-[10px] font-mono">
                      {[
                        { l: 'Actual Open',  v: btOHLC.open,  c: '#4d9fff' },
                        { l: 'Actual High',  v: btOHLC.high,  c: '#39d98a' },
                        { l: 'Actual Low',   v: btOHLC.low,   c: '#ff4d6d' },
                        { l: 'Actual Close', v: btOHLC.close, c: btOHLC.close >= btOHLC.open ? '#39d98a' : '#ff4d6d' },
                      ].map(kl => (
                        <div key={kl.l} className="bg-[#16161f] rounded-lg p-2 text-center">
                          <div className="text-[#6b6b85] mb-0.5">{kl.l}</div>
                          <div className="font-bold" style={{ color: kl.c }}>{kl.v.toLocaleString('en-IN')}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* What data was used */}
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl px-4 py-3 text-xs font-mono text-[#6b6b85]">
                <span className="text-[#e8e8f0] font-bold">Data the model used (before {fmtDate(btDate)}):</span>{' '}
                {priorDates.map(fmtDate).join(', ')}
                {' '}· DTE: <span className="text-[#e8e8f0]">{fc.dte}d</span>
                {' '}· Expiry: <span className="text-[#a855f7]">{formatExpiryDisplay(btExpiry)}</span>
                {btSpotClose > 0 && <>{' '}· Prev close: <span className="text-[#f0c040]">{btSpotClose.toLocaleString('en-IN')}</span></>}
                {btOHLC && <>{' '}· Backtest open: <span className="text-[#4d9fff]">{btOHLC.open.toLocaleString('en-IN')}</span></>}
              </div>

              {/* Bias banner */}
              <div className={`rounded-xl px-4 py-4 text-xs font-mono font-bold border ${fc.bias === 'BEARISH' ? 'bg-[#ff4d6d]/10 border-[#ff4d6d]/30 text-[#ff4d6d]' : fc.bias === 'BULLISH' ? 'bg-[#39d98a]/10 border-[#39d98a]/30 text-[#39d98a]' : 'bg-[#f0c040]/10 border-[#f0c040]/30 text-[#f0c040]'}`}>
                <div className="text-sm mb-1">
                  {fc.bias === 'BEARISH' ? '📉 Model predicted: BEARISH' : fc.bias === 'BULLISH' ? '📈 Model predicted: BULLISH' : '↔ Model predicted: NEUTRAL'}
                </div>
                <div className="font-normal opacity-80 mb-1">{fc.summary}</div>
                <div className="text-[10px] opacity-70">
                  Conviction: <strong>{fc.convictionScore > 0 ? '+' : ''}{fc.convictionScore}</strong>
                  {fc.gapSignal !== 0 && <span> · Gap: <strong>{fc.gapSignal > 0 ? '+' : ''}{fc.gapSignal}</strong></span>}
                  {' '}· Max Pain gravity: <strong>{Math.round(fc.mpGravity * 100)}%</strong>
                </div>
              </div>

              {/* Chart */}
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-1 h-5 rounded block" style={{ background: biasCol }} />
                  <span className="text-sm font-black" style={{ color: biasCol }}>
                    {indexLabel} · {fmtDate(btDate)}
                  </span>
                </div>
                {btOHLC && (() => {
                  const col = btOHLC.close >= btOHLC.open ? '#39d98a' : '#ff4d6d';
                  return (
                    <div className="flex flex-wrap gap-3 text-[9px] font-mono text-[#6b6b85] mb-3 ml-3">
                      <span style={{ color: col }}>· · · Predicted path</span>
                      <span style={{ color: col }}>—— Actual Open→Close</span>
                      <span style={{ color: '#39d98a' }}>--- High</span>
                      <span style={{ color: '#ff4d6d' }}>--- Low</span>
                      <span style={{ color: col }}>▭ Actual candle (at close)</span>
                    </div>
                  );
                })()}
                <div className="bg-[#0a0a0f] rounded-xl p-2 overflow-x-auto mb-3">
                  {svgContent}
                </div>

                {/* Checkpoint table */}
                <div className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl overflow-hidden">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-[#1e1e2e]">
                        {['Time', 'Predicted Level', 'Predicted Range', btOHLC ? 'Actual' : ''].filter(Boolean).map(h => (
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
                          {btOHLC && i === fc.points.length - 1 && (
                            <td className="px-3 py-2 font-bold" style={{ color: btOHLC.close >= btOHLC.open ? '#39d98a' : '#ff4d6d' }}>
                              {btOHLC.close.toLocaleString('en-IN')} {accuracy?.inRange ? '✅' : '❌'}
                            </td>
                          )}
                          {btOHLC && i < fc.points.length - 1 && <td className="px-3 py-2 text-[#2a2a3a]">—</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="text-[10px] font-mono text-[#6b6b85] text-center pb-4">
                Model used only data available before {fmtDate(btDate)} — no future information was used. Past accuracy does not guarantee future results.
              </div>
            </div>
          );
        })()}

        {/* OHLC missing but forecast available note */}
        {forecast && !btOHLC && !running && !error && (
          <div className="bg-[#f0c040]/10 border border-[#f0c040]/30 rounded-xl px-4 py-3 text-xs font-mono text-[#f0c040]">
            ⚠️ Prediction generated but no OHLC data for {fmtDate(btDate)} — accuracy comparison not available. Upload historical OHLC CSV from Admin Panel.
          </div>
        )}

        {/* ── Batch Analysis ── */}
        {btDates.length > 0 && ohlcDates.size > 0 && (() => {
          const tol = TOLERANCE[indexName] ?? 25;
          const eligible = btDates.filter(d => ohlcDates.has(d.date)).length;
          const passCount = batchResults.filter(r => r.pass).length;
          const accPct = batchResults.length ? Math.round(passCount / batchResults.length * 100) : 0;
          const avgDiffH = batchResults.length ? Math.round(batchResults.reduce((s, r) => s + r.diffH, 0) / batchResults.length) : 0;
          const avgDiffL = batchResults.length ? Math.round(batchResults.reduce((s, r) => s + r.diffL, 0) / batchResults.length) : 0;
          const avgDiffC = batchResults.length ? Math.round(batchResults.reduce((s, r) => s + r.diffC, 0) / batchResults.length) : 0;

          return (
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-black">Batch Accuracy Analysis</h2>
                  <p className="text-[10px] font-mono text-[#6b6b85] mt-0.5">
                    {eligible} dates with both option chain + OHLC data · Tolerance ±{tol} pts
                  </p>
                </div>
                <button
                  onClick={runBatchBacktest}
                  disabled={batchRunning}
                  className="px-4 py-2 rounded-xl text-xs font-black bg-[#f0c040] text-black disabled:opacity-50 transition-opacity"
                >
                  {batchRunning ? `⏳ ${batchProgress}%` : '▶ Run Batch'}
                </button>
              </div>

              {batchRunning && (
                <div className="w-full h-2 bg-[#1e1e2e] rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-[#f0c040] rounded-full transition-all" style={{ width: `${batchProgress}%` }} />
                </div>
              )}

              {batchDone && batchResults.length > 0 && (
                <>
                  {/* Summary row */}
                  <div className={`rounded-xl p-4 mb-4 border ${accPct >= 70 ? 'border-[#39d98a]/40 bg-[#39d98a]/5' : accPct >= 40 ? 'border-[#f0c040]/40 bg-[#f0c040]/5' : 'border-[#ff4d6d]/40 bg-[#ff4d6d]/5'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono text-[#6b6b85] uppercase tracking-widest">Overall Accuracy (H+L+C all within ±{tol})</span>
                      <span className={`text-3xl font-black ${accPct >= 70 ? 'text-[#39d98a]' : accPct >= 40 ? 'text-[#f0c040]' : 'text-[#ff4d6d]'}`}>
                        {accPct}%
                      </span>
                    </div>
                    <div className="w-full h-3 bg-[#16161f] rounded-full overflow-hidden mb-3">
                      <div className="h-full rounded-full" style={{ width: `${accPct}%`, background: accPct >= 70 ? '#39d98a' : accPct >= 40 ? '#f0c040' : '#ff4d6d' }} />
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-[10px] font-mono">
                      {[
                        { l: 'Avg High Error', v: avgDiffH, pass: avgDiffH <= tol },
                        { l: 'Avg Low Error',  v: avgDiffL, pass: avgDiffL <= tol },
                        { l: 'Avg Close Error', v: avgDiffC, pass: avgDiffC <= tol },
                      ].map(({ l, v, pass }) => (
                        <div key={l} className="bg-[#16161f] rounded-lg p-2 text-center">
                          <div className="text-[#6b6b85] mb-0.5">{l}</div>
                          <div className="font-bold" style={{ color: pass ? '#39d98a' : '#ff4d6d' }}>±{v} pts</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-[10px] font-mono text-[#6b6b85]">
                      H: {batchResults.filter(r => r.passH).length}/{batchResults.length} accurate ·
                      L: {batchResults.filter(r => r.passL).length}/{batchResults.length} accurate ·
                      C: {batchResults.filter(r => r.passC).length}/{batchResults.length} accurate ·
                      All 3: {passCount}/{batchResults.length}
                    </div>
                  </div>

                  {/* Detail table */}
                  <div className="overflow-x-auto rounded-xl border border-[#1e1e2e]">
                    <table className="w-full text-[10px] font-mono">
                      <thead>
                        <tr className="border-b border-[#1e1e2e]">
                          {['Date','Bias','Pred H','Act H','ΔH','Pred L','Act L','ΔL','Pred C','Act C','ΔC','✓'].map(h => (
                            <th key={h} className={`px-2 py-2 text-[#6b6b85] uppercase font-normal text-[9px] ${h === '✓' ? 'text-center' : 'text-right'} first:text-left`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {batchResults.map(r => (
                          <tr key={r.date} className={`border-b border-[#1e1e2e] last:border-0 ${r.pass ? '' : 'bg-[#ff4d6d]/3'}`}>
                            <td className="px-2 py-1.5 text-[#e8e8f0] whitespace-nowrap">{fmtDate(r.date)}</td>
                            <td className={`px-2 py-1.5 text-right font-bold text-[8px] ${r.bias === 'BULLISH' ? 'text-[#39d98a]' : r.bias === 'BEARISH' ? 'text-[#ff4d6d]' : 'text-[#f0c040]'}`}>{r.bias.slice(0,4)}</td>
                            <td className="px-2 py-1.5 text-right text-[#39d98a]">{r.predHigh.toLocaleString('en-IN')}</td>
                            <td className="px-2 py-1.5 text-right text-[#e8e8f0]">{r.actualHigh.toLocaleString('en-IN')}</td>
                            <td className={`px-2 py-1.5 text-right font-bold ${r.passH ? 'text-[#39d98a]' : 'text-[#ff4d6d]'}`}>±{Math.round(r.diffH)}</td>
                            <td className="px-2 py-1.5 text-right text-[#ff4d6d]">{r.predLow.toLocaleString('en-IN')}</td>
                            <td className="px-2 py-1.5 text-right text-[#e8e8f0]">{r.actualLow.toLocaleString('en-IN')}</td>
                            <td className={`px-2 py-1.5 text-right font-bold ${r.passL ? 'text-[#39d98a]' : 'text-[#ff4d6d]'}`}>±{Math.round(r.diffL)}</td>
                            <td className="px-2 py-1.5 text-right text-[#f0c040]">{r.predClose.toLocaleString('en-IN')}</td>
                            <td className="px-2 py-1.5 text-right text-[#e8e8f0]">{r.actualClose.toLocaleString('en-IN')}</td>
                            <td className={`px-2 py-1.5 text-right font-bold ${r.passC ? 'text-[#39d98a]' : 'text-[#ff4d6d]'}`}>±{Math.round(r.diffC)}</td>
                            <td className="px-2 py-1.5 text-center">{r.pass ? '✅' : '❌'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {batchDone && batchResults.length === 0 && (
                <div className="text-xs font-mono text-[#6b6b85] py-4 text-center">
                  No dates found with both option chain data and OHLC data.
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
