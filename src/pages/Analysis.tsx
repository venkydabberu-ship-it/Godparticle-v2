import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { callEdge } from '../lib/supabase';
import {
  getMarketData, getAvailableExpiries, getAvailableDates,
  parseNSEOptionChain, uploadMarketData, computeGodParticle,
  saveAnalysis, generateScenarioMatrix, normalizeIndexName,
  normalizeExpiry, formatExpiryDisplay, getDTE,
  getGapStep, getMaxGap, INDEX_DISPLAY, useCredits,
  generateIndexForecast, getLatestChainData, SECTOR_INDEX_MAP,
  type IndexForecast, bsPrice,
} from '../lib/market';

const INDICES = [
  { key: 'NIFTY50', label: 'Nifty 50', exchange: 'NSE' },
  { key: 'SENSEX', label: 'Sensex', exchange: 'BSE' },
  { key: 'BANKNIFTY', label: 'Bank Nifty', exchange: 'NSE' },
  { key: 'FINNIFTY', label: 'Fin Nifty', exchange: 'NSE' },
  { key: 'MIDCAPNIFTY', label: 'Midcap Nifty', exchange: 'NSE' },
  { key: 'NIFTYNEXT50', label: 'Nifty Next 50', exchange: 'NSE' },
  { key: 'BANKEX', label: 'Bankex', exchange: 'BSE' },
];

