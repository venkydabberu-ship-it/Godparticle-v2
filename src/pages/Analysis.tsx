import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getMarketData, getAvailableExpiries, getAvailableDates,
  parseNSEOptionChain, uploadMarketData, computeGodParticle,
  saveAnalysis, generateScenarioMatrix, normalizeIndexName,
  normalizeExpiry, formatExpiryDisplay, getDTE,
  getGapStep, getMaxGap, INDEX_DISPLAY, useCredits
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

  // Upload section
  const [uploadIndex, setUploadIndex] = useState('NIFTY50');
  const [uploadExpiry, setUploadExpiry] = useState('');
  const [uploadDate, setUploadDate] = useState(new Date().toISOString().split('T')[0]);
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

  const location = useLocation();
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
  }, [indexName]);

  // Load dates when expiry changes
  useEffect(() => {
    if (!expiry || !indexName) return;
    getAvailableDates(indexName, expiry)
      .then(d => setAvailableDates(d))
      .catch(() => setAvailableDates([]));
  }, [expiry, indexName]);

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
    if (profile.role !== 'premium' && profile.role !== 'pro' && profile.role !== 'admin' && (profile.credits ?? 0) < 2) {
      setError('Not enough credits! Buy more to continue.'); return;
    }

    setAnalysing(true); setError(''); setResult(null);
    try {
      // Fetch from unified data bank
      const rows = await getMarketData(indexName, expiry, 6);
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
          chng_oi: isCE ? sd.ce_chng_oi : sd.pe_chng_oi,
        };
      }).filter(Boolean).filter((d: any) => d.close > 0 || d.oi > 0);

      if (data.length < 2) {
        setError(`Only ${data.length} day(s) of data for ${strike} ${optType}. Need at least 2 days. Keep running Auto Fetch daily!`);
        return;
      }

      // Deduct credits
      if (!['premium', 'pro', 'admin'].includes(profile.role)) {
        await useCredits(user.id, 2);
        await refreshProfile();
      }

      const computed = computeGodParticle(data, strikeNum, optType, expiry);
      const matrix = generateScenarioMatrix(computed, indexName);
      await saveAnalysis(user.id, indexName, strikeNum, optType, expiry, computed);

      setResult(computed);
      setScenarios(matrix);
      setActiveTab('verdict');
    } catch (err: any) {
      setError(err.message || 'Analysis failed!');
    } finally {
      setAnalysing(false);
    }
  }

  const TABS = [
    { id: 'verdict', label: '⚡ Verdict' },
    { id: 'raw', label: '📊 Raw Data' },
    { id: 'decomp', label: '🔀 Decomp' },
    { id: 'gp', label: '⚛ God Particle' },
    { id: 'story', label: '📖 Story' },
    { id: 'matrix', label: '🎯 Matrix' },
    { id: 'ig', label: '📸 Instagram' },
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
            Credits: <span className="text-[#f0c040] font-bold">{profile?.role === 'premium' || profile?.role === 'pro' || profile?.role === 'admin' ? '∞' : profile?.credits ?? 0}</span>
          </span>
          <Link to="/dashboard" className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040]">← Dashboard</Link>
        </div>
      </nav>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-6">

        {/* ── UPLOAD CSV DATA ── */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5 mb-5">
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
        </div>

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

          {availableDates.length > 0 && (
            <div className="text-xs font-mono text-[#39d98a] mb-3">
              ✅ {availableDates.length} day{availableDates.length > 1 ? 's' : ''} of data available: {availableDates.map(d => d.slice(5)).join(', ')}
            </div>
          )}

          {error && (
            <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-lg px-4 py-2 text-xs font-mono text-[#ff4d6d] mb-3">{error}</div>
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

                  <div className="text-center text-[10px] font-mono text-[#6b6b85]">
                    Not Financial Advice · God Particle ⚛ · Based on {result.data?.length} sessions of data
                  </div>
                </div>
              );
            })()}

            {/* Raw Data */}
            {activeTab === 'raw' && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead><tr className="border-b border-[#1e1e2e]">
                    {['Date', 'Close', 'Volume', 'OI', 'Chng OI'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[#6b6b85] uppercase tracking-widest font-normal">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {result.data.map((d: any, i: number) => (
                      <tr key={i} className="border-b border-[#1e1e2e]/50 hover:bg-[#f0c040]/5">
                        <td className="px-4 py-3">{d.date}</td>
                        <td className="px-4 py-3 font-bold">₹{d.close.toFixed(2)}</td>
                        <td className="px-4 py-3">{d.volume.toLocaleString()}</td>
                        <td className="px-4 py-3">{d.oi.toLocaleString()}</td>
                        <td className={`px-4 py-3 ${d.chng_oi >= 0 ? 'text-[#39d98a]' : 'text-[#ff4d6d]'}`}>
                          {d.chng_oi >= 0 ? '+' : ''}{Math.round(d.chng_oi).toLocaleString()}
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
                {result.dte <= 2 && (
                  <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-xl px-4 py-2 text-xs font-mono text-[#ff4d6d] mb-3">
                    ⚠️ {result.dte}d to expiry — Theta aggressive. Exit by 12:30 PM. No overnight.
                  </div>
                )}
                <div className="bg-[#f0c040]/10 border border-[#f0c040]/30 rounded-xl px-4 py-2 text-xs font-mono text-[#f0c040] mb-3">
                  ⚛ PCB ₹{result.pcb.toFixed(1)} = Key level · Gap step: {getGapStep(indexName)} pts · Range: ±{getMaxGap(indexName)} pts
                  {result.daysSinceClose > 0 && (
                    <span className="ml-2 text-[#ff8c42]">
                      · {result.daysSinceClose}d theta decay applied to open estimates
                    </span>
                  )}
                </div>
                <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-[#1e1e2e]">
                        {['Scenario', 'Opens Est', 'Buy Zone', 'Target 1', 'Target 2', 'SL'].map(h => (
                          <th key={h} className="text-left px-3 py-3 text-[#6b6b85] uppercase tracking-widest font-normal">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {scenarios.map((sc, i) => (
                        <tr key={i} className={`border-b border-[#1e1e2e]/50 transition-all ${sc.avoid ? 'opacity-40' : sc.isFlat ? 'bg-[#f0c040]/5' : sc.isBest ? 'bg-[#39d98a]/5' : ''}`}>
                          <td className={`px-3 py-2.5 font-bold ${sc.gap > 0 ? 'text-[#39d98a]' : sc.gap < 0 ? 'text-[#ff4d6d]' : 'text-[#f0c040]'}`}>
                            {sc.label} {sc.isBest && !sc.avoid ? '⭐' : ''} {sc.avoid ? '🚫' : ''}
                          </td>
                          <td className="px-3 py-2.5 text-[#6b6b85]">{sc.avoid ? '—' : `₹${sc.openEst}`}</td>
                          <td className="px-3 py-2.5 text-[#f0c040]">{sc.avoid ? 'AVOID' : `₹${sc.entryLow}–${sc.entryHigh}`}</td>
                          <td className="px-3 py-2.5 text-[#39d98a]">{sc.avoid ? '—' : `₹${sc.target1}`}</td>
                          <td className="px-3 py-2.5 text-[#39d98a]">{sc.avoid ? '—' : `₹${sc.target2}`}</td>
                          <td className="px-3 py-2.5 text-[#ff4d6d]">{sc.avoid ? '—' : `₹${sc.sl}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

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
