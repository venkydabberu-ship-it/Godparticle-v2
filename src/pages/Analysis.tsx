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
      await uploadMarketData(indexName, expiry, csvDate, parsed, user.id);
      setUploadMsg(`✓ Saved ${count} strikes for ${indexName} | ${expiry} | ${csvDate}`);
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
    if (profile.role !== 'premium' && (profile.credits ?? 0) < 2) {
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

      if (profile.role !== 'premium') {
        await useCredits(user.id, 2);
        await refreshProfile();
      }

      const computed = computeGodParticle(data, parseFloat(strike), optType, expiry);
      await saveAnalysis(user.id, indexName, parseFloat(strike), optType, expiry, computed);
      setResult(computed);
      setStep('result');
    } catch (err: any) {
      setError(err.message || 'Analysis failed!');
    } finally {
      setAnalysing(false);
    }
  }

  const tabs = ['raw', 'decomp', 'gp', 'story', 'matrix', 'ig'];
  const tabLabels = ['📊 Raw', '🔀 Decomp', '⚛ God Particle', '📖 Story', '🎯 Matrix', '📸 Instagram'];

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
              {profile?.role === 'premium' ? '∞' : profile?.credits ?? 0}
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
                  <select
                    value={indexName}
                    onChange={e => setIndexName(e.target.value)}
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]"
                  >
                    <option value="NIFTY50">Nifty 50</option>
                    <option value="SENSEX">Sensex</option>
                    {['premium', 'admin'].includes(profile?.role ?? '') && (
                      <>
                        <option value="BANKNIFTY">Bank Nifty</option>
                        <option value="FINNIFTY">Fin Nifty</option>
                        <option value="MIDCAPNIFTY">MidCap Nifty</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Expiry</label>
                  <select
                    value={expiry}
                    onChange={e => setExpiry(e.target.value)}
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]"
                  >
                    <option value="">Select expiry</option>
                    <option value="13-Apr-2026">13 Apr 2026</option>
                    <option value="21-Apr-2026">21 Apr 2026</option>
                    <option value="28-Apr-2026">28 Apr 2026</option>
                    <option value="05-May-2026">05 May 2026</option>
                    <option value="12-May-2026">12 May 2026</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Date of CSV</label>
                  <input
                    type="date"
                    value={csvDate}
                    onChange={e => setCsvDate(e.target.value)}
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]"
                  />
                </div>
              </div>

              {!canUploadIndex(indexName) && (
                <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-lg px-4 py-2 text-xs font-mono text-[#ff4d6d] mb-4">
                  ⚠️ You cannot upload {indexName} data on your current plan.
                  <Link to="/pricing" className="underline ml-1">Upgrade →</Link>
                </div>
              )}

              <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer transition-all ${canUploadIndex(indexName) ? 'border-[#1e1e2e] hover:border-[#f0c040]' : 'border-[#1e1e2e] opacity-50 cursor-not-allowed'}`}>
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleUpload}
                  disabled={!canUploadIndex(indexName) || uploading}
                />
                <div className="text-3xl mb-2">📄</div>
                <div className="text-sm font-mono text-[#6b6b85]">
                  {uploading ? '⏳ Uploading...' : 'Click to upload NSE Option Chain CSV'}
                </div>
              </label>

              {uploadMsg && (
                <div className={`mt-3 text-xs font-mono px-4 py-2 rounded-lg ${uploadMsg.startsWith('✓') ? 'bg-[#39d98a]/10 text-[#39d98a] border border-[#39d98a]/30' : 'bg-[#ff4d6d]/10 text-[#ff4d6d] border border-[#ff4d6d]/30'}`}>
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
                  <input
                    type="number"
                    value={strike}
                    onChange={e => setStrike(e.target.value)}
                    placeholder="e.g. 24100"
                    step="50"
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Option Type</label>
                  <select
                    value={optType}
                    onChange={e => setOptType(e.target.value)}
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]"
                  >
                    <option value="CE">CE — Call</option>
                    <option value="PE">PE — Put</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Expiry</label>
                  <select
                    value={expiry}
                    onChange={e => setExpiry(e.target.value)}
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]"
                  >
                    <option value="">Select expiry</option>
                    <option value="13-Apr-2026">13 Apr 2026</option>
                    <option value="21-Apr-2026">21 Apr 2026</option>
                    <option value="28-Apr-2026">28 Apr 2026</option>
                    <option value="05-May-2026">05 May 2026</option>
                    <option value="12-May-2026">12 May 2026</option>
                  </select>
                </div>
              </div>

              {error && (
                <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-lg px-4 py-2 text-xs font-mono text-[#ff4d6d] mb-4">
                  {error}
                </div>
              )}

              <button
                onClick={handleAnalyse}
                disabled={analysing}
                className="w-full bg-[#f0c040] text-black font-black py-3 rounded-xl hover:bg-[#ffd060] transition-all shadow-[0_0_20px_rgba(240,192,64,0.2)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
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
              <button
                onClick={() => { setStep('upload'); setResult(null); }}
                className="px-4 py-2 text-xs font-bold border border-[#1e1e2e] rounded-lg hover:border-[#f0c040] transition-all"
              >
                ← New Analysis
              </button>
            </div>

            {/* God Particle Card */}
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
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-[#111118] rounded-xl p-1 mb-6 overflow-x-auto">
              {tabs.map((t, i) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${activeTab === t ? 'bg-[#16161f] text-[#e8e8f0] border border-[#1e1e2e]' : 'text-[#6b6b85]'}`}
                >
                  {tabLabels[i]}
                </button>
              ))}
            </div>

            {/* Raw Data */}
            {activeTab === 'raw' && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden overflow-x-auto">
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
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead><tr className="border-b border-[#1e1e2e]">
                    {['Date', 'Volume', 'ΔOI', 'New Opens', 'Square-offs', 'Signal'].map(h => (
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
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${d.dOI > 0 ? 'bg-[#39d98a]/15 text-[#39d98a]' : 'bg-[#6b6b85]/15 text-[#6b6b85]'}`}>
                            {d.dOI > 0 ? (result.optType === 'CE' ? (d.close > result.pcb ? 'Fresh Buy' : 'Fresh Write') : 'Fresh PE') : 'Unwind'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* God Particle Validation */}
            {activeTab === 'gp' && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead><tr className="border-b border-[#1e1e2e]">
                    {['Date', 'Close', 'vs PCB', 'Zone', 'Interpretation'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[#6b6b85] uppercase tracking-widest font-normal">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {result.decomp.map((d: any, i: number) => {
                      const diff = d.close - result.pcb;
                      const zone = d.close > result.pcb ? 'BUYER EDGE' : d.close < result.pcb ? 'WRITER EDGE' : 'WAR ZONE';
                      const zoneColor = d.close > result.pcb ? 'text-[#39d98a] bg-[#39d98a]/15' : d.close < result.pcb ? 'text-[#ff4d6d] bg-[#ff4d6d]/15' : 'text-[#f0c040] bg-[#f0c040]/15';
                      const interp = d.close > result.pcb
                        ? (result.optType === 'CE' ? 'Buyers in control' : 'PE buyers dominant')
                        : d.close < result.pcb
                        ? (result.optType === 'CE' ? 'Writers winning' : 'PE writers active')
                        : 'War zone — sharp move expected';
                      return (
                        <tr key={i} className="border-b border-[#1e1e2e]/50 hover:bg-[#f0c040]/5">
                          <td className="px-4 py-3">{d.date}</td>
                          <td className="px-4 py-3 font-bold">₹{d.close.toFixed(2)}</td>
                          <td className={`px-4 py-3 ${diff >= 0 ? 'text-[#39d98a]' : 'text-[#ff4d6d]'}`}>
                            {diff >= 0 ? '+' : ''}₹{diff.toFixed(1)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${zoneColor}`}>{zone}</span>
                          </td>
                          <td className="px-4 py-3 text-[#6b6b85]">{interp}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Story */}
            {activeTab === 'story' && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-6 text-sm leading-relaxed">
                {(() => {
                  const f = result.data[0], l = result.data[result.data.length - 1];
                  const mv = l.close - f.close;
                  const mvp = ((mv / f.close) * 100).toFixed(1);
                  const tNO = result.decomp.reduce((s: number, d: any) => s + d.NO, 0);
                  const tSQ = result.decomp.reduce((s: number, d: any) => s + d.SQ, 0);
                  const pos = l.close > result.pcb ? 'ABOVE' : l.close < result.pcb ? 'BELOW' : 'AT';
                  return (
                    <div className="space-y-4">
                      <p>Over <strong className="text-[#f0c040]">{result.data.length} sessions</strong>, {result.strike} {result.optType} moved from <strong className="text-[#f0c040]">₹{f.close.toFixed(2)}</strong> to <strong className="text-[#f0c040]">₹{l.close.toFixed(2)}</strong> — a change of <strong style={{ color: mv >= 0 ? '#39d98a' : '#ff4d6d' }}>{mv >= 0 ? '+' : ''}₹{mv.toFixed(2)} ({mv >= 0 ? '+' : ''}{mvp}%)</strong>.</p>
                      <p>Positions are <strong className="text-[#f0c040]">{tNO > tSQ ? 'building' : 'unwinding'}</strong>. New opens: <strong className="text-[#f0c040]">{Math.round(tNO).toLocaleString()}</strong> vs square-offs: <strong className="text-[#f0c040]">{Math.round(tSQ).toLocaleString()}</strong>.</p>
                      <p>The <strong className="text-[#f0c040]">God Particle (PCB)</strong> is at <strong className="text-[#f0c040]">₹{result.pcb.toFixed(1)}</strong>. Current price is <strong className="text-[#f0c040]">{pos}</strong> PCB — {pos === 'ABOVE' ? (result.optType === 'CE' ? 'buyers have the edge. Bullish momentum.' : 'PE buyers in control. Bearish Nifty view.') : pos === 'BELOW' ? (result.optType === 'CE' ? 'writers winning. CE under resistance.' : 'PE writers confident. Bullish Nifty.') : 'maximum war zone. Sharp move expected.'}.</p>
                      <p>With <strong className="text-[#f0c040]">{result.dte} days to expiry</strong>: {result.dte <= 0 ? '⚠️ EXPIRY DAY — avoid OTM buys.' : result.dte <= 2 ? '⚠️ Near expiry — exit by 12:30 PM. No overnight holds.' : result.dte <= 4 ? 'Theta significant — plan exits early.' : 'Theta manageable — normal targets apply.'}</p>
                      {result.data.length < 6 && <p className="text-[#f0c040] text-xs font-mono">📊 Based on {result.data.length} days of data. Upload more CSVs for sharper God Particle!</p>}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Scenario Matrix */}
            {activeTab === 'matrix' && (
              <div>
                {result.dte <= 2 && (
                  <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-xl p-4 mb-4 text-xs font-mono text-[#ff4d6d]">
                    ⚠️ {result.dte}d to expiry — Exit by 12:30 PM. No overnight holds.
                  </div>
                )}
                {[
                  { label: '📈 GAP UP', color: '#39d98a', borderColor: 'border-[#39d98a]/20', bgColor: 'bg-[#39d98a]/10',
                    rows: [
                      { gap: 'Gap Up 200+', entry: result.optType === 'CE' ? Math.round(result.lc * 1.35) : Math.round(result.lc * 0.55) },
                      { gap: 'Gap Up 150', entry: result.optType === 'CE' ? Math.round(result.lc * 1.25) : Math.round(result.lc * 0.65) },
                      { gap: 'Gap Up 100', entry: result.optType === 'CE' ? Math.round(result.lc * 1.15) : Math.round(result.lc * 0.75) },
                      { gap: 'Gap Up 50', entry: result.optType === 'CE' ? Math.round(result.lc * 1.08) : Math.round(result.lc * 0.90) },
                    ]},
                  { label: '➡️ FLAT', color: '#f0c040', borderColor: 'border-[#f0c040]/20', bgColor: 'bg-[#f0c040]/10',
                    rows: [{ gap: 'Flat / ±50', entry: Math.round(result.lc) }]},
                  { label: '📉 GAP DOWN', color: '#ff4d6d', borderColor: 'border-[#ff4d6d]/20', bgColor: 'bg-[#ff4d6d]/10',
                    rows: [
                      { gap: 'Gap Down 50', entry: result.optType === 'CE' ? Math.round(result.lc * 0.90) : Math.round(result.lc * 1.08) },
                      { gap: 'Gap Down 100', entry: result.optType === 'CE' ? Math.round(result.lc * 0.75) : Math.round(result.lc * 1.18) },
                      { gap: 'Gap Down 150', entry: result.optType === 'CE' ? Math.round(result.lc * 0.65) : Math.round(result.lc * 1.28) },
                      { gap: 'Gap Down 200+', entry: result.optType === 'CE' ? Math.round(result.lc * 0.55) : Math.round(result.lc * 1.40) },
                    ]},
                ].map((sc, si) => (
                  <div key={si} className="mb-4">
                    <div className={`${sc.bgColor} border ${sc.borderColor} rounded-t-xl px-4 py-3 font-bold text-sm`} style={{ color: sc.color }}>{sc.label}</div>
                    <div className={`border ${sc.borderColor} border-t-0 rounded-b-xl overflow-x-auto`}>
                      <table className="w-full text-xs font-mono">
                        <thead><tr className="border-b border-[#1e1e2e]">
                          {['Scenario', 'Buy Zone', 'Target 1', 'Target 2', 'Stop Loss'].map(h => (
                            <th key={h} className="text-left px-4 py-2 text-[#6b6b85] uppercase tracking-widest font-normal">{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {sc.rows.map((row, ri) => (
                            <tr key={ri} className="border-b border-[#1e1e2e]/50">
                              <td className="px-4 py-2 font-bold">{row.gap}</td>
                              <td className="px-4 py-2 text-[#f0c040]">₹{row.entry}</td>
                              <td className="px-4 py-2 text-[#39d98a]">₹{Math.round(row.entry * 1.25)}</td>
                              <td className="px-4 py-2 text-[#39d98a]">₹{Math.round(row.entry * 1.50)}</td>
                              <td className="px-4 py-2 text-[#ff4d6d]">₹{Math.round(row.entry * 0.75)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Instagram */}
            {activeTab === 'ig' && (
              <div>
                <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-6 font-mono text-xs leading-relaxed whitespace-pre-wrap" id="igText">
{`⚛️ GOD PARTICLE ANALYSIS
${result.strike} ${result.optType} | Expiry: ${result.expiry}
━━━━━━━━━━━━━━━━━━━━━━

📍 God Particle (PCB): ₹${result.pcb.toFixed(0)}
📊 Last Close: ₹${result.lc.toFixed(2)}
📈 VWAP: ₹${result.vwap.toFixed(0)} | OI-WAP: ₹${result.oiwap.toFixed(0)}
⏰ Days to Expiry: ${result.dte}d

Signal: ${result.lc > result.pcb ? (result.optType === 'CE' ? '🟢 BUYERS IN CONTROL' : '🔴 PE BUYERS DOMINANT') : (result.optType === 'CE' ? '🔴 WRITERS WINNING' : '🟢 PE WRITERS DOMINANT')}

━━━━━━━━━━━━━━━━━━━━━━
🎯 TOMORROW'S SCENARIOS

📈 Gap Up 100+:
  Entry: ₹${result.optType === 'CE' ? Math.round(result.lc * 1.15) : Math.round(result.lc * 0.75)} | T1: ₹${result.optType === 'CE' ? Math.round(result.lc * 1.15 * 1.25) : Math.round(result.lc * 0.75 * 1.25)} | T2: ₹${result.optType === 'CE' ? Math.round(result.lc * 1.15 * 1.50) : Math.round(result.lc * 0.75 * 1.50)} | SL: ₹${result.optType === 'CE' ? Math.round(result.lc * 1.15 * 0.75) : Math.round(result.lc * 0.75 * 0.75)}

➡️ Flat Open:
  Entry: ₹${Math.round(result.lc)} | T1: ₹${Math.round(result.lc * 1.25)} | T2: ₹${Math.round(result.lc * 1.50)} | SL: ₹${Math.round(result.lc * 0.75)}

📉 Gap Down 100+:
  Entry: ₹${result.optType === 'CE' ? Math.round(result.lc * 0.75) : Math.round(result.lc * 1.18)} | T1: ₹${result.optType === 'CE' ? Math.round(result.lc * 0.75 * 1.25) : Math.round(result.lc * 1.18 * 1.30)} | T2: ₹${result.optType === 'CE' ? Math.round(result.lc * 0.75 * 1.50) : Math.round(result.lc * 1.18 * 1.60)} | SL: ₹${result.optType === 'CE' ? Math.round(result.lc * 0.75 * 0.75) : Math.round(result.lc * 1.18 * 0.75)}

━━━━━━━━━━━━━━━━━━━━━━
⚡ Pure Option Buyer | God Particle Framework
#Nifty #OptionsTrading #GodParticle #OptionBuying #NSE #NiftyWeekly`}
                </div>
                <div className="flex justify-end mt-3">
                  <button
                    onClick={() => {
                      const text = document.getElementById('igText')?.textContent || '';
                      navigator.clipboard.writeText(text).then(() => alert('Caption copied!'));
                    }}
                    className="px-4 py-2 border border-[#1e1e2e] text-xs font-bold rounded-lg hover:border-[#f0c040] hover:text-[#f0c040] transition-all"
                  >
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