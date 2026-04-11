import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function StockAnalysis() {
  const { profile } = useAuth();
  const role = profile?.role ?? 'free';
  const isAdmin = role === 'admin';

  const [stockName, setStockName] = useState('');
  const [csvData, setCsvData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'upload' | 'result'>('upload');
  const [sector, setSector] = useState('Default');

  // Fundamental data
  const [pe, setPe] = useState('');
  const [eps, setEps] = useState('');
  const [bookValue, setBookValue] = useState('');
  const [roce, setRoce] = useState('');
  const [rev1, setRev1] = useState('');
  const [rev2, setRev2] = useState('');
  const [rev3, setRev3] = useState('');
  const [profit1, setProfit1] = useState('');
  const [profit2, setProfit2] = useState('');
  const [profit3, setProfit3] = useState('');

  const sectorPE: Record<string, number> = {
    'Energy/Oil': 18, 'Banking': 20, 'IT': 28,
    'Defence/PSU': 30, 'FMCG': 50, 'Pharma': 35,
    'Auto': 25, 'Conglomerate': 22, 'Default': 25
  };

  const canAccess = ['premium', 'pro', 'admin'].includes(role);

  async function handleCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

    const rows = lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const row: any = {};
      headers.forEach((h, i) => { row[h] = vals[i]; });
      return row;
    }).filter(r => r.DATE && r.CLOSE);

    // Extract last trading day of each month
    const monthly: Record<string, any> = {};
    rows.forEach(row => {
      const date = row.DATE;
      const [day, mon, year] = date.split('-');
      const key = `${year}-${mon}`;
      if (!monthly[key] || new Date(date) > new Date(monthly[key].DATE)) {
        monthly[key] = row;
      }
    });

    const monthlyData = Object.values(monthly)
      .slice(-12)
      .map((r: any) => ({
        date: r.DATE,
        high: parseFloat(r.HIGH?.replace(/,/g, '') || '0'),
        low: parseFloat(r.LOW?.replace(/,/g, '') || '0'),
        close: parseFloat(r.CLOSE?.replace(/,/g, '') || '0'),
        volume: parseFloat(r.VOLUME?.replace(/,/g, '') || '0'),
      }))
      .filter(r => r.high > 0 && r.volume > 0);

    setCsvData(monthlyData);
  }

  function runGCT() {
    if (csvData.length < 6) {
      setError('Need at least 6 months of data!');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // GCT Calculations
      const data = csvData;
      const totalVol = data.reduce((s, d) => s + d.volume, 0);

      // Typical Price
      const tp = data.map(d => (d.high + d.low + d.close) / 3);

      // MGC — Monthly Gravitational Core
      const mgc = data.reduce((s, d, i) => s + tp[i] * d.volume, 0) / totalVol;

      // VWAR — Volume Weighted Average Range
      const vwar = data.reduce((s, d) => s + (d.high - d.low) * d.volume, 0) / totalVol;

      // MCL — Monthly Commitment Line
      const mcl = data.reduce((s, d) => s + d.close * d.volume, 0) / totalVol;

      // Key Levels
      const al = mgc + vwar;
      const cl = mgc - vwar;

      // VMS — Volumetric Momentum Skew
      const vms = data.map(d => {
        const range = d.high - d.low;
        return range === 0 ? 0.5 : (d.close - d.low) / range;
      });
      const avgVms = vms.reduce((s, v) => s + v, 0) / vms.length;

      // Crash levels
      const crashLevels = [1, 2, 3, 4, 5].map(n => ({
        level: n,
        price: Math.round(mgc - vwar * n),
        label: ['Fear starts', 'Everyone scared', 'Panic/Blood on streets', 'Major crash', 'Black swan'][n - 1],
        allocation: [20, 30, 30, 15, 5][n - 1],
        emoji: ['🟡', '🟠', '🔴', '💀', '☠️'][n - 1]
      }));

      const currentPrice = data[data.length - 1].close;

      // Determine zone
      const zone = currentPrice >= al ? 'BUY ZONE' :
        currentPrice >= mgc ? 'WATCH ZONE' :
          currentPrice >= cl ? 'DANGER ZONE' : 'CRASH ZONE';

      const currentCrashLevel = crashLevels.find(c =>
        currentPrice >= c.price && currentPrice < (crashLevels[c.level - 2]?.price ?? Infinity)
      );

      // FSS Calculations
      const peVal = parseFloat(pe);
      const epsVal = parseFloat(eps);
      const bvVal = parseFloat(bookValue);
      const roceVal = parseFloat(roce);
      const benchmarkPE = sectorPE[sector] || 25;

      const fssChecks = [];

      if (peVal && epsVal) {
        const peAtLevel = currentPrice / epsVal;
        fssChecks.push({
          name: 'PE Ratio',
          pass: peAtLevel < benchmarkPE,
          value: `${peAtLevel.toFixed(1)} vs benchmark ${benchmarkPE}`
        });
      }

      if (bvVal) {
        const pbAtLevel = currentPrice / bvVal;
        fssChecks.push({
          name: 'PB Ratio',
          pass: pbAtLevel < 2.5,
          value: `PB = ${pbAtLevel.toFixed(2)}`
        });
      }

      if (rev2 && rev3) {
        const r2 = parseFloat(rev2);
        const r3 = parseFloat(rev3);
        fssChecks.push({
          name: 'Revenue Growth',
          pass: r3 > r2,
          value: r3 > r2 ? `+${((r3 - r2) / r2 * 100).toFixed(1)}% growth` : 'Declining'
        });
      }

      if (profit2 && profit3) {
        const p2 = parseFloat(profit2);
        const p3 = parseFloat(profit3);
        fssChecks.push({
          name: 'Profit Growth',
          pass: p3 > p2,
          value: p3 > p2 ? `+${((p3 - p2) / p2 * 100).toFixed(1)}% growth` : 'Declining'
        });
      }

      if (roceVal) {
        fssChecks.push({
          name: 'ROCE',
          pass: roceVal >= 8,
          value: `${roceVal}%`
        });
      }

      const fssScore = fssChecks.filter(c => c.pass).length;
      const fssVerdict = fssScore === 5 ? '🟢 STRONG BUY' :
        fssScore === 4 ? '✅ GOOD BUY' :
          fssScore === 3 ? '⚡ DECENT BUY' :
            fssScore === 2 ? '⚠️ CAREFUL' :
              fssScore === 1 ? '🔴 RISKY' : '💀 VALUE TRAP';

      setResult({
        stockName,
        currentPrice: Math.round(currentPrice),
        mgc: Math.round(mgc),
        vwar: Math.round(vwar),
        mcl: Math.round(mcl),
        al: Math.round(al),
        cl: Math.round(cl),
        avgVms: avgVms.toFixed(2),
        zone,
        crashLevels,
        currentCrashLevel,
        fssChecks,
        fssScore,
        fssVerdict,
        dataMonths: data.length,
        firstDate: data[0].date,
        lastDate: data[data.length - 1].date
      });

      setStep('result');
    } catch (err: any) {
      setError(err.message || 'Analysis failed!');
    } finally {
      setLoading(false);
    }
  }

  const zoneColor = (zone: string) => {
    if (zone === 'BUY ZONE') return '#39d98a';
    if (zone === 'WATCH ZONE') return '#f0c040';
    if (zone === 'DANGER ZONE') return '#ff8c42';
    return '#ff4d6d';
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#1e1e2e]">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#f0c040] rounded-xl flex items-center justify-center text-lg">⚛</div>
          <div className="font-bold text-base">God Particle</div>
        </Link>
        <Link to="/dashboard" className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040]">← Dashboard</Link>
      </nav>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="text-2xl">🏢</div>
            <h1 className="text-2xl font-black">Stock Analysis</h1>
            <span className="text-xs font-bold px-2 py-1 rounded-full bg-[#4d9fff]/10 text-[#4d9fff] border border-[#4d9fff]/20">
              GCT + FSS
            </span>
          </div>
          <p className="text-xs font-mono text-[#6b6b85]">
            Gravitational Cost Theory — identifies exact buy levels during market crashes using 12 months of data.
          </p>
        </div>

        {/* Access Check */}
        {!canAccess && (
          <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-2xl p-6 mb-6 text-center">
            <div className="text-3xl mb-3">🔒</div>
            <div className="text-sm font-bold mb-2">Premium Feature</div>
            <div className="text-xs font-mono text-[#6b6b85] mb-4">
              Stock analysis is available for Premium and above customers.
            </div>
            <Link to="/pricing" className="inline-block bg-[#f0c040] text-black font-black px-6 py-2.5 rounded-xl text-sm">
              Upgrade Now →
            </Link>
          </div>
        )}

        {canAccess && step === 'upload' && (
          <div className="space-y-6">
            {/* Step 1 — CSV Upload */}
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
              <h2 className="text-sm font-black uppercase tracking-widest text-[#6b6b85] mb-4">
                Step 1 — Upload Stock Data
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Stock Name</label>
                  <input type="text" value={stockName}
                    onChange={e => setStockName(e.target.value.toUpperCase())}
                    placeholder="e.g. RELIANCE, SBI, TCS"
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Sector</label>
                  <select value={sector} onChange={e => setSector(e.target.value)}
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]">
                    {Object.keys(sectorPE).map(s => (
                      <option key={s} value={s}>{s} (PE benchmark: {sectorPE[s]})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-[#16161f] border border-[#1e1e2e] rounded-xl p-4 mb-4 text-xs font-mono text-[#6b6b85]">
                <div className="font-bold text-[#f0c040] mb-2">📥 How to get the CSV:</div>
                <div>1. Go to nseindia.com</div>
                <div>2. Search for the stock (e.g. RELIANCE)</div>
                <div>3. Click Historical Data</div>
                <div>4. Set date range to last 12-14 months</div>
                <div>5. Download CSV and upload below</div>
              </div>

              <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer transition-all ${csvData.length > 0 ? 'border-[#39d98a]/50' : 'border-[#1e1e2e] hover:border-[#f0c040]'}`}>
                <input type="file" accept=".csv" className="hidden" onChange={handleCSV} />
                <div className="text-3xl mb-2">{csvData.length > 0 ? '✅' : '📄'}</div>
                <div className="text-sm font-mono text-[#6b6b85]">
                  {csvData.length > 0
                    ? `✅ ${csvData.length} months loaded — ${csvData[0]?.date} to ${csvData[csvData.length - 1]?.date}`
                    : 'Click to upload NSE Historical Data CSV'}
                </div>
              </label>
            </div>

            {/* Step 2 — Fundamental Data */}
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
              <h2 className="text-sm font-black uppercase tracking-widest text-[#6b6b85] mb-1">
                Step 2 — Fundamental Data
              </h2>
              <div className="text-xs font-mono text-[#6b6b85] mb-4">
                Optional but recommended. Enter manually from screener.in or moneycontrol.com
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: 'PE Ratio', val: pe, set: setPe, placeholder: 'e.g. 22.5' },
                  { label: 'EPS (TTM)', val: eps, set: setEps, placeholder: 'e.g. 65.4' },
                  { label: 'Book Value/share', val: bookValue, set: setBookValue, placeholder: 'e.g. 450' },
                  { label: 'ROCE %', val: roce, set: setRoce, placeholder: 'e.g. 15.2' },
                  { label: 'Revenue Y1 (oldest)', val: rev1, set: setRev1, placeholder: 'Cr e.g. 85000' },
                  { label: 'Revenue Y2', val: rev2, set: setRev2, placeholder: 'Cr e.g. 92000' },
                  { label: 'Revenue Y3 (latest)', val: rev3, set: setRev3, placeholder: 'Cr e.g. 98000' },
                  { label: 'Net Profit Y1', val: profit1, set: setProfit1, placeholder: 'Cr e.g. 12000' },
                  { label: 'Net Profit Y2', val: profit2, set: setProfit2, placeholder: 'Cr e.g. 14000' },
                  { label: 'Net Profit Y3 (latest)', val: profit3, set: setProfit3, placeholder: 'Cr e.g. 16000' },
                ].map((f, i) => (
                  <div key={i}>
                    <label className="block text-xs font-mono text-[#6b6b85] mb-1">{f.label}</label>
                    <input type="number" value={f.val} onChange={e => f.set(e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-xs font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]" />
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-lg px-4 py-2 text-xs font-mono text-[#ff4d6d]">
                {error}
              </div>
            )}

            <button onClick={runGCT} disabled={loading || csvData.length < 6 || !stockName}
              className="w-full bg-[#f0c040] text-black font-black py-3 rounded-xl text-sm hover:bg-[#ffd060] transition-all disabled:opacity-40">
              {loading ? '⏳ Analysing...' : '🏢 Run GCT + FSS Analysis'}
            </button>
          </div>
        )}

        {/* RESULTS */}
        {canAccess && step === 'result' && result && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black">
                <span className="text-[#f0c040]">{result.stockName}</span> Analysis
              </h2>
              <button onClick={() => { setStep('upload'); setResult(null); }}
                className="px-4 py-2 text-xs font-bold border border-[#1e1e2e] rounded-lg hover:border-[#f0c040] transition-all">
                ← New Analysis
              </button>
            </div>

            {/* Current Zone Card */}
            <div className="rounded-2xl p-6 text-center"
              style={{
                background: `linear-gradient(135deg, #0a0a0f, ${zoneColor(result.zone)}15)`,
                border: `1px solid ${zoneColor(result.zone)}40`
              }}>
              <div className="text-xs font-mono tracking-widest mb-2" style={{ color: zoneColor(result.zone) }}>
                ⚛ GRAVITATIONAL COST THEORY
              </div>
              <div className="text-3xl font-black mb-1">{result.stockName}</div>
              <div className="text-2xl font-black mb-3" style={{ color: zoneColor(result.zone) }}>
                ₹{result.currentPrice.toLocaleString()}
              </div>
              <div className="inline-block px-6 py-2 rounded-full font-black text-sm mb-2"
                style={{ background: `${zoneColor(result.zone)}20`, color: zoneColor(result.zone), border: `1px solid ${zoneColor(result.zone)}40` }}>
                {result.zone}
              </div>
              <div className="text-xs font-mono text-[#6b6b85] mt-2">
                {result.dataMonths} months · {result.firstDate} to {result.lastDate}
              </div>
            </div>

            {/* 4 Key Levels */}
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
              <div className="text-sm font-black mb-4 text-[#f0c040]">📊 4 Key Technical Levels</div>
              <div className="space-y-3">
                {[
                  { label: '🟢 AL — Ascension Line', price: result.al, desc: 'BUY zone starts here', color: '#39d98a' },
                  { label: '⚪ MGC — Soul of the Stock', price: result.mgc, desc: 'Gravitational centre', color: '#4d9fff' },
                  { label: '🔵 MCL — Commitment Line', price: result.mcl, desc: 'Where institutions averaged', color: '#a78bfa' },
                  { label: '🔴 CL — Collapse Line', price: result.cl, desc: 'Danger zone starts here', color: '#ff4d6d' },
                ].map((level, i) => {
                  const isCurrent = result.currentPrice >= (i < 3 ? level.price : 0) &&
                    result.currentPrice < ([result.al * 999, result.al, result.mgc, result.mcl][i]);
                  return (
                    <div key={i} className={`flex items-center justify-between p-3 rounded-xl ${isCurrent ? 'ring-2' : ''}`}
                      style={{
                        background: `${level.color}10`,
                        border: `1px solid ${level.color}30`,
                        ringColor: level.color
                      }}>
                      <div>
                        <div className="text-xs font-bold" style={{ color: level.color }}>{level.label}</div>
                        <div className="text-xs font-mono text-[#6b6b85]">{level.desc}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-black" style={{ color: level.color }}>
                          ₹{level.price.toLocaleString()}
                        </div>
                        {isCurrent && <div className="text-[10px] font-bold text-[#f0c040]">← YOU ARE HERE</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 text-xs font-mono text-[#6b6b85] text-center">
                VWAR (Monthly Range): ₹{result.vwar.toLocaleString()} ·
                VMS (Momentum): {result.avgVms} {parseFloat(result.avgVms) > 0.6 ? '🟢 Buyers strong' : parseFloat(result.avgVms) < 0.4 ? '🔴 Sellers dominant' : '🟡 Balanced'}
              </div>
            </div>

            {/* Crash Buying Map */}
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
              <div className="text-sm font-black mb-4 text-[#f0c040]">💥 Crash Buying Map</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead><tr className="border-b border-[#1e1e2e]">
                    {['Level', 'Price', 'Market Mood', 'Allocation'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-[#6b6b85] uppercase tracking-widest font-normal">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {result.crashLevels.map((cl: any, i: number) => {
                      const isCurrent = result.currentPrice <= cl.price &&
                        (i === 0 || result.currentPrice > result.crashLevels[i - 1].price);
                      return (
                        <tr key={i} className={`border-b border-[#1e1e2e]/50 ${isCurrent ? 'bg-[#f0c040]/10' : ''}`}>
                          <td className="px-3 py-3 font-bold">{cl.emoji} L{cl.level}</td>
                          <td className="px-3 py-3 font-black text-[#f0c040]">
                            ₹{cl.price.toLocaleString()}
                            {isCurrent && <span className="ml-2 text-[#f0c040] text-[10px]">← HERE</span>}
                          </td>
                          <td className="px-3 py-3 text-[#6b6b85]">{cl.label}</td>
                          <td className="px-3 py-3 text-[#39d98a] font-bold">{cl.allocation}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* FSS Score */}
            {result.fssChecks.length > 0 && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
                <div className="text-sm font-black mb-4 text-[#f0c040]">🔬 Fundamental Safety Score</div>
                <div className="space-y-2 mb-4">
                  {result.fssChecks.map((check: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-[#16161f]">
                      <span className="text-xs font-mono text-[#e8e8f0]">{check.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-[#6b6b85]">{check.value}</span>
                        <span className={check.pass ? 'text-[#39d98a]' : 'text-[#ff4d6d]'}>
                          {check.pass ? '✅' : '❌'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-center p-4 rounded-xl bg-[#16161f]">
                  <div className="text-xs font-mono text-[#6b6b85] mb-1">FSS SCORE</div>
                  <div className="text-3xl font-black text-[#f0c040] mb-1">{result.fssScore}/5</div>
                  <div className="text-sm font-bold">{result.fssVerdict}</div>
                </div>
              </div>
            )}

            {/* One Line Verdict */}
            <div className="bg-gradient-to-r from-[#f0c040]/10 to-transparent border border-[#f0c040]/30 rounded-2xl p-6">
              <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">⚛ God Particle Verdict</div>
              <div className="text-sm font-bold leading-relaxed">
                {result.zone === 'BUY ZONE'
                  ? `${result.stockName}: Strong zone — stock above AL ₹${result.al.toLocaleString()}. Safe to accumulate. Institutions are profitable.`
                  : result.zone === 'CRASH ZONE'
                    ? `${result.stockName}: In crash zone — accumulate in parts between ₹${result.currentPrice.toLocaleString()} and ₹${result.crashLevels[result.crashLevels.length - 1].price.toLocaleString()}. First target: MGC ₹${result.mgc.toLocaleString()}.`
                    : result.zone === 'DANGER ZONE'
                      ? `${result.stockName}: Below soul price. Risky. Wait for MGC ₹${result.mgc.toLocaleString()} support or crash level entry.`
                      : `${result.stockName}: Between MGC and AL. Watch for breakout above AL ₹${result.al.toLocaleString()} for confirmed buy.`
                }
              </div>
              <div className="mt-3 text-xs font-mono text-[#6b6b85]">Not Financial Advice · God Particle ⚛</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