export default function Analysis() {
  const { user, profile, refreshProfile } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  // Upload section
  const [uploadIndex, setUploadIndex] = useState('NIFTY50');
  const [uploadExpiry, setUploadExpiry] = useState('');
  const [uploadDate, setUploadDate] = useState(new Date().toISOString().split('T')[0]);
  const [uploadSpot, setUploadSpot] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [uploadTab, setUploadTab] = useState<'index' | 'stock'>('index');

  // Analysis section
  const [indexName, setIndexName] = useState('NIFTY50');
  const [expiry, setExpiry] = useState('');
  const [strike, setStrike] = useState('');
  const [optType, setOptType] = useState('CE');
  const [availableExpiries, setAvailableExpiries] = useState<string[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [loadingExpiries, setLoadingExpiries] = useState(false);

  // Result
  const [analysing, setAnalysing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('raw');
  const [planBGap, setPlanBGap] = useState(0);
  const [forecastOpen, setForecastOpen] = useState('');
  const [forecast, setForecast] = useState<IndexForecast | null>(null);
  const [fiiDate, setFiiDate] = useState<string | null>(null);
  const [chainData, setChainData] = useState<Record<string, any>>({});
  const [rowsData, setRowsData] = useState<any[]>([]);
  const [gctAiInsight, setGctAiInsight] = useState('');
  const [gctAiLoading, setGctAiLoading] = useState(false);
  const [gctAiError, setGctAiError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [forecastError, setForecastError] = useState('');

  const location = useLocation();

  useEffect(() => {
    const prefill = (location.state as any)?.prefill;
    if (prefill?.symbol) {
      setUploadTab('stock');
      setUploadIndex(prefill.symbol.toUpperCase());
    }
  }, []);
  useEffect(() => {
    const replay = (location.state as any)?.replay;
    if (!replay?.result) return;
    setIndexName(replay.index_name || 'NIFTY50');
    setExpiry(replay.expiry || '');
    setStrike(String(replay.strike || ''));
    setOptType(replay.option_type || 'CE');
    setResult(replay.result);
    setScenarios(generateScenarioMatrix(replay.result, replay.index_name || 'NIFTY50'));
    setActiveTab('verdict');
  }, []);

  // Load expiries when index changes
  useEffect(() => {
    if (!indexName) return;
    setLoadingExpiries(true);
    setExpiry('');
    setAvailableDates([]);
    getAvailableExpiries(indexName)
      .then(e => setAvailableExpiries(e))
      .catch(() => setAvailableExpiries([]))
      .finally(() => setLoadingExpiries(false));
  }, [indexName, refreshKey]);

  // Load dates when expiry changes
  useEffect(() => {
    if (!expiry || !indexName) return;
    getAvailableDates(indexName, expiry)
      .then(d => setAvailableDates(d))
      .catch(() => setAvailableDates([]));
  }, [expiry, indexName, refreshKey]);

  const canUpload = (idx: string) => {
    if (!profile) return false;
    const role = profile.role;
    if (role === 'admin') return true;
    if (idx === 'NIFTY50') return false;
    if (idx === 'SENSEX') return ['basic', 'premium', 'pro'].includes(role);
    return ['premium', 'pro'].includes(role);
  };

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!uploadExpiry) { setUploadMsg('⚠️ Select expiry date first!'); return; }
    if (!canUpload(uploadIndex)) { setUploadMsg('⚠️ Upgrade plan to upload this index data!'); return; }
    setUploading(true); setUploadMsg('');
    try {
      const text = await file.text();
      const parsed = parseNSEOptionChain(text);
      const count = Object.keys(parsed).length;
      if (!count) { setUploadMsg('❌ No valid data found in CSV!'); return; }
      // Manual override takes priority over auto-detected spot from CSV header
      if (uploadSpot && parseFloat(uploadSpot) > 0) {
        parsed['_spot_close'] = parseFloat(uploadSpot);
      }
      await uploadMarketData(uploadIndex, uploadExpiry, uploadDate, parsed, user.id);
      setUploadMsg(`✅ Saved ${count} strikes — ${uploadIndex} | ${formatExpiryDisplay(uploadExpiry)} | ${uploadDate}`);
      // Refresh expiries
      const updated = await getAvailableExpiries(indexName);
      setAvailableExpiries(updated);
    } catch (err: any) {
      setUploadMsg(`❌ ${err.message}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleAnalyse() {
    if (!user || !profile) return;
    if (!strike) { setError('Enter a strike price!'); return; }
    if (!expiry) { setError('Select an expiry!'); return; }
    if (!['pro', 'admin'].includes(profile.role) && (profile.credits ?? 0) < 2) {
      setError('Not enough credits! Buy more to continue.'); return;
    }

    setAnalysing(true); setError(''); setResult(null);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out — please try again.')), 25000)
    );
    try {
      // Fetch from unified data bank
      const rows = await Promise.race([getMarketData(indexName, expiry, 6), timeout]);
      if (!rows || rows.length === 0) {
        setError(`No data found for ${INDEX_DISPLAY[indexName] || indexName} | ${formatExpiryDisplay(expiry)}. Auto-fetch from Admin Panel or upload CSV first!`);
        return;
      }

      const strikeNum = parseFloat(strike);
      const data = rows.map((r: any) => {
        const sd = r.strike_data?.[strikeNum];
        if (!sd) return null;
        const isCE = optType === 'CE';
        return {
          date: r.trade_date,
          close: isCE ? sd.ce_ltp : sd.pe_ltp,
          volume: isCE ? sd.ce_vol : sd.pe_vol,
          oi: isCE ? sd.ce_oi : sd.pe_oi,
          chng_oi: isCE ? (sd.ce_coi ?? sd.ce_chng_oi ?? 0) : (sd.pe_coi ?? sd.pe_chng_oi ?? 0),
          iv: isCE ? (sd.ce_iv ?? 0) : (sd.pe_iv ?? 0),
          spot_close: r.strike_data?.['_spot_close'] ?? 0,
        };
      }).filter(Boolean).filter((d: any) => d.close > 0 || d.oi > 0);

      if (data.length < 2) {
        setError(`Only ${data.length} day(s) of data for ${strike} ${optType}. Need at least 2 days. Keep running Auto Fetch daily!`);
        return;
      }

      // Deduct credits
      if (!['pro', 'admin'].includes(profile.role)) {
        await useCredits(user.id, 2);
        await refreshProfile();
      }

      const computed = computeGodParticle(data, strikeNum, optType, expiry);
      const matrix = generateScenarioMatrix(computed, indexName, rows[0]?.strike_data);
      await saveAnalysis(user.id, indexName, strikeNum, optType, expiry, computed);

      setRowsData(rows);
      setResult(computed);
      setScenarios(matrix);
      setChainData(rows[rows.length - 1]?.strike_data ?? {});
      setForecast(null);
      setForecastOpen('');
      setActiveTab('verdict');
    } catch (err: any) {
      setError(err.message || 'Analysis failed!');
    } finally {
      setAnalysing(false);
    }
  }

  const isAdmin = profile?.role === 'admin';

  async function fetchGCTAIInsight() {
    if (!result) return;
    setGctAiLoading(true);
    setGctAiError('');
    try {
      const data = await callEdge('ai-insight', {
        type: 'stock_gct',
        data: {
          symbol: indexName,
          recommendation: result.recommendation,
          conviction: result.conviction,
          bias: result.bias,
          pcb: result.pcb,
          vwap: result.vwap,
          oiwap: result.oiwap,
          lc: result.lc,
          signals: result.signals,
        },
      });
      setGctAiInsight(data.insight);
    } catch (err: any) {
      setGctAiError(err.message || 'AI insight failed');
    } finally {
      setGctAiLoading(false);
    }
  }

  function computeReversalRisk() {
    if (!rowsData.length || !result) return null;
    const sd = rowsData[0]?.strike_data || {};
    const spots = rowsData.map((r: any) => r.strike_data?._spot_close || 0).filter((s: number) => s > 0);
    const currentSpot = spots[0] || 0;
    if (!currentSpot) return null;
    const maxSpot = Math.max(...spots), minSpot = Math.min(...spots);
    const rangePct = minSpot > 0 ? ((maxSpot - minSpot) / minSpot) * 100 : 0;
    const mktType = rangePct < 1.5 ? 'RANGE_BOUND' : rangePct < 3.5 ? 'SIDEWAYS' : 'TRENDING';
    let totalCE = 0, totalPE = 0, maxCEOI = 0, maxPEOI = 0, resistance = 0, support = 0;
    let cheapPE = { strike: 0, ltp: 0 }, cheapCE = { strike: 0, ltp: 0 };
    Object.keys(sd).forEach(k => {
      const sk = parseFloat(k); if (isNaN(sk)) return;
      const row = sd[k] as any;
      const ceOI = row?.ce_oi || 0, peOI = row?.pe_oi || 0;
      totalCE += ceOI; totalPE += peOI;
      if (sk > currentSpot && ceOI > maxCEOI) { maxCEOI = ceOI; resistance = sk; }
      if (sk < currentSpot && peOI > maxPEOI) { maxPEOI = peOI; support = sk; }
      const peLTP = row?.pe_ltp || 0, ceLTP = row?.ce_ltp || 0;
      if (sk < currentSpot && peLTP > 5 && peOI > 5000 && (!cheapPE.strike || peLTP < cheapPE.ltp))
        cheapPE = { strike: sk, ltp: peLTP };
      if (sk > currentSpot && ceLTP > 5 && ceOI > 5000 && (!cheapCE.strike || ceLTP < cheapCE.ltp))
        cheapCE = { strike: sk, ltp: ceLTP };
    });
    const pcr = totalCE > 0 ? totalPE / totalCE : 1;
    const strikeNum = parseFloat(strike);
    const nearWall = optType === 'CE'
      ? (resistance > 0 && (resistance - strikeNum) / currentSpot < 0.008)
      : (support > 0 && (strikeNum - support) / currentSpot < 0.008);
    let risk: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (nearWall && mktType !== 'TRENDING') risk = 'HIGH';
    else if (mktType === 'RANGE_BOUND') risk = 'MEDIUM';
    else if (mktType === 'SIDEWAYS' && nearWall) risk = 'MEDIUM';
    const counter = optType === 'CE' ? cheapPE : cheapCE;
    const counterType = optType === 'CE' ? 'PE' : 'CE';
    return { mktType, rangePct, pcr, resistance, support, risk, nearWall, counter, counterType, currentSpot, maxCEOI, maxPEOI };
  }
  const reversalRisk = computeReversalRisk();

  function computeGhostMode() {
    if (!rowsData.length) return null;
    const spots = rowsData.map((r: any) => r.strike_data?._spot_close || 0).filter((s: number) => s > 0);
    if (spots.length < 2) return null;
    const currentSpot = spots[0];
    const maxSpot = Math.max(...spots);
    const minSpot = Math.min(...spots);
    const positionPct = maxSpot > minSpot ? ((currentSpot - minSpot) / (maxSpot - minSpot)) * 100 : 50;
    const reverseZone: 'TOP' | 'BOTTOM' | 'MIDDLE' = positionPct >= 80 ? 'TOP' : positionPct <= 20 ? 'BOTTOM' : 'MIDDLE';
    const suggestedSide: 'PE' | 'CE' | null = reverseZone === 'TOP' ? 'PE' : reverseZone === 'BOTTOM' ? 'CE' : null;

    const latestSD = rowsData[0]?.strike_data || {};
    const prevSD = rowsData[1]?.strike_data || {};

    // OI-WAP floor: weighted average LTP across all days (weighted by OI).
    // This is the "trapped money" level — where the option tends to stop falling and bounce.
    function strikeFloor(sk: number, type: 'CE' | 'PE'): number {
      let sumLtpOI = 0, sumOI = 0;
      rowsData.forEach((r: any) => {
        const row = r.strike_data?.[sk] as any;
        if (!row) return;
        const ltp = type === 'CE' ? (row.ce_ltp || 0) : (row.pe_ltp || 0);
        const oi  = type === 'CE' ? (row.ce_oi  || 0) : (row.pe_oi  || 0);
        if (ltp > 0 && oi > 0) { sumLtpOI += ltp * oi; sumOI += oi; }
      });
      return sumOI > 0 ? Math.round((sumLtpOI / sumOI) * 10) / 10 : 0;
    }

    const candidates: {
      strike: number; type: 'CE' | 'PE'; ltp: number; otmDist: number;
      oiTrend: string; pts5x: number; pts10x: number; viability: 'HIGH' | 'MEDIUM' | 'LOW'; oi: number; floor: number;
    }[] = [];

    Object.keys(latestSD).forEach(k => {
      const sk = parseFloat(k);
      if (isNaN(sk)) return;
      const row = latestSD[k] as any;
      const prevRow = prevSD[k] as any;

      const ceLTP = row?.ce_ltp || 0;
      if (sk > currentSpot && ceLTP >= 5 && ceLTP <= 50) {
        const otmDist = Math.round(sk - currentSpot);
        const ceOI = row?.ce_oi || 0;
        const prevCeOI = prevRow?.ce_oi || 0;
        const oiTrend = ceOI > prevCeOI * 1.02 ? 'RISING' : ceOI < prevCeOI * 0.98 ? 'FALLING' : 'FLAT';
        const pts5x = Math.round(otmDist * 1.4);
        const pts10x = Math.round(otmDist * 2.3);
        const viability: 'HIGH' | 'MEDIUM' | 'LOW' = otmDist <= 200 && ceLTP >= 15 ? 'HIGH' : otmDist <= 300 && ceLTP >= 8 ? 'MEDIUM' : 'LOW';
        const floor = strikeFloor(sk, 'CE');
        candidates.push({ strike: sk, type: 'CE', ltp: ceLTP, otmDist, oiTrend, pts5x, pts10x, viability, oi: ceOI, floor });
      }

      const peLTP = row?.pe_ltp || 0;
      if (sk < currentSpot && peLTP >= 5 && peLTP <= 50) {
        const otmDist = Math.round(currentSpot - sk);
        const peOI = row?.pe_oi || 0;
        const prevPeOI = prevRow?.pe_oi || 0;
        const oiTrend = peOI > prevPeOI * 1.02 ? 'RISING' : peOI < prevPeOI * 0.98 ? 'FALLING' : 'FLAT';
        const pts5x = Math.round(otmDist * 1.4);
        const pts10x = Math.round(otmDist * 2.3);
        const viability: 'HIGH' | 'MEDIUM' | 'LOW' = otmDist <= 200 && peLTP >= 15 ? 'HIGH' : otmDist <= 300 && peLTP >= 8 ? 'MEDIUM' : 'LOW';
        const floor = strikeFloor(sk, 'PE');
        candidates.push({ strike: sk, type: 'PE', ltp: peLTP, otmDist, oiTrend, pts5x, pts10x, viability, oi: peOI, floor });
      }
    });

    const viabilityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    candidates.sort((a, b) => {
      const v = viabilityOrder[a.viability] - viabilityOrder[b.viability];
      if (v !== 0) return v;
      return a.otmDist - b.otmDist;
    });

    const bestCE = candidates.find(c => c.type === 'CE' && c.otmDist >= 100 && c.otmDist <= 300) || null;
    const bestPE = candidates.find(c => c.type === 'PE' && c.otmDist >= 100 && c.otmDist <= 300) || null;
    return { currentSpot, maxSpot, minSpot, positionPct, reverseZone, suggestedSide, candidates: candidates.slice(0, 24), bestCE, bestPE };
  }
  const ghostMode = computeGhostMode();

  const TABS = [
    { id: 'verdict', label: '⚡ Verdict' },
    { id: 'ghost', label: '👻 Ghost Mode' },
    { id: 'raw', label: '📊 Raw Data' },
    ...(isAdmin ? [{ id: 'decomp', label: '🔀 Decomp' }] : []),
    { id: 'gp', label: '⚛ God Particle' },
    { id: 'story', label: '📖 Story' },
    { id: 'matrix', label: '🎯 Matrix' },
    { id: 'planb', label: '🔀 Plan B' },
    { id: 'forecast', label: '🔮 Forecast' },
    ...(isAdmin ? [{ id: 'ig', label: '📸 Instagram' }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-4 py-3 border-b border-[#1e1e2e]">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#f0c040] rounded-lg flex items-center justify-center text-base">⚛</div>
          <span className="font-bold text-sm">God Particle</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-[#6b6b85]">
            Credits: <span className="text-[#f0c040] font-bold">{['pro', 'admin'].includes(profile?.role ?? '') ? '∞' : profile?.credits ?? 0}</span>
          </span>
          <button
            onClick={() => window.location.reload()}
            title="Refresh all data from Supabase"
            className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040] border border-[#1e1e2e] rounded px-2 py-1">
            ↺ Refresh
          </button>
          <Link to="/dashboard" className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040]">← Dashboard</Link>
        </div>
      </nav>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-6">

        {/* ── UPLOAD CSV DATA — admin only ── */}
        {isAdmin && <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5 mb-5">
          <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-3">📥 Upload CSV Data</div>

          {/* Upload tabs */}
          <div className="flex gap-2 mb-4">
            {(['index', 'stock'] as const).map(t => (
              <button key={t} onClick={() => setUploadTab(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${uploadTab === t ? 'bg-[#f0c040] text-black' : 'border border-[#1e1e2e] text-[#6b6b85]'}`}>
                {t === 'index' ? '📈 Index' : '🏢 Stock Options'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs font-mono text-[#6b6b85] uppercase mb-1">
                {uploadTab === 'index' ? 'Index' : 'Stock Symbol'}
              </label>
              {uploadTab === 'index' ? (
                <select value={uploadIndex} onChange={e => setUploadIndex(e.target.value)}
                  className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]">
                  {INDICES.map(i => (
                    <option key={i.key} value={i.key}>{i.label}</option>
                  ))}
                </select>
              ) : (
                <input value={uploadIndex} onChange={e => setUploadIndex(e.target.value.toUpperCase())}
                  placeholder="e.g. SBIN"
                  className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]" />
              )}
            </div>
            <div>
              <label className="block text-xs font-mono text-[#6b6b85] uppercase mb-1">Expiry Date</label>
              <input type="date" value={uploadExpiry} onChange={e => setUploadExpiry(e.target.value)}
                className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]" />
            </div>
            <div>
              <label className="block text-xs font-mono text-[#6b6b85] uppercase mb-1">Date of CSV</label>
              <input type="date" value={uploadDate} onChange={e => setUploadDate(e.target.value)}
                className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]" />
            </div>
            <div>
              <label className="block text-xs font-mono text-[#6b6b85] uppercase mb-1">
                {INDEX_DISPLAY[uploadIndex] ?? uploadIndex} Spot at Close <span className="text-[#6b6b85]">(auto-detected from CSV · override if wrong)</span>
              </label>
              <input type="number" value={uploadSpot} onChange={e => setUploadSpot(e.target.value)}
                placeholder="Auto-detected from CSV header"
                className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]" />
            </div>
          </div>

          {!canUpload(uploadIndex) && (
            <div className="text-xs font-mono text-[#ff4d6d] bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-lg px-3 py-2 mb-3">
              ⚠️ {uploadIndex === 'NIFTY50' ? 'Nifty 50 data is admin-only.' : 'Upgrade to upload this index.'} <Link to="/pricing" className="underline">Upgrade →</Link>
            </div>
          )}

          <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all ${canUpload(uploadIndex) ? 'border-[#1e1e2e] hover:border-[#f0c040]' : 'border-[#1e1e2e] opacity-40 cursor-not-allowed'}`}>
            <input type="file" accept=".csv" className="hidden" onChange={handleUpload} disabled={!canUpload(uploadIndex) || uploading} />
            <div className="text-2xl mb-1">📄</div>
            <div className="text-xs font-mono text-[#6b6b85]">{uploading ? '⏳ Uploading...' : 'Click to upload NSE Option Chain CSV'}</div>
          </label>

          {uploadMsg && (
            <div className={`mt-2 text-xs font-mono px-3 py-2 rounded-lg ${uploadMsg.startsWith('✅') ? 'bg-[#39d98a]/10 text-[#39d98a] border border-[#39d98a]/30' : 'bg-[#ff4d6d]/10 text-[#ff4d6d] border border-[#ff4d6d]/30'}`}>
              {uploadMsg}
            </div>
          )}
        </div>}

        {/* ── ANALYSE SECTION ── */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5 mb-5">
          <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-3">⚛ God Particle Analysis</div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div>
              <label className="block text-xs font-mono text-[#6b6b85] uppercase mb-1">Index / Stock</label>
              <select value={indexName} onChange={e => setIndexName(e.target.value)}
                className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]">
                {INDICES.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
                {profile?.role === 'pro' || profile?.role === 'admin' ? (
                  <option value="STOCK">Stock (enter below)</option>
                ) : null}
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono text-[#6b6b85] uppercase mb-1">
                Expiry {loadingExpiries && <span className="text-[#f0c040]">⏳</span>}
              </label>
              <select value={expiry} onChange={e => setExpiry(e.target.value)}
                className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]">
                <option value="">Select expiry</option>
                {availableExpiries.map(e => (
                  <option key={e} value={e}>{formatExpiryDisplay(e)}</option>
                ))}
              </select>
              {availableExpiries.length === 0 && !loadingExpiries && (
                <div className="text-xs font-mono text-[#f0c040] mt-1">No data yet — run Auto Fetch!</div>
              )}
            </div>
            <div>
              <label className="block text-xs font-mono text-[#6b6b85] uppercase mb-1">Strike Price</label>
              <input type="number" value={strike} onChange={e => setStrike(e.target.value)}
                placeholder="e.g. 24000" step="50"
                className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]" />
            </div>
            <div>
              <label className="block text-xs font-mono text-[#6b6b85] uppercase mb-1">Option Type</label>
              <select value={optType} onChange={e => setOptType(e.target.value)}
                className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]">
                <option value="CE">CE — Call</option>
                <option value="PE">PE — Put</option>
              </select>
            </div>
          </div>

          {availableDates.length > 0 && (() => {
            const today = new Date().toISOString().split('T')[0];
            const latest = availableDates[availableDates.length - 1];
            const isStale = latest < today;
            return (
              <>
                <div className="text-xs font-mono text-[#39d98a] mb-1">
                  ✅ {availableDates.length} day{availableDates.length > 1 ? 's' : ''} of data available: {availableDates.map(d => d.slice(5)).join(', ')}
                </div>
                {isStale && (
                  <div className="bg-[#f0a030]/10 border border-[#f0a030]/40 rounded-lg px-3 py-2 text-xs font-mono text-[#f0a030] mb-3">
                    ⚠ Latest data is from {latest.slice(5)} — upload today's option chain CSV to include today's data in analysis
                  </div>
                )}
              </>
            );
          })()}

          {error && (
            <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-lg px-4 py-2 text-xs font-mono text-[#ff4d6d] mb-3">{error}</div>
          )}

          {!['admin','pro'].includes(profile?.role ?? '') && (profile?.credits ?? 0) < 2 && (
            <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/40 rounded-xl px-4 py-3 flex items-center justify-between gap-3 mb-3">
              <div>
                <div className="text-xs font-black text-[#ff4d6d] mb-0.5">Not enough credits — need 2, you have {profile?.credits ?? 0}</div>
                <div className="text-[10px] font-mono text-[#6b6b85]">Buy a credit pack or upgrade your plan to continue</div>
              </div>
              <Link to="/pricing" className="shrink-0 bg-[#f0c040] text-black text-xs font-black px-3 py-2 rounded-lg whitespace-nowrap">Get Credits →</Link>
            </div>
          )}

          <button onClick={handleAnalyse} disabled={analysing}
            className="w-full bg-[#f0c040] text-black font-black py-3 rounded-xl hover:bg-[#ffd060] transition-all disabled:opacity-40">
            {analysing ? '⏳ Analysing...' : '⚛ Run God Particle Analysis — 2 Credits'}
          </button>
        </div>

        {/* ── RESULTS ── */}
        {result && (
          <div>
            {/* God Particle Card */}
            <div className="bg-gradient-to-r from-[#f0c040]/10 to-transparent border border-[#f0c040]/30 rounded-2xl p-5 mb-4 flex items-center gap-6 flex-wrap">
              <div>
                <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-1">⚛ God Particle (PCB)</div>
                <div className="text-5xl font-black text-[#f0c040]">₹{result.pcb.toFixed(1)}</div>
              </div>
              <div className="w-px h-12 bg-[#1e1e2e]" />
              <div className="flex flex-col gap-1.5">
                <div className="text-xs font-mono"><span className="text-[#6b6b85] mr-2">VWAP</span>₹{result.vwap.toFixed(1)}</div>
                <div className="text-xs font-mono"><span className="text-[#6b6b85] mr-2">OI-WAP</span>₹{result.oiwap.toFixed(1)}</div>
                <div className="text-xs font-mono"><span className="text-[#6b6b85] mr-2">Last Close</span>₹{result.lc.toFixed(2)}
                  <span className={`ml-2 px-2 py-0.5 rounded text-xs font-bold ${result.lc > result.pcb ? 'bg-[#39d98a]/15 text-[#39d98a]' : 'bg-[#ff4d6d]/15 text-[#ff4d6d]'}`}>
                    {result.lc > result.pcb ? 'ABOVE PCB' : result.lc < result.pcb ? 'BELOW PCB' : 'AT PCB'}
                  </span>
                </div>
                <div className="text-xs font-mono"><span className="text-[#6b6b85] mr-2">DTE</span>{result.dte}d · <span className="text-[#6b6b85] mr-2">Data</span>{result.data.length} days</div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-[#111118] rounded-xl p-1 mb-4 overflow-x-auto">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${activeTab === t.id ? 'bg-[#16161f] text-[#e8e8f0] border border-[#1e1e2e]' : 'text-[#6b6b85]'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── VERDICT TAB ── */}
            {activeTab === 'verdict' && (() => {
              const conviction = result.conviction ?? 50;
              const bias       = result.bias ?? 'NEUTRAL';
              const rec        = result.recommendation ?? 'WAIT';
              const signals    = result.signals ?? [];
              const verdictText = result.verdictText ?? '';

              const recColor = rec === 'BUY'  ? '#39d98a'
                             : rec === 'WAIT' ? '#f0c040'
                             : '#ff4d6d';
              const biasColor = conviction >= 58 ? '#39d98a'
                              : conviction >= 42 ? '#f0c040'
                              : '#ff4d6d';
              const barColor  = biasColor;

              return (
                <div className="space-y-4">
                  {/* Conviction header */}
                  <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                      <div>
                        <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-1">Conviction Score</div>
                        <div className="text-5xl font-black" style={{ color: barColor }}>{conviction}<span className="text-xl text-[#6b6b85]">/100</span></div>
                      </div>
                      <div className="flex flex-col gap-2 items-end">
                        <div className="px-4 py-1.5 rounded-full text-sm font-black" style={{ background: `${biasColor}20`, color: biasColor, border: `1px solid ${biasColor}40` }}>{bias}</div>
                        <div className="px-4 py-1.5 rounded-full text-sm font-black" style={{ background: `${recColor}20`, color: recColor, border: `1px solid ${recColor}40` }}>
                          {rec === 'BUY' ? '📗 BUY' : rec === 'WAIT' ? '⏳ WAIT' : '🚫 AVOID'}
                        </div>
                      </div>
                    </div>
                    {/* Conviction bar */}
                    <div className="w-full h-3 bg-[#16161f] rounded-full overflow-hidden mb-1">
                      <div className="h-full rounded-full transition-all" style={{ width: `${conviction}%`, background: `linear-gradient(90deg, #ff4d6d, #f0c040, #39d98a)` }} />
                    </div>
                    <div className="flex justify-between text-[10px] font-mono text-[#6b6b85]">
                      <span>0 — AVOID</span><span>42 — WAIT</span><span>58 — BUY</span><span>100</span>
                    </div>
                  </div>

                  {/* 5-Signal breakdown */}
                  <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5">
                    <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-4">5-Signal Breakdown</div>
                    <div className="space-y-3">
                      {signals.map((sig: any, i: number) => {
                        const pct  = Math.max(0, Math.min(100, ((sig.score + sig.max) / (sig.max * 2)) * 100));
                        const sc   = sig.score > 0 ? '#39d98a' : sig.score < 0 ? '#ff4d6d' : '#f0c040';
                        return (
                          <div key={i}>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs font-bold text-[#e8e8f0]">{sig.name}</span>
                              <span className="text-xs font-black font-mono" style={{ color: sc }}>
                                {sig.score > 0 ? '+' : ''}{sig.score} / {sig.max}
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-[#16161f] rounded-full overflow-hidden mb-1">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: sc }} />
                            </div>
                            <div className="text-[10px] font-mono text-[#6b6b85]">{sig.label}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Final verdict text */}
                  <div className="bg-gradient-to-r from-[#f0c040]/10 to-transparent border border-[#f0c040]/30 rounded-2xl p-5">
                    <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-3">⚡ Final Verdict</div>
                    <div className="space-y-2">
                      {verdictText.split('. ').filter(Boolean).map((line: string, i: number) => (
                        <div key={i} className="text-xs font-mono text-[#e8e8f0] leading-relaxed border-l-2 border-[#f0c040]/40 pl-3">{line}{line.endsWith('.') ? '' : '.'}</div>
                      ))}
                    </div>
                  </div>

                  {/* Key levels quick reference */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: '⚛ God Particle', val: `₹${result.pcb?.toFixed(1)}`, color: '#f0c040' },
                      { label: '📊 VWAP', val: `₹${result.vwap?.toFixed(1)}`, color: '#4d9fff' },
                      { label: '🔵 OI-WAP', val: `₹${result.oiwap?.toFixed(1)}`, color: '#a78bfa' },
                    ].map((kl, i) => (
                      <div key={i} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-3 text-center">
                        <div className="text-[10px] font-mono text-[#6b6b85] mb-1">{kl.label}</div>
                        <div className="text-lg font-black" style={{ color: kl.color }}>{kl.val}</div>
                        <div className="text-[10px] font-mono mt-1" style={{ color: kl.color }}>
                          {result.lc > parseFloat(kl.val.replace('₹','')) ? '← lc ABOVE' : '← lc BELOW'}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* ── REVERSAL RISK PANEL ── */}
                  {reversalRisk && (() => {
                    const { mktType, rangePct, pcr, resistance, support, risk, nearWall, counter, counterType, currentSpot, maxCEOI, maxPEOI } = reversalRisk;
                    const riskColor = risk === 'HIGH' ? '#ff4d6d' : risk === 'MEDIUM' ? '#ff8c42' : '#39d98a';
                    const mktLabel = mktType === 'RANGE_BOUND' ? '⛓ Range-Bound' : mktType === 'SIDEWAYS' ? '↔ Sideways' : '🚀 Trending';
                    return (
                      <div className={`rounded-2xl p-5 border ${risk === 'HIGH' ? 'border-[#ff4d6d]/40 bg-[#ff4d6d]/5' : risk === 'MEDIUM' ? 'border-[#ff8c42]/40 bg-[#ff8c42]/5' : 'border-[#39d98a]/30 bg-[#39d98a]/5'}`}>
                        <div className="flex items-center justify-between mb-4">
                          <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest">🔄 Reversal Risk Check</div>
                          <span className="text-xs font-black px-2 py-0.5 rounded-full border" style={{ color: riskColor, borderColor: riskColor + '40', background: riskColor + '15' }}>
                            {risk} RISK
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div className="bg-[#111118] rounded-xl p-3">
                            <div className="text-[10px] font-mono text-[#6b6b85] mb-1">Market Character</div>
                            <div className="text-sm font-black" style={{ color: riskColor }}>{mktLabel}</div>
                            <div className="text-[10px] font-mono text-[#6b6b85] mt-1">Spot range {rangePct.toFixed(1)}% over {rowsData.length} sessions</div>
                          </div>
                          <div className="bg-[#111118] rounded-xl p-3">
                            <div className="text-[10px] font-mono text-[#6b6b85] mb-1">Put/Call Ratio</div>
                            <div className={`text-sm font-black ${pcr > 1.3 ? 'text-[#39d98a]' : pcr < 0.8 ? 'text-[#ff4d6d]' : 'text-[#e8e8f0]'}`}>{pcr.toFixed(2)}</div>
                            <div className="text-[10px] font-mono text-[#6b6b85] mt-1">{pcr > 1.3 ? 'PE heavy — support likely' : pcr < 0.8 ? 'CE heavy — resistance likely' : 'Balanced'}</div>
                          </div>
                          <div className="bg-[#111118] rounded-xl p-3">
                            <div className="text-[10px] font-mono text-[#6b6b85] mb-1">Resistance (CE Wall)</div>
                            <div className="text-sm font-black text-[#ff4d6d]">{resistance > 0 ? resistance.toLocaleString() : '—'}</div>
                            <div className="text-[10px] font-mono text-[#6b6b85] mt-1">OI: {resistance > 0 ? (maxCEOI / 100000).toFixed(1) + 'L' : '—'}</div>
                          </div>
                          <div className="bg-[#111118] rounded-xl p-3">
                            <div className="text-[10px] font-mono text-[#6b6b85] mb-1">Support (PE Wall)</div>
                            <div className="text-sm font-black text-[#39d98a]">{support > 0 ? support.toLocaleString() : '—'}</div>
                            <div className="text-[10px] font-mono text-[#6b6b85] mt-1">OI: {support > 0 ? (maxPEOI / 100000).toFixed(1) + 'L' : '—'}</div>
                          </div>
                        </div>
                        {nearWall && (
                          <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-xl px-4 py-3 mb-3 text-xs font-mono text-[#ff4d6d]">
                            ⚠️ Your {optType} strike {strike} is near the {optType === 'CE' ? 'resistance' : 'support'} wall — premium may reverse before hitting target.
                          </div>
                        )}
                        {risk !== 'LOW' && counter.strike > 0 && (
                          <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
                            <div className="text-[10px] font-mono text-[#6b6b85] uppercase mb-2">Counter Option — If Reversal Occurs</div>
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-lg font-black" style={{ color: counterType === 'PE' ? '#39d98a' : '#4d9fff' }}>{counter.strike} {counterType}</span>
                                <span className="text-xs font-mono text-[#6b6b85] ml-2">LTP ₹{counter.ltp.toFixed(1)} — low base, big potential</span>
                              </div>
                              <div className="text-[10px] font-mono text-[#6b6b85]">
                                {mktType === 'RANGE_BOUND' ? 'Enter on confirmation' : 'Wait for reversal candle'}
                              </div>
                            </div>
                            <div className="mt-2 text-[10px] font-mono text-[#6b6b85]">
                              Confirmation: {counterType === 'PE' ? 'Spot fails to break resistance + PE LTP starts rising + PCR rising' : 'Spot bounces off support + CE LTP starts rising + PCR falling'}
                            </div>
                          </div>
                        )}
                        {risk === 'LOW' && (
                          <div className="text-[10px] font-mono text-[#39d98a]">✅ Market is trending — OI walls are not a threat. Ride the GCT signal.</div>
                        )}
                      </div>
                    );
                  })()}

                  {/* AI TRADE INSIGHT */}
                  <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5">
                    {!gctAiInsight && !gctAiLoading && (
                      <button
                        onClick={fetchGCTAIInsight}
                        className="w-full py-2.5 rounded-xl text-xs font-black border border-[#a855f7]/40 text-[#a855f7] hover:bg-[#a855f7]/10 transition-all"
                      >
                        🤖 Get AI Trade Insight
                      </button>
                    )}
                    {gctAiLoading && (
                      <div className="text-center text-xs font-mono text-[#a855f7] py-2">⏳ AI is analysing this setup...</div>
                    )}
                    {gctAiError && (
                      <div className="text-xs font-mono text-[#ff4d6d] py-1">{gctAiError}</div>
                    )}
                    {gctAiInsight && (
                      <>
                        <div className="text-[9px] font-black uppercase tracking-widest text-[#a855f7] mb-3">🤖 AI Trade Insight</div>
                        <div className="text-[11px] font-mono text-[#e8e8f0] leading-relaxed whitespace-pre-line">{gctAiInsight}</div>
                      </>
                    )}
                  </div>

                  <div className="text-center text-[10px] font-mono text-[#6b6b85]">
                    Not Financial Advice · God Particle ⚛ · Based on {result.data?.length} sessions of data
                  </div>
                </div>
              );
            })()}

            {/* Ghost Mode */}
            {activeTab === 'ghost' && (() => {
              if (!ghostMode) return (
                <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-8 text-center">
                  <div className="text-3xl mb-3">👻</div>
                  <div className="text-sm font-black text-[#6b6b85]">Run analysis first to unlock Ghost Mode</div>
                </div>
              );
              const { currentSpot, maxSpot, minSpot, positionPct, reverseZone, suggestedSide, candidates, bestCE, bestPE } = ghostMode;
              const zoneColor = reverseZone === 'TOP' ? '#ff4d6d' : reverseZone === 'BOTTOM' ? '#39d98a' : '#f0c040';
              const viabilityColor = (v: string) => v === 'HIGH' ? '#39d98a' : v === 'MEDIUM' ? '#f0c040' : '#6b6b85';
              const focusCandidates = suggestedSide ? candidates.filter(c => c.type === suggestedSide) : candidates;
              const bestPick = suggestedSide === 'CE' ? bestCE : suggestedSide === 'PE' ? bestPE : (bestCE || bestPE);

              // Plain-English status
              const statusMsg = reverseZone === 'TOP'
                ? { emoji: '🔴', title: 'Market near TOP', action: 'Buy PE — bet it will fall', color: '#ff4d6d' }
                : reverseZone === 'BOTTOM'
                ? { emoji: '🟢', title: 'Market near BOTTOM', action: 'Buy CE — bet it will rise', color: '#39d98a' }
                : { emoji: '⏳', title: 'Market in middle', action: 'Wait — no trade yet', color: '#f0c040' };

              return (
                <div className="space-y-4">

                  {/* What is Ghost Mode — newbie intro */}
                  <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-4">
                    <div className="text-xs font-black text-[#f0c040] mb-1">👻 What is Ghost Mode?</div>
                    <div className="text-xs font-mono text-[#6b6b85] leading-relaxed">
                      Buy cheap options (under ₹50) when the market is near the top or bottom of its recent range.
                      These options can give <span className="text-[#f0c040] font-black">5x–10x returns</span> if the market reverses.
                      High risk — only bet what you can afford to lose fully.
                    </div>
                  </div>

                  {/* Step 1 — Where is market now */}
                  <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5">
                    <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-3">Step 1 — Where is the market now?</div>

                    {/* Meter */}
                    <div className="relative w-full h-7 bg-[#16161f] rounded-full overflow-hidden mb-2">
                      <div className="absolute inset-y-0 left-0 w-[20%] bg-[#39d98a]/25 rounded-l-full flex items-center justify-center">
                        <span className="text-[9px] font-black text-[#39d98a]">BUY CE</span>
                      </div>
                      <div className="absolute inset-y-0 right-0 w-[20%] bg-[#ff4d6d]/25 rounded-r-full flex items-center justify-center">
                        <span className="text-[9px] font-black text-[#ff4d6d]">BUY PE</span>
                      </div>
                      <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-lg transition-all"
                        style={{ left: `calc(${Math.min(Math.max(positionPct, 4), 96)}% - 8px)`, background: zoneColor }} />
                    </div>
                    <div className="flex justify-between text-[10px] font-mono text-[#6b6b85] mb-4">
                      <span>Low: {minSpot.toLocaleString()}</span>
                      <span>Current: {currentSpot.toLocaleString()} ({positionPct.toFixed(0)}%)</span>
                      <span>High: {maxSpot.toLocaleString()}</span>
                    </div>

                    {/* Status banner */}
                    <div className="rounded-xl px-4 py-3 text-center" style={{ background: statusMsg.color + '15', border: `1px solid ${statusMsg.color}35` }}>
                      <div className="text-xl mb-0.5">{statusMsg.emoji}</div>
                      <div className="text-sm font-black" style={{ color: statusMsg.color }}>{statusMsg.title}</div>
                      <div className="text-xs font-mono text-[#e8e8f0] mt-0.5">{statusMsg.action}</div>
                    </div>
                  </div>

                  {/* Step 2 — Best option to buy */}
                  {bestPick && reverseZone !== 'MIDDLE' && (
                    <div className="rounded-2xl p-5 border-2" style={{ borderColor: bestPick.type === 'CE' ? '#4d9fff' : '#39d98a', background: (bestPick.type === 'CE' ? '#4d9fff' : '#39d98a') + '08' }}>
                      <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Step 2 — Best option to buy right now</div>

                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-2xl font-black" style={{ color: bestPick.type === 'CE' ? '#4d9fff' : '#39d98a' }}>
                            {bestPick.strike} {bestPick.type}
                          </div>
                          <div className="text-xs font-mono text-[#6b6b85]">
                            {bestPick.type === 'CE' ? 'Call option — profits when market goes UP' : 'Put option — profits when market goes DOWN'}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-black text-[#f0c040]">₹{bestPick.ltp.toFixed(1)}</div>
                          <div className="text-[10px] font-mono text-[#6b6b85]">buy price per unit</div>
                        </div>
                      </div>

                      <div className="space-y-2 text-xs font-mono">
                        {bestPick.floor > 0 && (
                          <div className={`rounded-lg px-3 py-2 flex justify-between ${bestPick.ltp <= bestPick.floor * 1.05 ? 'bg-[#39d98a]/15 text-[#39d98a]' : 'bg-[#16161f] text-[#a78bfa]'}`}>
                            <span>{bestPick.ltp <= bestPick.floor * 1.05 ? '🎯 AT FLOOR — good entry zone' : 'Price floor (where it stops falling)'}</span>
                            <span className="font-black">₹{bestPick.floor.toFixed(1)}</span>
                          </div>
                        )}
                        <div className="bg-[#16161f] rounded-lg px-3 py-2 flex justify-between">
                          <span className="text-[#6b6b85]">If you invest ₹{bestPick.ltp.toFixed(0)}, a 5x win gives you</span>
                          <span className="text-[#39d98a] font-black">₹{(bestPick.ltp * 5).toFixed(0)} (need {bestPick.pts5x} pt move)</span>
                        </div>
                        <div className="bg-[#16161f] rounded-lg px-3 py-2 flex justify-between">
                          <span className="text-[#6b6b85]">10x win gives you</span>
                          <span className="text-[#f0c040] font-black">₹{(bestPick.ltp * 10).toFixed(0)} (need {bestPick.pts10x} pt move)</span>
                        </div>
                        <div className="bg-[#ff4d6d]/10 rounded-lg px-3 py-2 flex justify-between">
                          <span className="text-[#6b6b85]">Exit immediately if price falls to</span>
                          <span className="text-[#ff4d6d] font-black">₹{(bestPick.ltp * 0.6).toFixed(0)} (stop loss)</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 3 — When to enter */}
                  <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-4">
                    <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-3">Step 3 — When to enter</div>
                    <div className="space-y-2">
                      {[
                        {
                          icon: reverseZone !== 'MIDDLE' ? '✅' : '⏳',
                          ok: reverseZone !== 'MIDDLE',
                          title: 'Market must be near top or bottom',
                          note: reverseZone !== 'MIDDLE' ? `Currently at ${positionPct.toFixed(0)}% — zone is active` : `Currently at ${positionPct.toFixed(0)}% — wait for it to reach green or red zone`,
                        },
                        { icon: '🕐', ok: false, title: 'Enter only during these times', note: '10:00–11:30 AM  or  1:15–2:00 PM' },
                        { icon: '🕯️', ok: false, title: 'Wait for a reversal signal candle', note: 'On a 15-min chart, look for a green candle at bottom or red candle at top' },
                        { icon: '🚫', ok: false, title: 'Exit immediately if option drops 40%', note: `That means exit if price falls below ₹${bestPick ? (bestPick.ltp * 0.6).toFixed(0) : '—'} — no second chances` },
                      ].map((step, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center text-xs shrink-0 ${step.ok ? 'bg-[#39d98a]/20' : 'bg-[#16161f]'}`}>
                            {step.icon}
                          </div>
                          <div>
                            <div className={`text-xs font-bold ${step.ok ? 'text-[#39d98a]' : 'text-[#e8e8f0]'}`}>{step.title}</div>
                            <div className="text-[10px] font-mono text-[#6b6b85]">{step.note}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Step 4 — All options table (simplified) */}
                  {focusCandidates.length > 0 && (
                    <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-x-auto">
                      <div className="px-4 py-3 border-b border-[#1e1e2e]">
                        <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest">Step 4 — All cheap options under ₹50</div>
                        <div className="text-[10px] font-mono text-[#6b6b85] mt-0.5">Sorted by signal strength. Buy price shown.</div>
                      </div>
                      <table className="w-full text-xs font-mono">
                        <thead><tr className="border-b border-[#1e1e2e]">
                          {['Strike', 'CE/PE', 'Buy at', 'Floor', '5x at', '10x at', 'Signal'].map(h => (
                            <th key={h} className="text-left px-3 py-2 text-[#6b6b85] font-normal text-[10px]">{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {focusCandidates.map((c, i) => {
                            const atFloor = c.floor > 0 && c.ltp <= c.floor * 1.05;
                            const signalEmoji = c.viability === 'HIGH' ? '🟢' : c.viability === 'MEDIUM' ? '🟡' : '⚪';
                            return (
                              <tr key={i} className={`border-b border-[#1e1e2e]/50 hover:bg-[#f0c040]/5 ${atFloor ? 'bg-[#39d98a]/5' : ''}`}>
                                <td className="px-3 py-2.5 font-bold text-[#e8e8f0]">{c.strike}</td>
                                <td className="px-3 py-2.5 font-black" style={{ color: c.type === 'CE' ? '#4d9fff' : '#39d98a' }}>{c.type}</td>
                                <td className="px-3 py-2.5 text-[#f0c040] font-bold">₹{c.ltp.toFixed(1)}</td>
                                <td className="px-3 py-2.5">
                                  {c.floor > 0
                                    ? <span className={atFloor ? 'text-[#39d98a] font-black' : 'text-[#a78bfa]'}>₹{c.floor.toFixed(1)}{atFloor ? ' 🎯' : ''}</span>
                                    : <span className="text-[#6b6b85]">—</span>}
                                </td>
                                <td className="px-3 py-2.5 text-[#39d98a]">₹{(c.ltp * 5).toFixed(0)}</td>
                                <td className="px-3 py-2.5 text-[#f0c040]">₹{(c.ltp * 10).toFixed(0)}</td>
                                <td className="px-3 py-2.5">
                                  <span className="font-black" style={{ color: viabilityColor(c.viability) }}>{signalEmoji} {c.viability}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/20 rounded-xl px-4 py-3 text-[10px] font-mono text-[#ff4d6d]">
                    ⚠️ Risk warning: Max 2 lots only · Win rate is ~30% — most trades will lose · Never invest money you can't afford to lose fully · This is for experienced traders only.
                  </div>
                </div>
              );
            })()}

            {/* Raw Data */}
            {activeTab === 'raw' && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead><tr className="border-b border-[#1e1e2e]">
                    {['Date', 'Close', 'IV %', 'Volume', 'OI', 'Chng OI'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[#6b6b85] uppercase tracking-widest font-normal">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {result.data.map((d: any, i: number) => (
                      <tr key={i} className="border-b border-[#1e1e2e]/50 hover:bg-[#f0c040]/5">
                        <td className="px-4 py-3">{d.date}</td>
                        <td className="px-4 py-3 font-bold">₹{d.close.toFixed(2)}</td>
                        <td className="px-4 py-3 text-[#a78bfa] font-bold">{d.iv > 0 ? d.iv.toFixed(1) + '%' : '—'}</td>
                        <td className="px-4 py-3">{d.volume.toLocaleString()}</td>
                        <td className="px-4 py-3">{d.oi.toLocaleString()}</td>
                        <td className={`px-4 py-3 ${(d.chng_oi || 0) >= 0 ? 'text-[#39d98a]' : 'text-[#ff4d6d]'}`}>
                          {(d.chng_oi || 0) >= 0 ? '+' : ''}{Math.round(d.chng_oi || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Decomposition */}
            {activeTab === 'decomp' && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead><tr className="border-b border-[#1e1e2e]">
                    {['Date', 'Volume', 'ΔOI', 'New Opens', 'Square-offs', 'Signal'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[#6b6b85] uppercase tracking-widest font-normal">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {result.decomp.map((d: any, i: number) => {
                      const isCE = result.optType === 'CE';
                      const signal = d.deltaOI > 0
                        ? (isCE ? (d.close > result.pcb ? '🟢 Fresh Buy' : '🔴 Fresh Write') : (d.close > result.pcb ? '🔴 Fresh Buy PE' : '🟢 PE Writing'))
                        : '⬜ Unwinding';
                      return (
                        <tr key={i} className="border-b border-[#1e1e2e]/50 hover:bg-[#f0c040]/5">
                          <td className="px-4 py-3">{d.date}</td>
                          <td className="px-4 py-3">{d.volume.toLocaleString()}</td>
                          <td className={`px-4 py-3 ${d.deltaOI >= 0 ? 'text-[#39d98a]' : 'text-[#ff4d6d]'}`}>
                            {d.deltaOI >= 0 ? '+' : ''}{Math.round(d.deltaOI).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-[#f0c040] font-bold">{Math.round(d.newOpens).toLocaleString()}</td>
                          <td className="px-4 py-3">{Math.round(d.squareoffs).toLocaleString()}</td>
                          <td className="px-4 py-3">{signal}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* God Particle Validation */}
            {activeTab === 'gp' && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead><tr className="border-b border-[#1e1e2e]">
                    {['Date', 'Close', 'vs PCB', 'Zone', 'Signal'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[#6b6b85] uppercase tracking-widest font-normal">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {result.decomp.map((d: any, i: number) => {
                      const diff = d.close - result.pcb;
                      const pct = ((diff / result.pcb) * 100).toFixed(1);
                      const zone = d.close > result.pcb ? 'BUYER EDGE' : d.close < result.pcb ? 'WRITER EDGE' : 'WAR ZONE';
                      const zc = d.close > result.pcb ? 'bg-[#39d98a]/15 text-[#39d98a]' : d.close < result.pcb ? 'bg-[#ff4d6d]/15 text-[#ff4d6d]' : 'bg-[#f0c040]/15 text-[#f0c040]';
                      const interp = d.close > result.pcb
                        ? (result.optType === 'CE' ? 'Buyers in control — bullish' : 'PE buyers dominant — bearish Nifty')
                        : d.close < result.pcb
                        ? (result.optType === 'CE' ? 'Writers winning — CE pressured' : 'PE writing active — bullish Nifty')
                        : 'War zone — sharp move expected';
                      return (
                        <tr key={i} className="border-b border-[#1e1e2e]/50 hover:bg-[#f0c040]/5">
                          <td className="px-4 py-3">{d.date}</td>
                          <td className="px-4 py-3 font-bold">₹{d.close.toFixed(2)}</td>
                          <td className={`px-4 py-3 ${diff >= 0 ? 'text-[#39d98a]' : 'text-[#ff4d6d]'}`}>
                            {diff >= 0 ? '+' : ''}₹{diff.toFixed(1)} ({diff >= 0 ? '+' : ''}{pct}%)
                          </td>
                          <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-bold ${zc}`}>{zone}</span></td>
                          <td className="px-4 py-3 text-[#6b6b85]">{interp}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Story */}
            {activeTab === 'story' && (() => {
              const f = result.data[0], l = result.data[result.data.length - 1];
              const mv = l.close - f.close;
              const mvp = ((mv / f.close) * 100).toFixed(1);
              const tNO = result.decomp.reduce((s: number, d: any) => s + d.newOpens, 0);
              const tSQ = result.decomp.reduce((s: number, d: any) => s + d.squareoffs, 0);
              const pos = l.close > result.pcb ? 'ABOVE' : l.close < result.pcb ? 'BELOW' : 'AT';
              const isCE = result.optType === 'CE';
              return (
                <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 text-sm leading-relaxed space-y-3">
                  <p>Over <strong className="text-[#f0c040]">{result.data.length} sessions</strong>, <strong className="text-[#f0c040]">{result.strike} {result.optType}</strong> (Expiry: {formatExpiryDisplay(result.expiry)}) moved from <strong className="text-[#f0c040]">₹{f.close.toFixed(2)}</strong> to <strong className="text-[#f0c040]">₹{l.close.toFixed(2)}</strong> — <strong style={{ color: mv >= 0 ? '#39d98a' : '#ff4d6d' }}>{mv >= 0 ? '+' : ''}₹{mv.toFixed(2)} ({mv >= 0 ? '+' : ''}{mvp}%)</strong>.</p>
                  <p>Positions are <strong className="text-[#f0c040]">{tNO > tSQ ? 'building — fresh entries dominating' : 'unwinding — more exits than entries'}</strong>. New opens: <strong className="text-[#f0c040]">{Math.round(tNO).toLocaleString()}</strong> vs square-offs: <strong className="text-[#f0c040]">{Math.round(tSQ).toLocaleString()}</strong>.</p>
                  <p>The <strong className="text-[#f0c040]">God Particle (PCB)</strong> is at <strong className="text-[#f0c040]">₹{result.pcb.toFixed(1)}</strong>. Current price is <strong className="text-[#f0c040]">{pos}</strong> PCB — {pos === 'ABOVE' ? (isCE ? 'buyers have the edge. Bullish momentum.' : 'PE buyers in control. Bearish Nifty view.') : pos === 'BELOW' ? (isCE ? 'writers winning. CE faces resistance.' : 'PE writers confident. Bullish Nifty.') : 'maximum war zone. Explosive move imminent.'}.</p>
                  <p>With <strong className="text-[#f0c040]">{result.dte} days to expiry</strong>: {result.dte <= 0 ? '⚠️ EXPIRY DAY — avoid OTM, only intrinsic value plays.' : result.dte <= 2 ? '⚠️ Near expiry — exit by 12:30 PM. No overnight holds.' : result.dte <= 4 ? 'Theta significant — plan exits early.' : 'Theta manageable — normal targets apply.'}</p>
                  {result.data.length < 6 && <p className="text-[#f0c040] text-xs font-mono">📊 Based on {result.data.length} days of data. God Particle gets sharper with 6 days — run Auto Fetch daily!</p>}
                </div>
              );
            })()}

            {/* Scenario Matrix */}
            {activeTab === 'matrix' && (
              <div>
                {/* Direction signal — ALWAYS shown, positive or negative */}
                {(() => {
                  const isCE = result.optType === 'CE';
                  const belowPCB = result.lc < result.pcb;
                  const rightOpt = isCE ? 'PE' : 'CE';
                  const gapStep = getGapStep(indexName);
                  const bestGap = scenarios.filter(s => !s.avoid && s.isBest)[0]?.gap ?? null;
                  const isFlatDay = bestGap !== null && Math.abs(bestGap) < gapStep;

                  if (belowPCB) {
                    // Wrong direction — hard stop
                    const signal = isCE ? 'bearish — CE is depreciating' : 'bullish — PE is depreciating';
                    return (
                      <div className="bg-[#ff4d6d]/15 border-2 border-[#ff4d6d]/60 rounded-xl px-4 py-3 text-xs font-mono text-[#ff4d6d] mb-3">
                        <div className="font-black text-sm mb-1">🚨 WRONG DIRECTION — Do NOT trade {result.optType} today</div>
                        <div className="text-[#ff4d6d]/80 mb-1">
                          Last close ₹{result.lc.toFixed(0)} is BELOW PCB ₹{result.pcb.toFixed(0)} — {signal}. Buying this option against the direction means your SL will be hit before T1.
                        </div>
                        <div className="text-[#ff4d6d] font-bold">→ Analyse the {result.strike} {rightOpt} instead. That is today's trade.</div>
                      </div>
                    );
                  }

                  // Correct direction — confirm + flat open caution
                  return (
                    <div className={`rounded-xl px-4 py-3 text-xs font-mono mb-3 ${isFlatDay ? 'bg-[#f0c040]/10 border-2 border-[#f0c040]/50' : 'bg-[#39d98a]/10 border border-[#39d98a]/30'}`}>
                      <div className={`font-black text-sm mb-1 ${isFlatDay ? 'text-[#f0c040]' : 'text-[#39d98a]'}`}>
                        {isFlatDay ? '⚠️ FLAT OPEN — Direction unclear, wait for confirmation' : `✅ CORRECT DIRECTION — Trade ${result.optType} today`}
                      </div>
                      <div className={`${isFlatDay ? 'text-[#f0c040]/80' : 'text-[#39d98a]/80'}`}>
                        {isFlatDay
                          ? `Last close ₹${result.lc.toFixed(0)} is above PCB ₹${result.pcb.toFixed(0)} — direction confirmed for ${result.optType}. BUT flat open means market can go either way. Wait for the 9:45 AM candle to close. If Nifty moves ${isCE ? 'up' : 'down'}, enter ${result.optType}. If it moves ${isCE ? 'down' : 'up'}, switch to ${rightOpt}.`
                          : `Last close ₹${result.lc.toFixed(0)} is above PCB ₹${result.pcb.toFixed(0)}. This ${result.optType} is gaining — the underlying is moving in your favour.`}
                      </div>
                      <div className={`mt-1 font-bold ${isFlatDay ? 'text-[#f0c040]' : 'text-[#39d98a]'}`}>
                        Trade ONE option per day only — never buy both CE and PE simultaneously.
                      </div>
                    </div>
                  );
                })()}
                {result.dte <= 2 && (
                  <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-xl px-4 py-2 text-xs font-mono text-[#ff4d6d] mb-3">
                    ⚠️ {result.dte}d to expiry — Theta aggressive. Exit by 12:30 PM. No overnight.
                  </div>
                )}
                <div className="bg-[#f0c040]/10 border border-[#f0c040]/30 rounded-xl px-4 py-2 text-xs font-mono text-[#f0c040] mb-3">
                  <div>⚛ PCB ₹{result.pcb.toFixed(1)} · SL = entry − {scenarios.find(s => !s.avoid)?.slPts ?? 30} pts · T1 = entry + {(scenarios.find(s => !s.avoid)?.slPts ?? 30) * 2} pts (2:1 R:R)</div>
                  <div className="mt-1 text-[#f0c040]/80">
                    📌 Entry rule: Place limit order at <span className="text-[#f0c040]">entryLow</span>. Enter when premium touches or dips to entryLow — do NOT chase if premium is above entryHigh. If premium never reaches entryLow, skip the trade.
                  </div>
                  {result.daysSinceClose > 0 && (
                    <span className="ml-2 text-[#ff8c42]">
                      · {result.daysSinceClose}d theta decay on open est
                    </span>
                  )}
                </div>
                {(() => {
                  const gapStep = getGapStep(indexName);
                  const bigGapThreshold = gapStep * 2;
                  const flatSc = scenarios.find(s => s.gap === 0);
                  const bestFav = scenarios.filter(s => s.isBest && !s.avoid && s.gap !== 0)[0];
                  if (bestFav && Math.abs(bestFav.gap) >= bigGapThreshold) {
                    return (
                      <div className="bg-[#ff8c42]/10 border border-[#ff8c42]/30 rounded-xl px-4 py-2 text-xs font-mono text-[#ff8c42] mb-3">
                        ⚠ Large gap scenario — wait 15 min at open. Gap fills are common. Enter only after a 15-min candle CLOSES inside the buy zone without recovering back.
                      </div>
                    );
                  }
                  return null;
                })()}
                <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-[#1e1e2e]">
                        {['Scenario', 'Opens Est', 'Buy Zone', 'To T1', 'Target 1', 'Target 2', 'SL'].map(h => (
                          <th key={h} className={`text-left px-3 py-3 uppercase tracking-widest font-normal ${h === 'To T1' ? 'text-[#a855f7]' : 'text-[#6b6b85]'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {scenarios.map((sc, i) => {
                        const toT1 = sc.avoid ? 0 : sc.target1 - sc.entryLow;
                        const is60 = !sc.avoid && toT1 >= 60;
                        const is40 = !sc.avoid && toT1 >= 40 && toT1 < 60;
                        return (
                          <tr key={i} className={`border-b border-[#1e1e2e]/50 transition-all ${sc.avoid ? 'opacity-40' : is60 ? 'bg-[#a855f7]/5' : sc.isFlat ? 'bg-[#f0c040]/5' : sc.isBest ? 'bg-[#39d98a]/5' : ''}`}>
                            <td className={`px-3 py-2.5 font-bold ${sc.gap > 0 ? 'text-[#39d98a]' : sc.gap < 0 ? 'text-[#ff4d6d]' : 'text-[#f0c040]'}`}>
                              {sc.label} {sc.isBest && !sc.avoid ? '⭐' : ''} {sc.avoid ? '🚫' : ''}
                            </td>
                            <td className="px-3 py-2.5 text-[#6b6b85]">{sc.avoid ? '—' : `₹${sc.openEst}`}</td>
                            <td className="px-3 py-2.5 text-[#f0c040]">{sc.avoid ? 'AVOID' : `₹${sc.entryLow}–${sc.entryHigh}`}</td>
                            <td className={`px-3 py-2.5 font-black ${sc.avoid ? 'text-[#3a3a4a]' : is60 ? 'text-[#a855f7]' : is40 ? 'text-[#f0c040]' : 'text-[#6b6b85]'}`}>
                              {sc.avoid ? '—' : `+${toT1}${is60 ? ' ✓' : ''}`}
                            </td>
                            <td className="px-3 py-2.5 text-[#39d98a]">{sc.avoid ? '—' : `₹${sc.target1}`}</td>
                            <td className="px-3 py-2.5 text-[#39d98a]">{sc.avoid ? '—' : `₹${sc.target2}`}</td>
                            <td className="px-3 py-2.5 text-[#ff4d6d]">{sc.avoid ? '—' : `₹${sc.sl}`}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 text-[10px] font-mono text-[#6b6b85] px-1">
                  <span className="text-[#a855f7]">■</span> To T1 ≥ 60 pts &nbsp;·&nbsp;
                  <span className="text-[#f0c040]">■</span> 40–59 pts &nbsp;·&nbsp;
                  SL = entryLow − {scenarios.find(s => !s.avoid)?.slPts ?? 30} pts &nbsp;·&nbsp;
                  Enter only if premium ≤ entryHigh — never chase above it
                </div>
              </div>
            )}

            {/* Plan B */}
            {activeTab === 'planb' && (() => {
              const validScenarios = scenarios.filter(s => !s.avoid);
              const sc = validScenarios.find(s => s.gap === planBGap) || validScenarios.find(s => s.gap === 0) || validScenarios[0];
              if (!sc) return <div className="text-[#6b6b85] font-mono text-sm p-4">Run analysis first.</div>;

              const { sl, entryLow, entryHigh, target1, target2, openEst } = sc;
              const confAbove = entryHigh + Math.round((target1 - entryHigh) * 0.25);
              const confBelow = Math.round(sl + (entryLow - sl) * 0.5);
              const decayPerSlot = result.dte === 0 ? 0.04 : result.dte === 1 ? 0.025 : 0.015;
              const dv = (val: number, slot: number) => Math.max(Math.round(val * Math.pow(1 - decayPerSlot, slot)), 1);

              const slots = [
                { time: '9:30 AM', slot: 0 },
                { time: '10:00 AM', slot: 1 },
                { time: '10:30 AM', slot: 2 },
                { time: '11:00 AM', slot: 3 },
                { time: '11:30 AM', slot: 4 },
                { time: '12:00 PM', slot: 5 },
              ];

              const minP = Math.max(0, sl - Math.round((target2 - sl) * 0.12));
              const maxP = target2 + Math.round((target2 - sl) * 0.08);
              const range = maxP - minP || 1;
              const bp = (p: number) => `${Math.min(100, Math.max(0, ((p - minP) / range) * 100)).toFixed(1)}%`;
              const hp = (from: number, to: number) => `${Math.max(2, ((to - from) / range) * 100).toFixed(1)}%`;

              return (
                <div>
                  {/* Scenario selector */}
                  <div className="mb-5">
                    <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Select Scenario</label>
                    <select
                      value={planBGap}
                      onChange={e => setPlanBGap(Number(e.target.value))}
                      className="bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]"
                    >
                      {validScenarios.map(s => (
                        <option key={s.gap} value={s.gap}>{s.label}</option>
                      ))}
                    </select>
                    <div className="text-[10px] font-mono text-[#6b6b85] mt-1">
                      Open Est: <span className="text-[#f0c040]">₹{openEst}</span> &nbsp;·&nbsp;
                      Buy Zone: <span className="text-[#f0c040]">₹{entryLow}–₹{entryHigh}</span> &nbsp;·&nbsp;
                      SL: <span className="text-[#ff4d6d]">₹{sl}</span> &nbsp;·&nbsp;
                      T1: <span className="text-[#39d98a]">₹{target1}</span> &nbsp;·&nbsp;
                      T2: <span className="text-[#39d98a]">₹{target2}</span>
                    </div>
                  </div>

                  {/* ── Breakout / Trending Day Protocol ── */}
                  {(() => {
                    const slPts = sc.slPts ?? 30;
                    const brkEntry  = sc.entryHigh;
                    const brkSL     = Math.max(brkEntry - slPts, 1);
                    const brkT1     = brkEntry + slPts * 2;
                    const brkT2     = brkEntry + Math.round(slPts * 3.5);
                    return (
                      <div className="mb-5 bg-[#ff8c42]/8 border border-[#ff8c42]/30 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-sm">🚀</span>
                          <span className="text-xs font-black font-mono text-[#ff8c42] uppercase tracking-widest">Trending Day — Breakout Entry Protocol</span>
                        </div>
                        <div className="text-[10px] font-mono text-[#ff8c42]/70 mb-3 leading-relaxed">
                          Use when premium <span className="text-[#ff8c42] font-bold">never touches ₹{sc.entryLow}</span> (buy zone) and keeps climbing from open.
                          Wait for 9:45 AM (first 15-min candle) to close. If it closes above ₹{sc.entryHigh}, this is a trending day.
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                          {[
                            { label: 'Breakout Entry', value: `₹${brkEntry}`, color: '#ff8c42' },
                            { label: `SL (−${slPts} pts)`, value: `₹${brkSL}`, color: '#ff4d6d' },
                            { label: `T1 (+${slPts * 2} pts)`, value: `₹${brkT1}`, color: '#39d98a' },
                            { label: `T2 (+${Math.round(slPts * 3.5)} pts)`, value: `₹${brkT2}`, color: '#39d98a' },
                          ].map(({ label, value, color }) => (
                            <div key={label} className="bg-[#0a0a0f] rounded-lg p-2.5 text-center">
                              <div className="text-[9px] font-mono text-[#6b6b85] uppercase mb-1">{label}</div>
                              <div className="text-sm font-black font-mono" style={{ color }}>{value}</div>
                            </div>
                          ))}
                        </div>
                        <div className="space-y-1 text-[10px] font-mono text-[#ff8c42]/70">
                          <div>📌 <span className="text-[#ff8c42]">Entry trigger:</span> Enter when 15-min candle (9:15–9:30) closes above ₹{sc.entryHigh} — don't buy mid-candle</div>
                          <div>⚠️ <span className="text-[#ff8c42]">Qty rule:</span> Use 50% of normal quantity — you're entering late, risk is higher</div>
                          <div>🕥 <span className="text-[#ff8c42]">Cutoff:</span> No breakout entries after 10:30 AM — momentum trades need time to work</div>
                          <div>❌ <span className="text-[#ff8c42]">Skip if:</span> Premium is already above ₹{brkT1} at open (you've missed it entirely)</div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                    {/* Price Ladder */}
                    <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
                      <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-3">📊 Price Ladder</div>
                      <div className="relative bg-[#0a0a0f] rounded-xl overflow-hidden" style={{ height: '320px' }}>

                        {/* Danger zone */}
                        <div className="absolute left-0 right-0 bg-[#ff4d6d]/15" style={{ bottom: 0, height: hp(minP, sl) }}>
                          <span className="text-[9px] font-mono text-[#ff4d6d] px-2 absolute bottom-1">DANGER</span>
                        </div>

                        {/* Wait zone */}
                        <div className="absolute left-0 right-0 bg-[#ff8c42]/8" style={{ bottom: hp(minP, sl), height: hp(sl, entryLow) }} />

                        {/* Buy zone */}
                        <div className="absolute left-0 right-0 bg-[#39d98a]/20 border-y border-[#39d98a]/40 flex items-center justify-center"
                          style={{ bottom: bp(entryLow), height: hp(entryLow, entryHigh) }}>
                          <span className="text-[10px] font-black text-[#39d98a]">✓ BUY ZONE</span>
                        </div>

                        {/* Neutral zone */}
                        <div className="absolute left-0 right-0 bg-[#f0c040]/5" style={{ bottom: bp(entryHigh), height: hp(entryHigh, target1) }} />

                        {/* Target zones */}
                        <div className="absolute left-0 right-0 bg-[#39d98a]/8" style={{ bottom: bp(target1), height: hp(target1, target2) }} />
                        <div className="absolute left-0 right-0 bg-[#39d98a]/15" style={{ bottom: bp(target2), top: 0 }} />

                        {/* Momentum confirmation band */}
                        <div className="absolute left-0 right-0 flex items-center" style={{ bottom: bp(confAbove) }}>
                          <div className="flex-1 border-t-2 border-dashed border-[#ff8c42]" />
                          <span className="text-[8px] font-black font-mono bg-[#ff8c42]/20 text-[#ff8c42] px-1.5 rounded shrink-0">MOMENTUM ₹{confAbove}</span>
                        </div>

                        {/* Recovery confirmation band */}
                        <div className="absolute left-0 right-0 flex items-center" style={{ bottom: bp(confBelow) }}>
                          <div className="flex-1 border-t-2 border-dashed border-[#a78bfa]" />
                          <span className="text-[8px] font-black font-mono bg-[#a78bfa]/20 text-[#a78bfa] px-1.5 rounded shrink-0">RECOVERY ₹{confBelow}</span>
                        </div>

                        {/* Price lines */}
                        {[
                          { price: sl, label: `SL ₹${sl}`, color: '#ff4d6d' },
                          { price: entryLow, label: `₹${entryLow}`, color: '#f0c040' },
                          { price: entryHigh, label: `₹${entryHigh}`, color: '#f0c040' },
                          { price: target1, label: `T1 ₹${target1}`, color: '#39d98a' },
                          { price: target2, label: `T2 ₹${target2}`, color: '#39d98a' },
                        ].map(({ price, label, color }) => (
                          <div key={price} className="absolute left-0 right-0 flex items-center" style={{ bottom: bp(price) }}>
                            <div className="flex-1 border-t border-dashed" style={{ borderColor: color + '80' }} />
                            <span className="text-[9px] font-mono px-1.5 shrink-0" style={{ color }}>{label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Time slot cards */}
                    <div className="space-y-2">
                      <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">⏰ Dynamic Entry by Time</div>
                      {slots.map(({ time, slot }) => {
                        const eL = dv(entryLow, slot);
                        const eH = dv(entryHigh, slot);
                        const dSl = dv(sl, slot);
                        const dT1 = dv(target1, slot);
                        const dT2 = dv(target2, slot);
                        const dConf = dv(confAbove, slot);
                        const dRecov = dv(confBelow, slot);
                        const slPtsSlot = sc.slPts ?? 30;
                        const brkSLSlot = Math.max(eH - slPtsSlot, 1);
                        const brkT1Slot = eH + slPtsSlot * 2;
                        return (
                          <div key={time} className="bg-[#16161f] border border-[#1e1e2e] rounded-xl p-3">
                            <div className="text-xs font-black text-[#f0c040] mb-2">{time}</div>
                            <div className="space-y-1.5">
                              <div className="flex items-start gap-2">
                                <span className="text-[10px] text-[#ff8c42] mt-0.5 shrink-0 font-mono">🚀</span>
                                <div className="text-[10px] font-mono text-[#6b6b85]">
                                  Above <span className="text-[#e8e8f0]">₹{eH}</span> (trending)
                                  <span className="text-[#ff8c42]"> → Breakout Entry · 50% Qty · SL ₹{brkSLSlot} · T1 ₹{brkT1Slot}</span>
                                  {slot === 0 && (
                                    <div className="mt-1 bg-[#ff8c42]/10 border border-[#ff8c42]/30 rounded px-1.5 py-1 text-[9px] text-[#ff8c42]">
                                      ⚡ Wait for 9:45 AM 15-min candle close above ₹{eH} before entering
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-start gap-2 bg-[#39d98a]/10 rounded-lg px-2 py-1.5">
                                <span className="text-[10px] text-[#39d98a] mt-0.5 shrink-0 font-mono">✓</span>
                                <span className="text-[10px] font-mono">
                                  <span className="text-[#39d98a] font-bold">₹{eL}–₹{eH}</span>
                                  <span className="text-[#39d98a]"> → IDEAL ENTRY · Full Qty · SL ₹{dSl} · T1 ₹{dT1} · T2 ₹{dT2}</span>
                                </span>
                              </div>
                              <div className="flex items-start gap-2">
                                <span className="text-[10px] text-[#ff4d6d] mt-0.5 shrink-0 font-mono">▼</span>
                                <div className="text-[10px] font-mono text-[#6b6b85]">
                                  Below <span className="text-[#e8e8f0]">₹{eL}</span>
                                  <span className="text-[#ff4d6d]"> → WAIT / SKIP</span>
                                  <div className="mt-1 bg-[#a78bfa]/10 border border-[#a78bfa]/30 rounded px-1.5 py-1 text-[9px] text-[#a78bfa]">
                                    🔄 Watch <span className="font-black">₹{dRecov}</span> — if price bounces back above this, reversal forming. Wait for zone retest before entering.
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── FORECAST TAB ── */}
            {activeTab === 'forecast' && (() => {
              // spotClose and vix are fetched fresh inside generate() to match Dashboard exactly.
              // We keep these as display-only fallbacks for the input placeholder.
              const spotClose = result.spotClose ?? 0;
              const vix = result.vix ?? 0;

              async function generate() {
                const open = parseFloat(forecastOpen);
                if (!open || open <= 0) return;
                setGenerating(true);
                setForecastError('');
                setForecast(null);
                try {
                  const historicalSpotCloses = rowsData
                    .map((r: any) => r.strike_data?.['_spot_close'] ?? 0)
                    .filter((c: number) => c > 0);
                  const { forecast: f, fiiDate: fd } = await Promise.race([
                    generateIndexForecast(indexName, open, chainData, spotClose, vix, historicalSpotCloses),
                    new Promise<never>((_, rej) =>
                      setTimeout(() => rej(new Error('Forecast timed out — Supabase is slow, please try again')), 22000)
                    ),
                  ]);
                  setFiiDate(fd);
                  setForecast(f);
                } catch (err: any) {
                  setForecastError(err?.message ?? 'Failed to generate forecast — please try again');
                } finally {
                  setGenerating(false);
                }
              }

              // SVG chart constants
              const SVG_W = 700;
              const SVG_H = 380;
              const PAD_L = 80;
              const PAD_R = 20;
              const PAD_T = 30;
              const PAD_B = 40;
              const chartW = SVG_W - PAD_L - PAD_R;
              const chartH = SVG_H - PAD_T - PAD_B;
              const TOTAL_MIN = 375; // 9:15 to 15:30

              const xOf = (min: number) => PAD_L + (min / TOTAL_MIN) * chartW;
              const times = [0, 30, 105, 195, 285, 375];
              const timeLabels = ['9:15', '9:45', '11:00', '12:30', '2:00', '3:30'];

              // ── Option premium path using BS model ──
              // For each checkpoint: DTE decreases as the day progresses.
              // At open (0 min) DTE is full; at close (375 min) DTE = DTE - 1.
              const optionIV = (() => {
                const rawIV = result.latestIV ?? 0;
                if (rawIV > 0) return rawIV / 100;
                // back-calc from last close if no chain IV
                const lc = result.lc ?? 0;
                const spotClose = result.spotClose ?? 0;
                const strike = result.strike ?? 0;
                const dte = result.dte ?? 1;
                if (lc > 0 && spotClose > 0 && strike > 0) {
                  let lo = 0.01, hi = 5.0;
                  for (let i = 0; i < 60; i++) {
                    const mid = (lo + hi) / 2;
                    const p = bsPrice(spotClose, strike, dte / 365, mid, result.optType === 'CE' ? 'CE' : 'PE');
                    if (Math.abs(p - lc) < 0.05) return mid;
                    if (p < lc) lo = mid; else hi = mid;
                  }
                  return (lo + hi) / 2;
                }
                return 0.15;
              })();

              // Find best matching scenario for targets (closest gap to actual forecastOpen gap)
              const actualGap = forecastOpen ? Math.round(parseFloat(forecastOpen) - (result.spotClose ?? 0)) : 0;
              const bestSc = scenarios.length > 0
                ? scenarios.reduce((best: any, sc: any) =>
                    Math.abs(sc.gap - actualGap) < Math.abs(best.gap - actualGap) ? sc : best
                  , scenarios[0])
                : null;

              let optSvgContent: JSX.Element | null = null;

              // Build chart when forecast ready
              let svgContent: JSX.Element | null = null;
              if (forecast) {
                // Zoom Y-axis to the forecast path — don't include Gamma Walls which squish the line
                const pathPrices = [...forecast.points.map(p => p.high), ...forecast.points.map(p => p.low)];
                const pad = Math.max(forecast.dailyRange * 0.15, 30);
                const priceMin = Math.min(...pathPrices) - pad;
                const priceMax = Math.max(...pathPrices) + pad;
                const priceRange = priceMax - priceMin || 1;
                const yOf = (p: number) => PAD_T + ((priceMax - p) / priceRange) * chartH;

                const pts = forecast.points;

                // Polygon for uncertainty band
                const topPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.minuteOffset).toFixed(1)},${yOf(p.high).toFixed(1)}`).join(' ');
                const botPath = [...pts].reverse().map((p, i) => `L${xOf(p.minuteOffset).toFixed(1)},${yOf(p.low).toFixed(1)}`).join(' ');
                const bandPath = `${topPath} ${botPath} Z`;

                // Central path
                const centralPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.minuteOffset).toFixed(1)},${yOf(p.central).toFixed(1)}`).join(' ');

                const biasCol = forecast.bias === 'BEARISH' ? '#ff4d6d' : forecast.bias === 'BULLISH' ? '#39d98a' : '#f0c040';

                svgContent = (
                  <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full" style={{ maxHeight: 380 }}>
                    {/* Grid lines */}
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

                    {/* Key level lines */}
                    {forecast.levels.map((lv) => {
                      const y = yOf(lv.price);
                      if (y < PAD_T || y > PAD_T + chartH) return null;
                      return (
                        <g key={lv.label}>
                          <line x1={PAD_L} y1={y} x2={SVG_W - PAD_R} y2={y} stroke={lv.color} strokeWidth="1.5" strokeDasharray={lv.type === 'open' ? '4,3' : '6,3'} opacity="0.8" />
                          <text x={SVG_W - PAD_R + 2} y={y + 4} fontSize="8" fill={lv.color} opacity="0.9">{lv.price.toLocaleString('en-IN')}</text>
                        </g>
                      );
                    })}

                    {/* Uncertainty band */}
                    <path d={bandPath} fill={biasCol} fillOpacity="0.08" />

                    {/* Central predicted path */}
                    <path d={centralPath} fill="none" stroke={biasCol} strokeWidth="2.5" strokeLinejoin="round" />

                    {/* Dots + time labels */}
                    {pts.map((p) => {
                      const x = xOf(p.minuteOffset);
                      const y = yOf(p.central);
                      return (
                        <g key={p.timeLabel}>
                          <circle cx={x} cy={y} r="5" fill="#0a0a0f" stroke={biasCol} strokeWidth="2" />
                          <text x={x} y={SVG_H - PAD_B + 14} textAnchor="middle" fontSize="9" fill="#6b6b85">{p.timeLabel.split(' ')[0]}</text>
                          <text x={x} y={y - 10} textAnchor="middle" fontSize="9" fill={biasCol} fontWeight="bold">{p.central.toLocaleString('en-IN')}</text>
                        </g>
                      );
                    })}

                    {/* X-axis line */}
                    <line x1={PAD_L} y1={PAD_T + chartH} x2={SVG_W - PAD_R} y2={PAD_T + chartH} stroke="#1e1e2e" strokeWidth="1" />
                  </svg>
                );

                // ── Option premium chart ──
                const strike = result.strike ?? 0;
                const dte = result.dte ?? 1;
                const isCE = result.optType === 'CE';
                const optCol = isCE ? '#39d98a' : '#ff4d6d';
                const TOTAL_MIN = 375;

                // Compute option price at each checkpoint
                interface OptPt { minuteOffset: number; timeLabel: string; central: number; high: number; low: number; }
                const optPts: OptPt[] = forecast.points.map(p => {
                  const dteRemaining = Math.max(dte - p.minuteOffset / TOTAL_MIN, 0.001);
                  const T = dteRemaining / 365;
                  const optC = bsPrice(p.central, strike, T, optionIV, isCE ? 'CE' : 'PE');
                  const optH = bsPrice(p.high,    strike, T, optionIV, isCE ? 'CE' : 'PE');
                  const optL = bsPrice(p.low,     strike, T, optionIV, isCE ? 'CE' : 'PE');
                  return {
                    minuteOffset: p.minuteOffset,
                    timeLabel: p.timeLabel,
                    central: Math.round(optC),
                    high: Math.round(Math.max(optH, optL)),
                    low: Math.round(Math.min(optH, optL)),
                  };
                });

                // Index-path-derived option levels (not scenario matrix)
                // Entry = option price when Nifty at morningDipTarget (the dip buy level)
                // T1 = option price when Nifty at nearResistance (first take profit)
                // T2 = option price when Nifty at eodTarget
                // SL = option price when Nifty breaks 1 strike below nearSupport (CE) or above nearResistance (PE)
                const strikeGapIdx = getGapStep(indexName);
                const dipBuyOptPrice = Math.round(bsPrice(forecast.morningDipTarget, strike, Math.max(dte - 0.05, 0.001) / 365, optionIV, isCE ? 'CE' : 'PE'));
                const t1NiftyLevel = isCE ? forecast.nearResistance : forecast.nearSupport;
                const t1OptPrice = Math.round(bsPrice(t1NiftyLevel, strike, Math.max(dte - 0.35, 0.001) / 365, optionIV, isCE ? 'CE' : 'PE'));
                const eodNifty = Math.round(parseFloat(forecastOpen) + forecast.mpGravity * (forecast.maxPain - parseFloat(forecastOpen)));
                const blendedEod = forecast.convictionScore > 20
                  ? Math.round(eodNifty * 0.6 + forecast.nearResistance * 0.4)
                  : forecast.convictionScore < -20
                  ? Math.round(eodNifty * 0.6 + forecast.nearSupport * 0.4)
                  : eodNifty;
                const t2OptPrice = Math.round(bsPrice(isCE ? Math.max(blendedEod, t1NiftyLevel + strikeGapIdx) : Math.min(blendedEod, t1NiftyLevel - strikeGapIdx), strike, Math.max(dte - 0.8, 0.001) / 365, optionIV, isCE ? 'CE' : 'PE'));
                const slNiftyLevel = isCE ? forecast.nearSupport - strikeGapIdx : forecast.nearResistance + strikeGapIdx;
                const slOptPrice = Math.round(bsPrice(slNiftyLevel, strike, Math.max(dte - 0.2, 0.001) / 365, optionIV, isCE ? 'CE' : 'PE'));
                const targetLines = [
                  { price: Math.max(t2OptPrice, t1OptPrice + 1), label: 'T2', color: '#f0c040', dash: '6,3' },
                  { price: t1OptPrice, label: 'T1', color: '#39d98a', dash: '6,3' },
                  { price: dipBuyOptPrice, label: 'Entry', color: '#4d9fff', dash: '4,3' },
                  { price: Math.min(slOptPrice, dipBuyOptPrice - 1), label: 'SL', color: '#ff4d6d', dash: '4,3' },
                ];

                // Y scale for option chart
                const optLevels: number[] = [
                  ...optPts.map(p => p.high), ...optPts.map(p => p.low),
                  Math.max(t2OptPrice, t1OptPrice + 1), t1OptPrice, dipBuyOptPrice, Math.min(slOptPrice, dipBuyOptPrice - 1),
                ];
                const optMin = Math.min(...optLevels) - 10;
                const optMax = Math.max(...optLevels) + 10;
                const optRange = optMax - optMin || 1;
                const yOpt = (p: number) => PAD_T + ((optMax - p) / optRange) * chartH;
                const xOpt = (min: number) => PAD_L + (min / TOTAL_MIN) * chartW;

                const optTopPath = optPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOpt(p.minuteOffset).toFixed(1)},${yOpt(p.high).toFixed(1)}`).join(' ');
                const optBotPath = [...optPts].reverse().map(p => `L${xOpt(p.minuteOffset).toFixed(1)},${yOpt(p.low).toFixed(1)}`).join(' ');
                const optBandPath = `${optTopPath} ${optBotPath} Z`;
                const optCentralPath = optPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOpt(p.minuteOffset).toFixed(1)},${yOpt(p.central).toFixed(1)}`).join(' ');

                optSvgContent = (
                  <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full" style={{ maxHeight: 380 }}>
                    {[0, 0.25, 0.5, 0.75, 1].map(f => {
                      const p = optMin + f * optRange;
                      const y = yOpt(p);
                      return (
                        <g key={f}>
                          <line x1={PAD_L} y1={y} x2={SVG_W - PAD_R} y2={y} stroke="#1e1e2e" strokeWidth="1" />
                          <text x={PAD_L - 5} y={y + 4} textAnchor="end" fontSize="9" fill="#6b6b85">{Math.round(p)}</text>
                        </g>
                      );
                    })}
                    {targetLines.map(tl => {
                      const y = yOpt(tl.price);
                      if (y < PAD_T || y > PAD_T + chartH) return null;
                      return (
                        <g key={tl.label}>
                          <line x1={PAD_L} y1={y} x2={SVG_W - PAD_R} y2={y} stroke={tl.color} strokeWidth="1.5" strokeDasharray={tl.dash} opacity="0.9" />
                          <text x={SVG_W - PAD_R + 2} y={y + 4} fontSize="8" fill={tl.color} opacity="0.9">{tl.label} {tl.price}</text>
                        </g>
                      );
                    })}
                    <path d={optBandPath} fill={optCol} fillOpacity="0.08" />
                    <path d={optCentralPath} fill="none" stroke={optCol} strokeWidth="2.5" strokeLinejoin="round" />
                    {optPts.map(p => {
                      const x = xOpt(p.minuteOffset);
                      const y = yOpt(p.central);
                      return (
                        <g key={p.timeLabel}>
                          <circle cx={x} cy={y} r="5" fill="#0a0a0f" stroke={optCol} strokeWidth="2" />
                          <text x={x} y={SVG_H - PAD_B + 14} textAnchor="middle" fontSize="9" fill="#6b6b85">{p.timeLabel.split(' ')[0]}</text>
                          <text x={x} y={y - 10} textAnchor="middle" fontSize="9" fill={optCol} fontWeight="bold">{p.central}</text>
                        </g>
                      );
                    })}
                    <line x1={PAD_L} y1={PAD_T + chartH} x2={SVG_W - PAD_R} y2={PAD_T + chartH} stroke="#1e1e2e" strokeWidth="1" />
                  </svg>
                );
              }

              return (
                <div>
                  {/* Input row */}
                  <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 mb-4">
                    <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-3">🔮 Intraday Index Forecast</div>
                    <div className="flex gap-3 items-end flex-wrap">
                      <div className="flex-1 min-w-[160px]">
                        <label className="block text-[10px] font-mono text-[#6b6b85] mb-1">INDEX OPEN PRICE</label>
                        <input
                          type="number"
                          value={forecastOpen}
                          onChange={e => { setForecastOpen(e.target.value); setForecast(null); setForecastError(''); }}
                          placeholder={spotClose > 0 ? `e.g. ${Math.round(spotClose)}` : 'Enter open price'}
                          className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#a855f7]"
                        />
                      </div>
                      <button
                        onClick={generate}
                        disabled={!forecastOpen || generating}
                        className="px-5 py-2 rounded-lg text-sm font-black font-mono bg-[#a855f7] text-white disabled:opacity-40 hover:bg-[#9333ea] transition-all"
                      >
                        {generating ? '⏳ Generating...' : 'Generate Forecast'}
                      </button>
                    </div>
                    {spotClose > 0 && (
                      <div className="mt-2 text-[10px] font-mono text-[#6b6b85]">
                        Prev close: <span className="text-[#f0c040]">{spotClose.toLocaleString('en-IN')}</span>
                        {forecastOpen && ` · Gap: ${parseFloat(forecastOpen) > spotClose ? '+' : ''}${Math.round(parseFloat(forecastOpen) - spotClose)} pts`}
                      </div>
                    )}
                  </div>

                  {forecastError && (
                    <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-xl px-4 py-3 text-xs font-mono text-[#ff4d6d] flex items-start gap-2">
                      <span>⚠</span>
                      <div>
                        <div className="font-bold mb-1">Forecast failed</div>
                        <div className="opacity-80">{forecastError}</div>
                        <button onClick={generate} className="mt-2 underline hover:no-underline">Tap to retry</button>
                      </div>
                    </div>
                  )}

                  {forecast && (
                    <>
                      {/* Bias banner */}
                      <div className={`rounded-xl px-4 py-3 mb-4 text-xs font-mono font-bold ${
                        forecast.bias === 'BEARISH' ? 'bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 text-[#ff4d6d]'
                        : forecast.bias === 'BULLISH' ? 'bg-[#39d98a]/10 border border-[#39d98a]/30 text-[#39d98a]'
                        : 'bg-[#f0c040]/10 border border-[#f0c040]/30 text-[#f0c040]'
                      }`}>
                        <div className="text-sm mb-1">
                          {forecast.bias === 'BEARISH' ? '📉 BEARISH BIAS' : forecast.bias === 'BULLISH' ? '📈 BULLISH BIAS' : '↔️ NEUTRAL — Range Bound'}
                        </div>
                        <div className="font-normal opacity-80">{forecast.summary}</div>
                        <div className="mt-1 text-[10px] opacity-70">
                          PCR: <strong>{forecast.pcr.toFixed(2)}</strong> · Signal: <strong>{forecast.convictionScore > 0 ? '+' : ''}{forecast.convictionScore}</strong>{forecast.sectorSignal !== 0 && <span> · Sector: <strong style={{ color: forecast.sectorSignal > 0 ? '#39d98a' : '#ff4d6d' }}>{forecast.sectorSignal > 0 ? '+' : ''}{forecast.sectorSignal}</strong></span>}{forecast.oiVelocitySignal !== 0 && <span> · OI Flow: <strong style={{ color: forecast.oiVelocitySignal > 0 ? '#39d98a' : '#ff4d6d' }}>{forecast.oiVelocitySignal > 0 ? '+' : ''}{forecast.oiVelocitySignal} {forecast.oiVelocitySignal > 5 ? '🟢 puts' : forecast.oiVelocitySignal < -5 ? '🔴 calls' : '⚪'}</strong></span>}{forecast.fiiSignal !== 0 && <span> · FII{fiiDate ? <span className="opacity-60"> ({fiiDate.slice(5).replace('-', '/')})</span> : ''}: <strong style={{ color: forecast.fiiSignal > 0 ? '#39d98a' : '#ff4d6d' }}>{forecast.fiiSignal > 0 ? '+' : ''}{forecast.fiiSignal} {forecast.fiiSignal > 5 ? '🐂' : forecast.fiiSignal < -5 ? '🐻' : ''}</strong></span>}{forecast.fiiSignal === 0 && <span className="opacity-60"> · FII: no data</span>}{forecast.gapSignal !== 0 && <span> · Gap: <strong style={{ color: forecast.gapSignal > 0 ? '#39d98a' : '#ff4d6d' }}>{forecast.gapSignal > 0 ? '+' : ''}{forecast.gapSignal} {forecast.gapPts > 0 ? '⬆' : '⬇'}{Math.abs(forecast.gapPts)}pts</strong></span>} · Gravity: <strong>{Math.round(forecast.mpGravity * 100)}%</strong> · DTE: {forecast.dte}d · Near support: <strong>{forecast.nearSupport.toLocaleString('en-IN')}</strong> · Near resistance: <strong>{forecast.nearResistance.toLocaleString('en-IN')}</strong>
                        </div>
                      </div>

                      {/* IV Crush warning */}
                      {forecast.ivCrushWarning && (
                        <div className="bg-[#f0c040]/10 border border-[#f0c040]/30 rounded-xl px-4 py-3 mb-4 text-xs font-mono text-[#f0c040]">
                          {forecast.ivCrushWarning}
                        </div>
                      )}

                      {/* Dual charts: Index + Option Premium side by side on wide, stacked on mobile */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        <div className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl p-3 overflow-x-auto">
                          <div className="text-[10px] font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                            📈 {INDEX_DISPLAY[indexName] ?? indexName} Index Path
                          </div>
                          {svgContent}
                        </div>
                        <div className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl p-3 overflow-x-auto">
                          <div className="text-[10px] font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                            🎯 {result.strike} {result.optType} Premium Path · IV {Math.round(optionIV * 100)}%
                          </div>
                          {optSvgContent}
                          {forecast && (() => {
                            const _strike = result.strike ?? 0;
                            const _dte = result.dte ?? 1;
                            const _isCE = result.optType === 'CE';
                            const _strikeGapIdx = getGapStep(indexName);
                            const _dipBuyOptPrice = Math.round(bsPrice(forecast.morningDipTarget, _strike, Math.max(_dte - 0.05, 0.001) / 365, optionIV, _isCE ? 'CE' : 'PE'));
                            // T1 = EOD target (realistic — where market should settle)
                            const _t1NiftyLevel = forecast.eodTarget;
                            // T2 = near resistance wall (BULLISH) or near support wall (BEARISH)
                            // This is where the market tests if momentum continues through EOD
                            const _t2NiftyLevel = _isCE ? forecast.nearResistance : forecast.nearSupport;
                            const _t1OptPrice = Math.round(bsPrice(_t1NiftyLevel, _strike, Math.max(_dte - 0.35, 0.001) / 365, optionIV, _isCE ? 'CE' : 'PE'));
                            const _t2OptPrice = Math.round(bsPrice(_t2NiftyLevel, _strike, Math.max(_dte - 0.8, 0.001) / 365, optionIV, _isCE ? 'CE' : 'PE'));
                            const _slNiftyLevel = _isCE ? forecast.nearSupport - _strikeGapIdx : forecast.nearResistance + _strikeGapIdx;
                            const _slOptPriceBS = Math.round(bsPrice(_slNiftyLevel, _strike, Math.max(_dte - 0.2, 0.001) / 365, optionIV, _isCE ? 'CE' : 'PE'));
                            const _slOptPrice = Math.min(_slOptPriceBS, Math.round(_dipBuyOptPrice * 0.83));
                            return (
                              <div className="flex flex-wrap gap-3 mt-2 px-1">
                                {[
                                  { label: `T2 ${Math.max(_t2OptPrice, _t1OptPrice + 1)}`, color: '#f0c040' },
                                  { label: `T1 ${_t1OptPrice}`, color: '#39d98a' },
                                  { label: `Entry ${_dipBuyOptPrice}`, color: '#4d9fff' },
                                  { label: `SL ${Math.min(_slOptPrice, _dipBuyOptPrice - 1)}`, color: '#ff4d6d' },
                                ].map(l => (
                                  <div key={l.label} className="flex items-center gap-1 text-[10px] font-mono">
                                    <div className="w-3 h-0.5" style={{ background: l.color }} />
                                    <span style={{ color: l.color }}>{l.label}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Legend */}
                      <div className="flex flex-wrap gap-3 mb-4 px-1">
                        {forecast.levels.map(lv => (
                          <div key={lv.label} className="flex items-center gap-1.5 text-[10px] font-mono">
                            <div className="w-4 h-0.5" style={{ background: lv.color }} />
                            <span style={{ color: lv.color }}>{lv.label}</span>
                          </div>
                        ))}
                      </div>

                      {/* Key levels table */}
                      <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden mb-4">
                        <table className="w-full text-xs font-mono">
                          <thead>
                            <tr className="border-b border-[#1e1e2e]">
                              {['Time', 'Predicted Level', 'Range', 'What to Watch'].map(h => (
                                <th key={h} className="text-left px-3 py-2.5 text-[#6b6b85] uppercase tracking-widest font-normal text-[10px]">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {forecast.points.map((p, i) => (
                              <tr key={i} className="border-b border-[#1e1e2e]/50">
                                <td className="px-3 py-2 text-[#f0c040] font-bold">{p.timeLabel}</td>
                                <td className="px-3 py-2 text-[#e8e8f0] font-black">{p.central.toLocaleString('en-IN')}</td>
                                <td className="px-3 py-2 text-[#6b6b85]">{p.low.toLocaleString('en-IN')} – {p.high.toLocaleString('en-IN')}</td>
                                <td className="px-3 py-2 text-[#6b6b85]">{p.event}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Key levels quick ref */}
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: 'CE Gamma Wall', val: forecast.ceWall, sub: 'Resistance — sellers defend', color: '#ff4d6d' },
                          { label: 'Max Pain', val: forecast.maxPain, sub: 'Gravity center — EOD target', color: '#f0c040' },
                          { label: 'PE Gamma Wall', val: forecast.peWall, sub: 'Support — buyers defend', color: '#39d98a' },
                        ].map(({ label, val, sub, color }) => (
                          <div key={label} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-3 text-center">
                            <div className="text-[9px] font-mono text-[#6b6b85] uppercase mb-1">{label}</div>
                            <div className="text-lg font-black font-mono" style={{ color }}>{val.toLocaleString('en-IN')}</div>
                            <div className="text-[9px] font-mono text-[#6b6b85] mt-0.5">{sub}</div>
                          </div>
                        ))}
                      </div>

                      {/* ── TRADE PLAN (plain English) ── */}
                      {(() => {
                        const _strike = result.strike ?? 0;
                        const _dte = result.dte ?? 1;
                        const _isCE = result.optType === 'CE';
                        const _strikeGapIdx = getGapStep(indexName);
                        const _open = parseFloat(forecastOpen);
                        const _openOptPrice = Math.round(bsPrice(_open, _strike, _dte / 365, optionIV, _isCE ? 'CE' : 'PE'));
                        const _dipBuyOptPrice = Math.round(bsPrice(forecast.morningDipTarget, _strike, Math.max(_dte - 0.05, 0.001) / 365, optionIV, _isCE ? 'CE' : 'PE'));
                        // T1 = EOD target (the realistic, confirmed forecast level)
                        const _t1NiftyLevel = forecast.eodTarget;
                        // T2 = near wall (resistance for CE, support for PE)
                        // where market tests if the directional momentum continues
                        const _t2NiftyLevel = _isCE ? forecast.nearResistance : forecast.nearSupport;
                        const _t1OptPrice = Math.round(bsPrice(_t1NiftyLevel, _strike, Math.max(_dte - 0.35, 0.001) / 365, optionIV, _isCE ? 'CE' : 'PE'));
                        const _t2OptPrice = Math.round(bsPrice(_t2NiftyLevel, _strike, Math.max(_dte - 0.8, 0.001) / 365, optionIV, _isCE ? 'CE' : 'PE'));
                        const _slNiftyLevel = _isCE ? forecast.nearSupport - _strikeGapIdx : forecast.nearResistance + _strikeGapIdx;
                        const _slOptPriceBS = Math.round(bsPrice(_slNiftyLevel, _strike, Math.max(_dte - 0.2, 0.001) / 365, optionIV, _isCE ? 'CE' : 'PE'));
                        // SL must be at least 17% below entry (prevents theta-triggered stops)
                        const _slOptPrice = Math.min(_slOptPriceBS, Math.round(_dipBuyOptPrice * 0.83), _dipBuyOptPrice - 1);

                        // NEUTRAL: no directional edge — show range-play card instead
                        if (Math.abs(forecast.convictionScore) <= 15) {
                          return (
                            <div className="bg-[#0d0d14] border border-[#f0c040]/30 rounded-xl p-4 mt-4">
                              <div className="text-[10px] font-black uppercase tracking-widest text-[#f0c040] mb-3">
                                ⚠ NO CLEAR EDGE TODAY — Skip Directional Bets
                              </div>
                              <div className="space-y-2 text-xs font-mono text-[#6b6b85]">
                                <div>
                                  <span className="text-[#e8e8f0] font-black">Conviction: </span>
                                  <span className="text-[#f0c040]">{forecast.convictionScore}</span>
                                  <span> — mixed signals (PCR {forecast.pcr.toFixed(2)}, Max Pain gravity weak)</span>
                                </div>
                                <div className="pt-1 border-t border-[#1e1e2e]">
                                  <div className="text-[#e8e8f0] font-black mb-1">Range to watch today:</div>
                                  <div>Support: <span className="text-[#4d9fff] font-black">{forecast.nearSupport.toLocaleString('en-IN')}</span> · Resistance: <span className="text-[#ff8c42] font-black">{forecast.nearResistance.toLocaleString('en-IN')}</span></div>
                                </div>
                                <div className="pt-1 border-t border-[#1e1e2e] space-y-1">
                                  <div>If Nifty breaks <span className="text-[#ff8c42] font-black">above {forecast.nearResistance.toLocaleString('en-IN')}</span> with a confirmed candle → CE entry, SL below {forecast.nearResistance.toLocaleString('en-IN')}</div>
                                  <div>If Nifty breaks <span className="text-[#4d9fff] font-black">below {forecast.nearSupport.toLocaleString('en-IN')}</span> with a confirmed candle → PE entry, SL above {forecast.nearSupport.toLocaleString('en-IN')}</div>
                                  <div className="text-[#6b6b85] pt-0.5">Without a breakout, both CE and PE bleed time value. Wait.</div>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-4 mt-4">
                            <div className="text-[10px] font-black uppercase tracking-widest text-[#f0c040] mb-3">
                              📋 Trade Plan — {result.strike} {result.optType} · {forecast.bias} (conviction {forecast.convictionScore > 0 ? '+' : ''}{forecast.convictionScore})
                            </div>
                            <div className="space-y-3 text-xs font-mono">
                              <div className="flex gap-3">
                                <div className="w-6 h-6 rounded-full bg-[#ff4d6d]/15 flex items-center justify-center shrink-0 text-[10px] text-[#ff4d6d] font-black">1</div>
                                <div>
                                  <div className="text-[#e8e8f0] font-black mb-0.5">Wait — do NOT buy at 9:15 AM open (~₹{_openOptPrice})</div>
                                  <div className="text-[#6b6b85]">Opening price is volatile. Wait for the {_isCE ? 'morning dip' : 'morning pop'}.</div>
                                </div>
                              </div>
                              <div className="flex gap-3">
                                <div className="w-6 h-6 rounded-full bg-[#4d9fff]/15 flex items-center justify-center shrink-0 text-[10px] text-[#4d9fff] font-black">2</div>
                                <div>
                                  <div className="text-[#e8e8f0] font-black mb-0.5">
                                    {_isCE ? `Buy when Nifty dips to ~${forecast.morningDipTarget.toLocaleString('en-IN')}` : `Buy when Nifty pops to ~${forecast.morningDipTarget.toLocaleString('en-IN')}`}
                                  </div>
                                  <div className="text-[#4d9fff]">
                                    BUY {result.strike} {result.optType} at ₹{_dipBuyOptPrice} ({_isCE ? 'near support — cheapest point' : 'near resistance — cheapest point'})
                                  </div>
                                  <div className="text-[#6b6b85] mt-0.5">
                                    Confirmation: wait for Nifty to bounce {_isCE ? `above ${forecast.nearSupport.toLocaleString('en-IN')}` : `below ${forecast.nearResistance.toLocaleString('en-IN')}`} before entering
                                  </div>
                                </div>
                              </div>
                              <div className="flex gap-3">
                                <div className="w-6 h-6 rounded-full bg-[#ff4d6d]/15 flex items-center justify-center shrink-0 text-[10px] text-[#ff4d6d] font-black">3</div>
                                <div>
                                  <div className="text-[#e8e8f0] font-black mb-0.5">Stop Loss: ₹{_slOptPrice} ({Math.round((1 - _slOptPrice / _dipBuyOptPrice) * 100)}% below entry)</div>
                                  <div className="text-[#6b6b85]">
                                    Exit immediately if Nifty breaks {_isCE ? `below ${(forecast.nearSupport - _strikeGapIdx).toLocaleString('en-IN')}` : `above ${(forecast.nearResistance + _strikeGapIdx).toLocaleString('en-IN')}`}. No second-guessing.
                                  </div>
                                </div>
                              </div>
                              <div className="flex gap-3">
                                <div className="w-6 h-6 rounded-full bg-[#39d98a]/15 flex items-center justify-center shrink-0 text-[10px] text-[#39d98a] font-black">4</div>
                                <div>
                                  <div className="text-[#e8e8f0] font-black mb-0.5">Target 1: ₹{_t1OptPrice} — take 50% profit</div>
                                  <div className="text-[#6b6b85]">When Nifty reaches {_t1NiftyLevel.toLocaleString('en-IN')} (EOD forecast level)</div>
                                </div>
                              </div>
                              <div className="flex gap-3">
                                <div className="w-6 h-6 rounded-full bg-[#f0c040]/15 flex items-center justify-center shrink-0 text-[10px] text-[#f0c040] font-black">5</div>
                                <div>
                                  <div className="text-[#e8e8f0] font-black mb-0.5">Target 2: ₹{Math.max(_t2OptPrice, _t1OptPrice + 1)} — let the rest ride</div>
                                  <div className="text-[#6b6b85]">{_isCE ? 'Near resistance' : 'Near support'} wall {_t2NiftyLevel.toLocaleString('en-IN')} — exit by 3:15 PM regardless</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="mt-3 text-[10px] font-mono text-[#6b6b85] px-1">
                        ⚠ Forecast based on Max Pain gravity + Gamma Wall theory. Not financial advice. Actual movement depends on macro events, FII flow, and news.
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* Instagram */}
            {activeTab === 'ig' && (() => {
              const isCE = result.optType === 'CE';
              const dir = result.lc > result.pcb
                ? (isCE ? '🟢 BUYERS IN CONTROL' : '🔴 PE BUYERS DOMINANT — BEARISH NIFTY')
                : (isCE ? '🔴 WRITERS WINNING' : '🟢 PE WRITERS DOMINANT — BULLISH NIFTY');
              const flatSc = scenarios.find(s => s.gap === 0);
              const gapUp100 = scenarios.find(s => s.gap === (getGapStep(indexName) * 2));
              const gapDn100 = scenarios.find(s => s.gap === -(getGapStep(indexName) * 2));
              const text = `⚛️ GOD PARTICLE ANALYSIS
${result.strike} ${result.optType} | Expiry: ${formatExpiryDisplay(result.expiry)}
━━━━━━━━━━━━━━━━━━━━━━

📍 God Particle (PCB): ₹${result.pcb.toFixed(0)}
📊 Last Close: ₹${result.lc.toFixed(2)}
📈 VWAP: ₹${result.vwap.toFixed(0)} | OI-WAP: ₹${result.oiwap.toFixed(0)}
⏰ Days to Expiry: ${result.dte}d

Signal: ${dir}

━━━━━━━━━━━━━━━━━━━━━━
🎯 KEY SCENARIOS

📈 Gap Up ${getGapStep(indexName) * 2}+ pts:
  Buy Zone: ₹${gapUp100?.entryLow}–${gapUp100?.entryHigh} | T1: ₹${gapUp100?.target1} | T2: ₹${gapUp100?.target2} | SL: ₹${gapUp100?.sl}

➡️ Flat Open:
  Buy Zone: ₹${flatSc?.entryLow}–${flatSc?.entryHigh} | T1: ₹${flatSc?.target1} | T2: ₹${flatSc?.target2} | SL: ₹${flatSc?.sl}

📉 Gap Down ${getGapStep(indexName) * 2}+ pts:
  Buy Zone: ₹${gapDn100?.entryLow}–${gapDn100?.entryHigh} | T1: ₹${gapDn100?.target1} | T2: ₹${gapDn100?.target2} | SL: ₹${gapDn100?.sl}

━━━━━━━━━━━━━━━━━━━━━━
⚡ Pure Option Buyer | God Particle Framework
📲 Follow for daily setups
#Nifty #OptionsTrading #GodParticle #OptionBuying #NSE`;
              return (
                <div>
                  <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap" id="igText">{text}</div>
                  <div className="flex justify-end mt-2">
                    <button onClick={() => navigator.clipboard.writeText(text).then(() => alert('Copied!'))}
                      className="px-4 py-2 border border-[#1e1e2e] text-xs font-bold rounded-lg hover:border-[#f0c040] hover:text-[#f0c040] transition-all">
                      📋 Copy Caption
                    </button>
                  </div>
                </div>
              );
            })()}

          </div>
        )}
      </div>
    </div>
  );
}
