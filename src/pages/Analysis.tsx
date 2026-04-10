import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { parseNSEOptionChain, uploadMarketData, getMarketData, computeGodParticle, saveAnalysis } from '../lib/market';
import { useCredits } from '../lib/auth';

export default function Analysis() {
  const { user, profile, refreshProfile } = useAuth();
  const [step, setStep] = useState<'upload' | 'analyse' | 'result'>('upload');
  const [indexName, setIndexName] = useState('NIFTY50');
  const [expiry, setExpiry] = useState('');
  const [csvDate, setCsvDate] = useState(new Date().toISOString().split('T')[0]);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [strike, setStrike] = useState('');
  const [optType, setOptType] = useState('CE');
  const [analysing, setAnalysing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('raw');

  const isAdmin = profile?.role === 'admin';

  const canUploadIndex = (idx: string) => {
    if (!profile) return false;
    if (profile.role === 'admin') return true;
    if (idx === 'NIFTY50') return false;
    if (idx === 'SENSEX') return ['basic', 'premium'].includes(profile.role);
    return profile.role === 'premium';
  };

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!expiry) { setUploadMsg('Please select expiry first!'); return; }
    if (!canUploadIndex(indexName)) {
      setUploadMsg(`You cannot upload ${indexName} data. Upgrade your plan!`);
      return;
    }
    setUploading(true);
    setUploadMsg('');
    try {
      const text = await file.text();
      const parsed = parseNSEOptionChain(text);
      const count = Object.keys(parsed).length;
      if (!count) { setUploadMsg('No valid data found in CSV!'); return; }
      const res = await uploadMarketData(indexName, expiry, csvDate, parsed, user.id);
      if (isAdmin) {
        if (res.status === 'duplicate') {
          setUploadMsg(`⚠️ Data already exists for ${indexName} | ${expiry} | ${csvDate} — Skipped!`);
        } else {
          setUploadMsg(`✅ Saved ${count} strikes for ${indexName} | ${expiry} | ${csvDate}`);
        }
      } else {
        setUploadMsg(`✅ Data saved — ${count} strikes for ${expiry} | ${csvDate}`);
      }
    } catch (err: any) {
      setUploadMsg(`Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleAnalyse() {
    if (!user || !profile) return;
    if (!strike) { setError('Enter a strike price!'); return; }
    if (!expiry) { setError('Enter expiry!'); return; }
    if (profile.role !== 'premium' && profile.role !== 'admin' && profile.role !== 'pro' && (profile.credits ?? 0) < 2) {
      setError('Not enough credits! Buy more credits to continue.');
      return;
    }
    setAnalysing(true);
    setError('');
    try {
      const rows = await getMarketData(indexName, expiry);
      if (!rows || !rows.length) {
        setError('No data found for this index + expiry. Upload CSVs first!');
        return;
      }
      const last6 = rows.slice(-6);
      const data = last6.map((r: any) => {
        const sd = r.strike_data[strike];
        if (!sd) return null;
        const isCE = optType === 'CE';
        return {
          date: r.trade_date,
          close: isCE ? sd.ce_ltp : sd.pe_ltp,
          volume: isCE ? sd.ce_vol : sd.pe_vol,
          oi: isCE ? sd.ce_oi : sd.pe_oi,
          chng_oi: isCE ? sd.ce_chng_oi : sd.pe_chng_oi
        };
      }).filter(Boolean);

      if (data.length < 2) {
        setError(`Only ${data.length} day(s) of data for ${strike} ${optType}. Need at least 2 days!`);
        return;
      }

      if (profile.role !== 'premium' && profile.role !== 'admin' && profile.role !== 'pro') {
        await useCredits(user.id, 2);
        await refreshProfile();
      }

      const computed = computeGodParticle(data, parseFloat(strike), optType, expiry, indexName);
      await saveAnalysis(user.id, indexName, parseFloat(strike), optType, expiry, computed);
      setResult(computed);
      setActiveTab('raw');
      setStep('result');
    } catch (err: any) {
      setError(err.message || 'Analysis failed!');
    } finally {
      setAnalysing(false);
    }
  }

  const adminTabs = ['raw','decomp','gp','story','matrix','ig'];
  const adminTabLabels = ['📊 Raw','🔀 Decomp','⚛ God Particle','📖 Story','🎯 Matrix','📸 Instagram'];
  const customerTabs = ['raw','story','matrix'];
  const customerTabLabels = ['📊 Raw Data','📖 Analysis','🎯 Trade Levels'];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#1e1e2e]">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#f0c040] rounded-xl flex items-center justify-center text-lg">⚛</div>
          <div className="font-bold text-base">God Particle</div>
        </Link>
        <div className="flex items-center gap-3">
          <div className="text-xs font-mono text-[#6b6b85]">
            Credits: <span className="text-[#f0c040] font-bold">
              {profile?.role === 'premium' || profile?.role === 'admin' || profile?.role === 'pro' ? '∞' : profile?.credits ?? 0}
            </span>
          </div>
          <Link to="/dashboard" className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040]">
            ← Dashboard
          </Link>
        </div>
      </nav>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
        {step !== 'result' && (
          <>
            {/* UPLOAD SECTION */}
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 mb-6">
              <h2 className="text-sm font-black uppercase tracking-widest text-[#6b6b85] mb-4">
                Step 1 — Upload CSV Data
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Index</label>
                  <select value={indexName} onChange={e => setIndexName(e.target.value)}
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]">
                    <option value="NIFTY50">Nifty 50</option>
                    <option value="SENSEX">Sensex</option>
                    {['premium','admin','pro'].includes(profile?.role ?? '') && <>
                      <option value="BANKNIFTY">Bank Nifty</option>
                      <option value="FINNIFTY">Fin Nifty</option>
                      <option value="MIDCAPNIFTY">MidCap Nifty</option>
                      <option value="BANKEX">BankEx</option>
                    </>}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Expiry</label>
                  <select value={expiry} onChange={e => setExpiry(e.target.value)}
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]">
                    <option value="">Select expiry</option>
                    <option value="13-Apr-2026">13 Apr 2026</option>
                    <option value="17-Apr-2026">17 Apr 2026</option>
                    <option value="21-Apr-2026">21 Apr 2026</option>
                    <option value="28-Apr-2026">28 Apr 2026</option>
                    <option value="05-May-2026">05 May 2026</option>
                    <option value="12-May-2026">12 May 2026</option>
                    <option value="26-May-2026">26 May 2026</option>
                    <option value="30-Jun-2026">30 Jun 2026</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Date of CSV</label>
                  <input type="date" value={csvDate} onChange={e => setCsvDate(e.target.value)}
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]" />
                </div>
              </div>

              {!canUploadIndex(indexName) && (
                <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-lg px-4 py-2 text-xs font-mono text-[#ff4d6d] mb-4">
                  ⚠️ You cannot upload {indexName} data on your current plan.
                  <Link to="/pricing" className="underline ml-1">Upgrade →</Link>
                </div>
              )}

              <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer transition-all ${canUploadIndex(indexName) ? 'border-[#1e1e2e] hover:border-[#f0c040]' : 'border-[#1e1e2e] opacity-50 cursor-not-allowed'}`}>
                <input type="file" accept=".csv" className="hidden" onChange={handleUpload} disabled={!canUploadIndex(indexName) || uploading} />
                <div className="text-3xl mb-2">📄</div>
                <div className="text-sm font-mono text-[#6b6b85]">
                  {uploading ? '⏳ Uploading...' : 'Click to upload NSE Option Chain CSV'}
                </div>
              </label>

              {uploadMsg && (
                <div className={`mt-3 text-xs font-mono px-4 py-2 rounded-lg ${uploadMsg.startsWith('✅') ? 'bg-[#39d98a]/10 text-[#39d98a] border border-[#39d98a]/30' : uploadMsg.startsWith('⚠️') ? 'bg-[#f0c040]/10 text-[#f0c040] border border-[#f0c040]/30' : 'bg-[#ff4d6d]/10 text-[#ff4d6d] border border-[#ff4d6d]/30'}`}>
                  {uploadMsg}
                </div>
              )}
            </div>

            {/* ANALYSE SECTION */}
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
              <h2 className="text-sm font-black uppercase tracking-widest text-[#6b6b85] mb-4">
                Step 2 — Analyse Strike
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Strike Price</label>
                  <input type="number" value={strike} onChange={e => setStrike(e.target.value)}
                    placeholder="e.g. 24000" step="50"
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Option Type</label>
                  <select value={optType} onChange={e => setOptType(e.target.value)}
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]">
                    <option value="CE">CE — Call</option>
                    <option value="PE">PE — Put</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Expiry</label>
                  <select value={expiry} onChange={e => setExpiry(e.target.value)}
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]">
                    <option value="">Select expiry</option>
                    <option value="13-Apr-2026">13 Apr 2026</option>
                    <option value="17-Apr-2026">17 Apr 2026</option>
                    <option value="21-Apr-2026">21 Apr 2026</option>
                    <option value="28-Apr-2026">28 Apr 2026</option>
                    <option value="05-May-2026">05 May 2026</option>
                    <option value="12-May-2026">12 May 2026</option>
                    <option value="26-May-2026">26 May 2026</option>
                    <option value="30-Jun-2026">30 Jun 2026</option>
                  </select>
                </div>
              </div>

              {error && (
                <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-lg px-4 py-2 text-xs font-mono text-[#ff4d6d] mb-4">
                  {error}
                </div>
              )}

              <button onClick={handleAnalyse} disabled={analysing}
                className="w-full bg-[#f0c040] text-black font-black py-3 rounded-xl hover:bg-[#ffd060] transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                {analysing ? '⏳ Analysing...' : '⚛ Run God Particle Analysis — 2 Credits'}
              </button>
            </div>
          </>
        )}

        {/* RESULTS */}
        {step === 'result' && result && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-black">
                Analysis: <span className="text-[#f0c040]">{result.strike} {result.optType}</span>
              </h2>
              <button onClick={() => { setStep('upload'); setResult(null); }}
                className="px-4 py-2 text-xs font-bold border border-[#1e1e2e] rounded-lg hover:border-[#f0c040] transition-all">
                ← New Analysis
              </button>
            </div>

            {/* ADMIN — Full God Particle Card */}
            {isAdmin && (
              <div className="bg-gradient-to-r from-[#f0c040]/10 to-[#f0c040]/5 border border-[#f0c040]/30 rounded-2xl p-6 mb-6 flex items-center gap-8 flex-wrap">
                <div>
                  <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-1">⚛ God Particle (PCB)</div>
                  <div className="text-5xl font-black text-[#f0c040]">₹{result.pcb.toFixed(1)}</div>
                </div>
                <div className="w-px h-14 bg-[#1e1e2e]" />
                <div className="flex flex-col gap-2">
                  <div className="text-xs font-mono"><span className="text-[#6b6b85] mr-2">VWAP</span>₹{result.vwap.toFixed(1)}</div>
                  <div className="text-xs font-mono"><span className="text-[#6b6b85] mr-2">OI-WAP</span>₹{result.oiwap.toFixed(1)}</div>
                  <div className="text-xs font-mono"><span className="text-[#6b6b85] mr-2">Last Close</span>₹{result.lc.toFixed(2)}</div>
                  <div className="text-xs font-mono"><span className="text-[#6b6b85] mr-2">Days to Expiry</span>{result.dte}d</div>
                  <div className="text-xs font-mono"><span className="text-[#6b6b85] mr-2">OI Growth</span>{result.oiGrowthMultiple}x</div>
                </div>
              </div>
            )}

            {/* CUSTOMER — Themed Card with PCB */}
            {!isAdmin && (
              <div className="rounded-2xl p-6 mb-6 text-center relative overflow-hidden"
                style={{
                  background: result.optType === 'CE'
                    ? 'linear-gradient(135deg, #0a1a0a, #0a0a0f)'
                    : 'linear-gradient(135deg, #1a0a0a, #0a0a0f)',
                  border: result.optType === 'CE'
                    ? '1px solid rgba(57,217,138,0.3)'
                    : '1px solid rgba(255,77,109,0.3)',
                  boxShadow: result.optType === 'CE'
                    ? '0 0 40px rgba(57,217,138,0.05)'
                    : '0 0 40px rgba(255,77,109,0.05)'
                }}>
                {/* Watermark */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                  <div className="text-[180px] font-black opacity-[0.03]"
                    style={{color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d'}}>⚛</div>
                </div>
                <div className="relative z-10">
                  <div className="text-xs font-mono tracking-widest mb-2"
                    style={{color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d'}}>
                    ⚛ GOD PARTICLE ANALYSIS
                  </div>
                  <div className="text-2xl font-black mb-1"
                    style={{color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d'}}>
                    {result.strike} {result.optType}
                  </div>
                  <div className="text-sm font-mono text-[#6b6b85] mb-4">
                    {result.indexName} · Expiry: {result.expiry} · {result.dte}d left
                  </div>
                  <div className="inline-block px-8 py-4 rounded-xl"
                    style={{
                      background: result.optType === 'CE'
                        ? 'rgba(57,217,138,0.1)'
                        : 'rgba(255,77,109,0.1)',
                      border: result.optType === 'CE'
                        ? '1px solid rgba(57,217,138,0.3)'
                        : '1px solid rgba(255,77,109,0.3)'
                    }}>
                    <div className="text-xs font-mono text-[#6b6b85] mb-1 uppercase tracking-widest">⚛ God Particle</div>
                    <div className="text-4xl font-black"
                      style={{color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d'}}>
                      ₹{result.pcb.toFixed(1)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TABS */}
            <div className="flex gap-1 bg-[#111118] rounded-xl p-1 mb-6 overflow-x-auto">
              {(isAdmin ? adminTabs : customerTabs).map((t, i) => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${activeTab === t ? 'bg-[#16161f] text-[#e8e8f0] border border-[#1e1e2e]' : 'text-[#6b6b85]'}`}>
                  {isAdmin ? adminTabLabels[i] : customerTabLabels[i]}
                </button>
              ))}
            </div>

            {/* RAW DATA — All users */}
            {activeTab === 'raw' && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead><tr className="border-b border-[#1e1e2e]">
                    {['Date','Close','Volume','OI','Chng OI'].map(h => (
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

            {/* DECOMP — Admin only */}
            {activeTab === 'decomp' && isAdmin && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead><tr className="border-b border-[#1e1e2e]">
                    {['Date','Volume','ΔOI','New Opens','Square-offs','Signal'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[#6b6b85] uppercase tracking-widest font-normal">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {result.decomp.map((d: any, i: number) => (
                      <tr key={i} className="border-b border-[#1e1e2e]/50 hover:bg-[#f0c040]/5">
                        <td className="px-4 py-3">{d.date}</td>
                        <td className="px-4 py-3">{d.volume.toLocaleString()}</td>
                        <td className={`px-4 py-3 ${d.dOI >= 0 ? 'text-[#39d98a]' : 'text-[#ff4d6d]'}`}>
                          {d.dOI >= 0 ? '+' : ''}{Math.round(d.dOI).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-[#f0c040] font-bold">{Math.round(d.NO).toLocaleString()}</td>
                        <td className="px-4 py-3">{Math.round(d.SQ).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${d.signalColor === 'green' ? 'bg-[#39d98a]/15 text-[#39d98a]' : d.signalColor === 'red' ? 'bg-[#ff4d6d]/15 text-[#ff4d6d]' : 'bg-[#6b6b85]/15 text-[#6b6b85]'}`}>
                            {d.signal}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* GOD PARTICLE VALIDATION — Admin only */}
            {activeTab === 'gp' && isAdmin && (
              <div>
                {result.insights && result.insights.length > 0 && (
                  <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 mb-4">
                    <div className="text-sm font-black mb-3 text-[#f0c040]">🔬 Critical Insights</div>
                    <div className="space-y-2">
                      {result.insights.map((ins: string, i: number) => (
                        <div key={i} className="text-xs font-mono text-[#e8e8f0] leading-relaxed border-l-2 border-[#f0c040]/30 pl-3">
                          {ins}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead><tr className="border-b border-[#1e1e2e]">
                      {['Date','Close','vs PCB','Zone','Signal'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[#6b6b85] uppercase tracking-widest font-normal">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {result.pcbValidation.map((d: any, i: number) => (
                        <tr key={i} className="border-b border-[#1e1e2e]/50 hover:bg-[#f0c040]/5">
                          <td className="px-4 py-3">{d.date}</td>
                          <td className="px-4 py-3 font-bold">₹{d.close.toFixed(2)}</td>
                          <td className={`px-4 py-3 ${d.diff >= 0 ? 'text-[#39d98a]' : 'text-[#ff4d6d]'}`}>
                            {d.diff >= 0 ? '+' : ''}₹{d.diff.toFixed(1)} ({d.diff >= 0 ? '+' : ''}{d.pct.toFixed(1)}%)
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${d.zone === 'BUYER EDGE' ? 'bg-[#39d98a]/15 text-[#39d98a]' : d.zone === 'WRITER EDGE' ? 'bg-[#ff4d6d]/15 text-[#ff4d6d]' : 'bg-[#f0c040]/15 text-[#f0c040]'}`}>
                              {d.zone}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[#6b6b85] text-xs">{d.signal}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* STORY — All users */}
            {activeTab === 'story' && (
              <div className="rounded-xl p-6 text-sm leading-relaxed"
                style={{
                  background: isAdmin
                    ? '#111118'
                    : result.optType === 'CE'
                    ? 'linear-gradient(135deg, #0a1a0a, #0a0a0f)'
                    : 'linear-gradient(135deg, #1a0a0a, #0a0a0f)',
                  border: isAdmin
                    ? '1px solid #1e1e2e'
                    : result.optType === 'CE'
                    ? '1px solid rgba(57,217,138,0.2)'
                    : '1px solid rgba(255,77,109,0.2)'
                }}>
                {isAdmin ? (
                  <div className="space-y-4 font-mono text-xs">
                    {result.story.split('\n\n').map((para: string, i: number) => (
                      <div key={i}>
                        {para.includes(':') && para.split('\n')[0].endsWith(':') ? (
                          <div>
                            <div className="text-[#f0c040] font-bold mb-2 text-sm">{para.split('\n')[0]}</div>
                            <div className="text-[#e8e8f0] leading-relaxed pl-2">
                              {para.split('\n').slice(1).join('\n')}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[#e8e8f0] leading-relaxed">{para}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3 font-mono text-xs">
                    <div className="text-center mb-4">
                      <span className="text-xs tracking-widest font-bold"
                        style={{color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d'}}>
                        ⚛ MARKET ANALYSIS
                      </span>
                    </div>
                    {result.insights && result.insights.slice(0, 3).map((ins: string, i: number) => (
                      <div key={i} className="text-[#e8e8f0] leading-relaxed border-l-2 pl-3 py-1"
                        style={{borderColor: result.optType === 'CE' ? 'rgba(57,217,138,0.4)' : 'rgba(255,77,109,0.4)'}}>
                        {ins}
                      </div>
                    ))}
                    <div className="mt-6 text-center">
                      <div className="text-[10px] font-mono text-[#6b6b85]">
                        Not Financial Advice · God Particle ⚛
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* MATRIX — All users */}
            {activeTab === 'matrix' && (
              <div>
                {result.dte <= 2 && isAdmin && (
                  <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-xl p-4 mb-4 text-xs font-mono text-[#ff4d6d]">
                    ⚠️ {result.dte}d to expiry — Theta very aggressive. No overnight holds.
                  </div>
                )}

                {isAdmin ? (
                  <div>
                    {[
                      { label: '📈 GAP UP', color: '#39d98a', border: 'border-[#39d98a]/20', bg: 'bg-[#39d98a]/10',
                        rows: result.matrix.filter((r: any) => r.gap.includes('Up')) },
                      { label: '➡️ FLAT', color: '#f0c040', border: 'border-[#f0c040]/20', bg: 'bg-[#f0c040]/10',
                        rows: result.matrix.filter((r: any) => r.gap.includes('Flat')) },
                      { label: '📉 GAP DOWN', color: '#ff4d6d', border: 'border-[#ff4d6d]/20', bg: 'bg-[#ff4d6d]/10',
                        rows: result.matrix.filter((r: any) => r.gap.includes('Down')) },
                    ].map((sc, si) => (
                      <div key={si} className="mb-4">
                        <div className={`${sc.bg} border ${sc.border} rounded-t-xl px-4 py-3 font-bold text-sm`} style={{color: sc.color}}>{sc.label}</div>
                        <div className={`border ${sc.border} border-t-0 rounded-b-xl overflow-x-auto bg-[#111118]`}>
                          <table className="w-full text-xs font-mono">
                            <thead><tr className="border-b border-[#1e1e2e]">
                              {['Scenario','Buy Zone','Target 1','Target 2','Stop Loss'].map(h => (
                                <th key={h} className="text-left px-4 py-2 text-[#6b6b85] uppercase tracking-widest font-normal">{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>
                              {sc.rows.map((row: any, ri: number) => (
                                <tr key={ri} className="border-b border-[#1e1e2e]/50">
                                  <td className="px-4 py-2 font-bold">{row.gap}</td>
                                  {row.avoid ? (
                                    <td colSpan={4} className="px-4 py-2 text-[#ff4d6d] font-bold">🚫 AVOID</td>
                                  ) : (
                                    <>
                                      <td className="px-4 py-2 text-[#f0c040]">₹{row.buyZoneLow}–₹{row.buyZoneHigh}</td>
                                      <td className="px-4 py-2 text-[#39d98a]">₹{row.t1}</td>
                                      <td className="px-4 py-2 text-[#39d98a]">₹{row.t2}</td>
                                      <td className="px-4 py-2 text-[#ff4d6d]">₹{row.sl}</td>
                                    </>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  // CUSTOMER CARD
                  <div className="relative rounded-2xl overflow-hidden p-8"
                    style={{
                      background: result.optType === 'CE'
                        ? 'linear-gradient(135deg, #0a0a0f 0%, #0a1a0a 50%, #0a0a0f 100%)'
                        : 'linear-gradient(135deg, #0a0a0f 0%, #1a0a0a 50%, #0a0a0f 100%)',
                      border: result.optType === 'CE'
                        ? '1px solid rgba(57,217,138,0.3)'
                        : '1px solid rgba(255,77,109,0.3)',
                      boxShadow: result.optType === 'CE'
                        ? '0 0 60px rgba(57,217,138,0.08)'
                        : '0 0 60px rgba(255,77,109,0.08)'
                    }}>
                    {/* Watermark */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                      <div className="text-[220px] font-black opacity-[0.025]"
                        style={{color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d'}}>⚛</div>
                    </div>

                    {/* Header */}
                    <div className="relative z-10 text-center mb-8">
                      <div className="text-xs font-mono tracking-[3px] mb-3"
                        style={{color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d'}}>
                        ⚛ GOD PARTICLE ANALYSIS
                      </div>
                      <div className="text-3xl font-black tracking-tight mb-2">
                        STRIKE: <span style={{color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d'}}>
                          {result.strike} {result.optType}
                        </span>
                      </div>
                      <div className="text-sm font-mono text-[#6b6b85]">
                        INDEX: <strong className="text-[#e8e8f0]">{result.indexName}</strong>
                        &nbsp;·&nbsp;
                        EXPIRY: <strong className="text-[#e8e8f0]">{result.expiry.toUpperCase()}</strong>
                      </div>
                    </div>

                    {/* Table */}
                    <div className="relative z-10 overflow-x-auto mb-8">
                      <table className="w-full font-mono text-sm">
                        <thead>
                          <tr style={{borderBottom: result.optType === 'CE' ? '1px solid rgba(57,217,138,0.3)' : '1px solid rgba(255,77,109,0.3)'}}>
                            {['SCENARIO','BUY ZONE','TARGET','STOP LOSS'].map(h => (
                              <th key={h} className="text-left px-4 py-3 text-xs tracking-widest font-bold"
                                style={{color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d'}}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.matrix.map((row: any, i: number) => (
                            <tr key={i} style={{borderBottom: '1px solid rgba(255,255,255,0.04)'}}>
                              <td className="px-4 py-3 font-bold text-[#e8e8f0] text-xs">{row.gap}</td>
                              {row.avoid ? (
                                <td colSpan={3} className="px-4 py-3 font-black text-xs"
                                  style={{color: result.optType === 'CE' ? '#ff4d6d' : '#39d98a'}}>
                                  AVOID
                                </td>
                              ) : (
                                <>
                                  <td className="px-4 py-3 font-bold text-xs"
                                    style={{color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d'}}>
                                    ₹{row.buyZoneLow}–₹{row.buyZoneHigh}
                                  </td>
                                  <td className="px-4 py-3 font-bold text-[#f0c040] text-xs">
                                    ₹{row.t1}
                                  </td>
                                  <td className="px-4 py-3 font-bold text-[#e8e8f0] text-xs">
                                    ₹{row.sl}
                                  </td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Footer */}
                    <div className="relative z-10 text-center space-y-2">
                      <div className="text-xs font-mono text-[#6b6b85]">
                        ⭐ Best Setup · Wait 15 min after open · Not Financial Advice
                      </div>
                      <div className="text-[10px] font-mono tracking-widest"
                        style={{color: result.optType === 'CE' ? 'rgba(57,217,138,0.4)' : 'rgba(255,77,109,0.4)'}}>
                        PREDICTED BY PURE MATHEMATICAL CALCULATIONS,
                        OPTION GREEKS, DEEP PSYCHOLOGICAL RESEARCH.
                      </div>
                      <div className="text-xs font-black tracking-widest"
                        style={{color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d'}}>
                        DEVELOPED BY GOD PARTICLE ⚛
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* INSTAGRAM — Admin only */}
            {activeTab === 'ig' && isAdmin && (
              <div>
                <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-6 font-mono text-xs leading-relaxed whitespace-pre-wrap" id="igText">
{`⚛️ GOD PARTICLE ANALYSIS
${result.strike} ${result.optType} | Expiry: ${result.expiry}
━━━━━━━━━━━━━━━━━━━━━━

📍 God Particle (PCB): ₹${result.pcb.toFixed(0)}
📊 Last Close: ₹${result.lc.toFixed(2)}
📈 VWAP: ₹${result.vwap.toFixed(0)} | OI-WAP: ₹${result.oiwap.toFixed(0)}
⏰ Days to Expiry: ${result.dte}d
📊 OI Growth: ${result.oiGrowthMultiple}x

Signal: ${result.lc > result.pcb ? (result.optType === 'CE' ? '🟢 BUYERS IN CONTROL' : '🔴 PE BUYERS DOMINANT') : (result.optType === 'CE' ? '🔴 WRITERS WINNING' : '🟢 PE WRITERS DOMINANT')}

━━━━━━━━━━━━━━━━━━━━━━
🎯 TOMORROW'S SCENARIOS

📈 Gap Up 100+:
  Entry: ₹${result.matrix.find((r: any) => r.gap === 'Gap Up 100')?.buyZoneHigh ?? '—'} | T1: ₹${result.matrix.find((r: any) => r.gap === 'Gap Up 100')?.t1 ?? '—'} | SL: ₹${result.matrix.find((r: any) => r.gap === 'Gap Up 100')?.sl ?? '—'}

➡️ Flat Open:
  Entry: ₹${result.matrix.find((r: any) => r.gap.includes('Flat'))?.buyZoneHigh ?? '—'} | T1: ₹${result.matrix.find((r: any) => r.gap.includes('Flat'))?.t1 ?? '—'} | SL: ₹${result.matrix.find((r: any) => r.gap.includes('Flat'))?.sl ?? '—'}

📉 Gap Down 100:
  Entry: ₹${result.matrix.find((r: any) => r.gap === 'Gap Down 100')?.buyZoneHigh ?? '—'} | T1: ₹${result.matrix.find((r: any) => r.gap === 'Gap Down 100')?.t1 ?? '—'} | SL: ₹${result.matrix.find((r: any) => r.gap === 'Gap Down 100')?.sl ?? '—'}

━━━━━━━━━━━━━━━━━━━━━━
⚡ Pure Option Buyer | God Particle Framework
#Nifty #OptionsTrading #GodParticle #OptionBuying #NSE #NiftyWeekly`}
                </div>
                <div className="flex justify-end mt-3">
                  <button onClick={() => {
                    const text = document.getElementById('igText')?.textContent || '';
                    navigator.clipboard.writeText(text).then(() => alert('Caption copied!'));
                  }} className="px-4 py-2 border border-[#1e1e2e] text-xs font-bold rounded-lg hover:border-[#f0c040] hover:text-[#f0c040] transition-all">
                    📋 Copy Caption
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
