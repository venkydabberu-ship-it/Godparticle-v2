import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  parseNSEOptionChain, uploadMarketData,
  getMarketData, computeGodParticle, saveAnalysis
} from '../lib/market';
import { useCredits } from '../lib/auth';

type AssetType = 'index' | 'stock';
type AnalyseMode = 'analyse' | 'backtest';
type StockAnalyseType = 'options' | 'price';

export default function Analysis() {
  const { user, profile, refreshProfile } = useAuth();
  const role = profile?.role ?? 'free';
  const isAdmin = role === 'admin';

  // ── UPLOAD STATE ──
  const [uploadAsset, setUploadAsset] = useState<AssetType>('index');
  const [uploadIndex, setUploadIndex] = useState('NIFTY50');
  const [uploadStock, setUploadStock] = useState('');
  const [uploadExpiry, setUploadExpiry] = useState('');
  const [uploadDate, setUploadDate] = useState(new Date().toISOString().split('T')[0]);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');

  // ── ANALYSE STATE ──
  const [mode, setMode] = useState<AnalyseMode>('analyse');
  const [assetType, setAssetType] = useState<AssetType>('index');
  const [stockAnalyseType, setStockAnalyseType] = useState<StockAnalyseType>('options');
  const [indexName, setIndexName] = useState('');
  const [stockName, setStockName] = useState('');
  const [optType, setOptType] = useState('');
  const [expiry, setExpiry] = useState('');
  const [strike, setStrike] = useState('');
  const [backtestDate, setBacktestDate] = useState('');
  const [backtestMonth, setBacktestMonth] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('raw');
  const [availableDates, setAvailableDates] = useState<string[]>([]);

  // ── UPGRADE MESSAGES ──
  const upgradeMsg = (needed: string, price: string) =>
    `⚠️ Upgrade to ${needed} (₹${price}/month) to unlock this`;

  const indexUpgradeMsg = (idx: string) => {
    if (['BANKNIFTY','FINNIFTY','MIDCAPNIFTY','BANKEX'].includes(idx)) {
      if (!['premium','pro','admin'].includes(role))
        return upgradeMsg('Premium', '300');
    }
    if (idx === 'SENSEX') {
      if (!['basic','premium','pro','admin'].includes(role))
        return upgradeMsg('Basic', '100');
    }
    return null;
  };

  const stockOptionsUpgradeMsg = () => {
    if (!['pro','admin'].includes(role))
      return upgradeMsg('Pro', '2500');
    return null;
  };

  // ── UPLOAD PERMISSIONS ──
  const canUploadThis = () => {
    if (isAdmin) return true;
    if (uploadAsset === 'index') {
      if (uploadIndex === 'NIFTY50') return false;
      if (uploadIndex === 'SENSEX') return ['basic','premium','pro'].includes(role);
      return ['premium','pro'].includes(role);
    }
    return ['premium','pro'].includes(role);
  };

  const showUpload = role !== 'free';

  // ── LOAD AVAILABLE DATES ──
  useEffect(() => {
    if (!indexName && !stockName) return;
    if (!expiry) return;
    const name = assetType === 'index' ? indexName : stockName;
    getMarketData(name, expiry).then(rows => {
      if (rows) setAvailableDates(rows.map((r: any) => r.trade_date).sort());
    }).catch(() => {});
  }, [indexName, stockName, expiry, assetType]);

  // ── GENERATE PAST MONTHS ──
  const getPastMonths = (yearsBack: number = 5) => {
    const months = [];
    const now = new Date();
    for (let i = 1; i <= yearsBack * 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({ label, value });
    }
    return months;
  };

  // ── HANDLE UPLOAD ──
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!uploadExpiry) { setUploadMsg('Please select expiry first!'); return; }
    if (!canUploadThis()) {
      setUploadMsg(`You cannot upload this data on your current plan. Upgrade!`);
      return;
    }
    setUploading(true);
    setUploadMsg('');
    try {
      const text = await file.text();
      const parsed = parseNSEOptionChain(text);
      const count = Object.keys(parsed).length;
      if (!count) { setUploadMsg('No valid data found in CSV!'); return; }
      const name = uploadAsset === 'index' ? uploadIndex : uploadStock;
      const res = await uploadMarketData(name, uploadExpiry, uploadDate, parsed, user.id,
        uploadAsset === 'stock' ? uploadStock : undefined);
      if (isAdmin) {
        setUploadMsg(res.status === 'duplicate'
          ? `⚠️ Data already exists for ${name} | ${uploadExpiry} | ${uploadDate} — Skipped!`
          : `✅ Saved ${count} strikes for ${name} | ${uploadExpiry} | ${uploadDate}`);
      } else {
        setUploadMsg(`✅ Data saved — ${count} strikes`);
      }
    } catch (err: any) {
      setUploadMsg(`Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  // ── HANDLE ANALYSE ──
  async function handleAnalyse() {
    if (!user || !profile) return;
    setError('');

    const name = assetType === 'index' ? indexName : stockName;
    if (!name) { setError('Select an index or stock!'); return; }

    // Check upgrade
    if (assetType === 'index' && indexUpgradeMsg(indexName)) {
      setError(indexUpgradeMsg(indexName)!); return;
    }
    if (assetType === 'stock' && stockAnalyseType === 'options' && stockOptionsUpgradeMsg()) {
      setError(stockOptionsUpgradeMsg()!); return;
    }
    if (assetType === 'stock' && stockAnalyseType === 'options' && !['pro','admin'].includes(role)) {
      setError(upgradeMsg('Pro', '2500')); return;
    }

    if (!expiry) { setError('Select expiry!'); return; }
    if (!strike && stockAnalyseType !== 'price') { setError('Enter strike price!'); return; }
    if (!optType && stockAnalyseType !== 'price') { setError('Select CE or PE!'); return; }

    if (!['admin','premium','pro'].includes(role) && (profile.credits ?? 0) < 2) {
      setError('Not enough credits! Buy more credits to continue.'); return;
    }

    setAnalysing(true);
    try {
      const rows = await getMarketData(name, expiry);
      if (!rows || !rows.length) {
        setError('No data found. Upload CSVs first!'); return;
      }

      let filteredRows = rows;

      // BACKTEST — filter by selected date/month
      if (mode === 'backtest') {
        if (assetType === 'index' && backtestDate) {
          filteredRows = rows.filter((r: any) => r.trade_date <= backtestDate);
        } else if (assetType === 'stock' && backtestMonth) {
          filteredRows = rows.filter((r: any) => r.trade_date.startsWith(backtestMonth));
        }
      }

      const last6 = filteredRows.slice(-6);
      if (last6.length < 2) {
        setError(`Not enough data for selected period. Need at least 2 days!`); return;
      }

      const data = last6.map((r: any) => {
        const sd = r.strike_data[strike];
        if (!sd && stockAnalyseType !== 'price') return null;
        const isCE = optType === 'CE';
        if (stockAnalyseType === 'price') {
          return { date: r.trade_date, close: sd?.ce_ltp ?? 0, volume: sd?.ce_vol ?? 0, oi: sd?.ce_oi ?? 0, chng_oi: sd?.ce_chng_oi ?? 0 };
        }
        return {
          date: r.trade_date,
          close: isCE ? sd.ce_ltp : sd.pe_ltp,
          volume: isCE ? sd.ce_vol : sd.pe_vol,
          oi: isCE ? sd.ce_oi : sd.pe_oi,
          chng_oi: isCE ? sd.ce_chng_oi : sd.pe_chng_oi
        };
      }).filter(Boolean);

      if (data.length < 2) {
        setError(`Only ${data.length} day(s) of data. Need at least 2!`); return;
      }

      if (!['admin','premium','pro'].includes(role)) {
        await useCredits(user.id, 2);
        await refreshProfile();
      }

      const computed = computeGodParticle(data, parseFloat(strike) || 0, optType || 'CE', expiry, name);
      await saveAnalysis(user.id, name, parseFloat(strike) || 0, optType || 'CE', expiry, computed);
      setResult({ ...computed, mode, backtestDate, backtestMonth });
      setActiveTab('raw');
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

  // ── FIELD ACTIVE STATES ──
  const assetSelected = assetType !== undefined;
  const nameSelected = assetType === 'index' ? !!indexName : !!stockName;
  const typeSelected = stockAnalyseType !== undefined;
  const optTypeSelected = !!optType;
  const expirySelected = !!expiry;

  const fieldClass = (active: boolean) =>
    `transition-all duration-300 ${active ? 'opacity-100' : 'opacity-30 pointer-events-none'}`;

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
              {['premium','admin','pro'].includes(role) ? '∞' : profile?.credits ?? 0}
            </span>
          </div>
          <Link to="/dashboard" className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040]">← Dashboard</Link>
        </div>
      </nav>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">

        {!result ? (
          <>
            {/* ── UPLOAD SECTION ── */}
            {showUpload && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 mb-6">
                <h2 className="text-sm font-black uppercase tracking-widest text-[#6b6b85] mb-4">
                  📤 Upload CSV Data
                </h2>

                {/* Plan notification */}
                {!isAdmin && (
                  <div className={`rounded-lg px-4 py-2 text-xs font-mono mb-4 ${
                    role === 'basic' ? 'bg-[#39d98a]/5 border border-[#39d98a]/20 text-[#39d98a]' :
                    role === 'premium' ? 'bg-[#4d9fff]/5 border border-[#4d9fff]/20 text-[#4d9fff]' :
                    'bg-[#f0c040]/5 border border-[#f0c040]/20 text-[#f0c040]'
                  }`}>
                    {role === 'basic' && '📊 Basic Plan · You can upload Sensex data only · If you have Sensex data, please upload it'}
                    {role === 'premium' && '📊 Premium Plan · You can upload any index or stock data except Nifty 50 · If you have the data, please upload it'}
                    {role === 'pro' && '📊 Pro Plan · You can upload any index or stock data except Nifty 50 · Full access enabled'}
                  </div>
                )}

                {/* Asset Type */}
                {['premium','pro','admin'].includes(role) && (
                  <div className="flex gap-2 mb-4">
                    {(['index','stock'] as AssetType[]).map(t => (
                      <button key={t} onClick={() => setUploadAsset(t)}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${uploadAsset === t ? 'bg-[#f0c040] text-black' : 'bg-[#16161f] text-[#6b6b85] border border-[#1e1e2e]'}`}>
                        {t === 'index' ? '📈 Index' : '🏢 Stock'}
                      </button>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  {/* Index or Stock name */}
                  {uploadAsset === 'index' ? (
                    <div>
                      <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Index</label>
                      <select value={uploadIndex} onChange={e => setUploadIndex(e.target.value)}
                        className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]">
                        {isAdmin && <option value="NIFTY50">Nifty 50</option>}
                        {['basic','premium','pro','admin'].includes(role) && <option value="SENSEX">Sensex</option>}
                        {['premium','pro','admin'].includes(role) && <>
                          <option value="BANKNIFTY">Bank Nifty</option>
                          <option value="FINNIFTY">Fin Nifty</option>
                          <option value="MIDCAPNIFTY">MidCap Nifty</option>
                          <option value="BANKEX">BankEx</option>
                        </>}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Stock Name</label>
                      <input type="text" value={uploadStock} onChange={e => setUploadStock(e.target.value.toUpperCase())}
                        placeholder="e.g. SBI, HDFC, TCS"
                        className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]" />
                    </div>
                  )}

                  {/* Expiry */}
                  <div>
                    <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Expiry</label>
                    <select value={uploadExpiry} onChange={e => setUploadExpiry(e.target.value)}
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

                  {/* Date */}
                  <div>
                    <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Date of CSV</label>
                    <input type="date" value={uploadDate} onChange={e => setUploadDate(e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]" />
                  </div>
                </div>

                <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer transition-all ${canUploadThis() ? 'border-[#1e1e2e] hover:border-[#f0c040]' : 'border-[#ff4d6d]/30 opacity-50 cursor-not-allowed'}`}>
                  <input type="file" accept=".csv" className="hidden" onChange={handleUpload} disabled={!canUploadThis() || uploading} />
                  <div className="text-3xl mb-2">📄</div>
                  <div className="text-sm font-mono text-[#6b6b85]">
                    {uploading ? '⏳ Uploading...' : canUploadThis() ? 'Click to upload NSE Option Chain CSV' : '🔒 Not available on your plan'}
                  </div>
                </label>

                {uploadMsg && (
                  <div className={`mt-3 text-xs font-mono px-4 py-2 rounded-lg ${
                    uploadMsg.startsWith('✅') ? 'bg-[#39d98a]/10 text-[#39d98a] border border-[#39d98a]/30' :
                    uploadMsg.startsWith('⚠️') ? 'bg-[#f0c040]/10 text-[#f0c040] border border-[#f0c040]/30' :
                    'bg-[#ff4d6d]/10 text-[#ff4d6d] border border-[#ff4d6d]/30'}`}>
                    {uploadMsg}
                  </div>
                )}
              </div>
            )}

            {/* ── ANALYSE SECTION ── */}
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">

              {/* Mode Toggle */}
              <div className="flex gap-2 mb-6">
                <button onClick={() => setMode('analyse')}
                  className={`px-5 py-2.5 rounded-xl text-sm font-black transition-all ${mode === 'analyse' ? 'bg-[#f0c040] text-black' : 'bg-[#16161f] text-[#6b6b85] border border-[#1e1e2e] hover:border-[#f0c040]'}`}>
                  ⚛ Analyse
                </button>
                <button onClick={() => setMode('backtest')}
                  className={`px-5 py-2.5 rounded-xl text-sm font-black transition-all ${mode === 'backtest' ? 'bg-[#4d9fff] text-black' : 'bg-[#16161f] text-[#6b6b85] border border-[#1e1e2e] hover:border-[#4d9fff]'}`}>
                  📊 Backtest
                </button>
              </div>

              {mode === 'analyse' && (
                <div className="text-xs font-mono text-[#6b6b85] mb-4 px-1">
                  {assetType === 'index' ? '📅 Analysis will be for tomorrow based on last 6 days data' : '📅 Analysis will be for next month based on last 6 months data'}
                </div>
              )}

              {mode === 'backtest' && (
                <div className="text-xs font-mono text-[#4d9fff] mb-4 px-1">
                  📊 Backtest mode — select a past date/month to see what God Particle said then
                </div>
              )}

              {/* STEP 1 — Asset Type */}
              <div className="mb-4">
                <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                  Step 1 — What are you analysing?
                </label>
                <div className="flex gap-2">
                  {(['index','stock'] as AssetType[]).map(t => {
                    const locked = t === 'stock' && !['premium','pro','admin'].includes(role);
                    return (
                      <button key={t} onClick={() => !locked && setAssetType(t)}
                        className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all relative ${
                          assetType === t ? 'bg-[#f0c040] text-black' :
                          locked ? 'bg-[#16161f] text-[#6b6b85] border border-[#1e1e2e] opacity-40 cursor-not-allowed' :
                          'bg-[#16161f] text-[#6b6b85] border border-[#1e1e2e] hover:border-[#f0c040]'
                        }`}>
                        {t === 'index' ? '📈 Index' : '🏢 Stock'}
                        {locked && <span className="ml-1 text-[#ff4d6d]">🔒</span>}
                      </button>
                    );
                  })}
                </div>
                {assetType === 'stock' && !['premium','pro','admin'].includes(role) && (
                  <div className="mt-2 text-xs font-mono text-[#ff4d6d]">
                    ⚠️ {upgradeMsg('Premium', '300')}
                  </div>
                )}
              </div>

              {/* STEP 2 — Index or Stock Name */}
              <div className={`mb-4 ${fieldClass(assetSelected)}`}>
                <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                  Step 2 — {assetType === 'index' ? 'Select Index' : 'Enter Stock Name'}
                </label>
                {assetType === 'index' ? (
                  <div>
                    <select value={indexName} onChange={e => setIndexName(e.target.value)}
                      className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]">
                      <option value="">Select index...</option>
                      <option value="NIFTY50">Nifty 50</option>
                      <option value="SENSEX">Sensex {!['basic','premium','pro','admin'].includes(role) ? '🔒' : ''}</option>
                      <option value="BANKNIFTY">Bank Nifty {!['premium','pro','admin'].includes(role) ? '🔒' : ''}</option>
                      <option value="FINNIFTY">Fin Nifty {!['premium','pro','admin'].includes(role) ? '🔒' : ''}</option>
                      <option value="MIDCAPNIFTY">MidCap Nifty {!['premium','pro','admin'].includes(role) ? '🔒' : ''}</option>
                      <option value="BANKEX">BankEx {!['premium','pro','admin'].includes(role) ? '🔒' : ''}</option>
                    </select>
                    {indexName && indexUpgradeMsg(indexName) && (
                      <div className="mt-2 text-xs font-mono text-[#ff4d6d]">
                        ⚠️ {indexUpgradeMsg(indexName)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <input type="text" value={stockName} onChange={e => setStockName(e.target.value.toUpperCase())}
                      placeholder="e.g. SBI, HDFC, TCS, RELIANCE"
                      className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]" />
                    {/* Stock analyse type */}
                    {stockName && (
                      <div className="flex gap-2 mt-3">
                        {(['options','price'] as StockAnalyseType[]).map(t => {
                          const locked = t === 'options' && !['pro','admin'].includes(role);
                          return (
                            <button key={t} onClick={() => !locked && setStockAnalyseType(t)}
                              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                                stockAnalyseType === t ? 'bg-[#f0c040] text-black' :
                                locked ? 'bg-[#16161f] text-[#6b6b85] border border-[#1e1e2e] opacity-40 cursor-not-allowed' :
                                'bg-[#16161f] text-[#6b6b85] border border-[#1e1e2e] hover:border-[#f0c040]'
                              }`}>
                              {t === 'options' ? '📊 Stock Options' : '📈 Stock Price'}
                              {locked && ' 🔒'}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {stockName && stockAnalyseType === 'options' && stockOptionsUpgradeMsg() && (
                      <div className="mt-2 text-xs font-mono text-[#ff4d6d]">
                        ⚠️ {stockOptionsUpgradeMsg()}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* STEP 3 — CE/PE (only for options) */}
              {(assetType === 'index' || (assetType === 'stock' && stockAnalyseType === 'options')) && (
                <div className={`mb-4 ${fieldClass(nameSelected)}`}>
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                    Step 3 — Option Type
                  </label>
                  <div className="flex gap-2">
                    {['CE','PE'].map(t => (
                      <button key={t} onClick={() => setOptType(t)}
                        className={`px-6 py-2.5 rounded-lg text-sm font-black transition-all ${
                          optType === t
                            ? t === 'CE' ? 'bg-[#39d98a] text-black' : 'bg-[#ff4d6d] text-black'
                            : 'bg-[#16161f] text-[#6b6b85] border border-[#1e1e2e] hover:border-[#f0c040]'
                        }`}>
                        {t === 'CE' ? '📈 CE — Call' : '📉 PE — Put'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 4 — Expiry */}
              <div className={`mb-4 ${fieldClass(nameSelected && (stockAnalyseType === 'price' || !!optType))}`}>
                <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                  Step {assetType === 'stock' && stockAnalyseType === 'price' ? '3' : '4'} — Expiry
                </label>
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

              {/* STEP 5 — Strike (only for options) */}
              {(assetType === 'index' || (assetType === 'stock' && stockAnalyseType === 'options')) && (
                <div className={`mb-4 ${fieldClass(expirySelected)}`}>
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                    Step 5 — Strike Price
                  </label>
                  <input type="number" value={strike} onChange={e => setStrike(e.target.value)}
                    placeholder="e.g. 24000" step="50"
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]" />
                </div>
              )}

              {/* BACKTEST DATE/MONTH PICKER */}
              {mode === 'backtest' && expirySelected && (
                <div className="mb-4 bg-[#4d9fff]/5 border border-[#4d9fff]/20 rounded-xl p-4">
                  <label className="block text-xs font-mono text-[#4d9fff] uppercase tracking-widest mb-3">
                    📊 Select Backtest Period
                  </label>
                  {assetType === 'index' ? (
                    <div>
                      <label className="block text-xs font-mono text-[#6b6b85] mb-2">Select date (past only)</label>
                      <select value={backtestDate} onChange={e => setBacktestDate(e.target.value)}
                        className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#4d9fff]">
                        <option value="">Select date...</option>
                        {availableDates.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                      {availableDates.length === 0 && (
                        <div className="text-xs font-mono text-[#6b6b85] mt-2">
                          No dates available — upload CSVs first
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-mono text-[#6b6b85] mb-2">Select month (up to 5 years back)</label>
                      <select value={backtestMonth} onChange={e => setBacktestMonth(e.target.value)}
                        className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#4d9fff]">
                        <option value="">Select month...</option>
                        {getPastMonths(5).map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-lg px-4 py-2 text-xs font-mono text-[#ff4d6d] mb-4">
                  {error}
                </div>
              )}

              <button onClick={handleAnalyse} disabled={analysing}
                className="w-full bg-[#f0c040] text-black font-black py-3 rounded-xl hover:bg-[#ffd060] transition-all disabled:opacity-40 disabled:cursor-not-allowed text-sm">
                {analysing ? '⏳ Analysing...' : mode === 'backtest' ? '📊 Run Backtest — 2 Credits' : '⚛ Run God Particle Analysis — 2 Credits'}
              </button>
            </div>
          </>
        ) : (
          // ── RESULTS ──
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-black">
                  {result.mode === 'backtest' ? '📊 Backtest: ' : 'Analysis: '}
                  <span className="text-[#f0c040]">{result.strike} {result.optType}</span>
                </h2>
                {result.mode === 'backtest' && (
                  <div className="text-xs font-mono text-[#4d9fff] mt-1">
                    Backtesting as of {result.backtestDate || result.backtestMonth}
                  </div>
                )}
                {result.mode === 'analyse' && (
                  <div className="text-xs font-mono text-[#39d98a] mt-1">
                    {result.optType ? '📅 Analysis for tomorrow' : '📅 Analysis for next month'}
                  </div>
                )}
              </div>
              <button onClick={() => setResult(null)}
                className="px-4 py-2 text-xs font-bold border border-[#1e1e2e] rounded-lg hover:border-[#f0c040] transition-all">
                ← New Analysis
              </button>
            </div>

            {/* Admin Card */}
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

            {/* Customer Card */}
            {!isAdmin && (
              <div className="rounded-2xl p-6 mb-6 text-center relative overflow-hidden"
                style={{
                  background: result.optType === 'CE' ? 'linear-gradient(135deg, #0a1a0a, #0a0a0f)' : 'linear-gradient(135deg, #1a0a0a, #0a0a0f)',
                  border: result.optType === 'CE' ? '1px solid rgba(57,217,138,0.3)' : '1px solid rgba(255,77,109,0.3)',
                }}>
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
                      background: result.optType === 'CE' ? 'rgba(57,217,138,0.1)' : 'rgba(255,77,109,0.1)',
                      border: result.optType === 'CE' ? '1px solid rgba(57,217,138,0.3)' : '1px solid rgba(255,77,109,0.3)'
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

            {/* Tabs */}
            <div className="flex gap-1 bg-[#111118] rounded-xl p-1 mb-6 overflow-x-auto">
              {(isAdmin ? adminTabs : customerTabs).map((t, i) => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${activeTab === t ? 'bg-[#16161f] text-[#e8e8f0] border border-[#1e1e2e]' : 'text-[#6b6b85]'}`}>
                  {isAdmin ? adminTabLabels[i] : customerTabLabels[i]}
                </button>
              ))}
            </div>

            {/* RAW */}
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

            {/* DECOMP — Admin */}
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

            {/* GOD PARTICLE — Admin */}
            {activeTab === 'gp' && isAdmin && (
              <div>
                {result.insights?.length > 0 && (
                  <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 mb-4">
                    <div className="text-sm font-black mb-3 text-[#f0c040]">🔬 Critical Insights</div>
                    <div className="space-y-2">
                      {result.insights.map((ins: string, i: number) => (
                        <div key={i} className="text-xs font-mono text-[#e8e8f0] leading-relaxed border-l-2 border-[#f0c040]/30 pl-3">{ins}</div>
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

            {/* STORY */}
            {activeTab === 'story' && (
              <div className="rounded-xl p-6 text-sm leading-relaxed"
                style={{
                  background: isAdmin ? '#111118' : result.optType === 'CE' ? 'linear-gradient(135deg, #0a1a0a, #0a0a0f)' : 'linear-gradient(135deg, #1a0a0a, #0a0a0f)',
                  border: isAdmin ? '1px solid #1e1e2e' : result.optType === 'CE' ? '1px solid rgba(57,217,138,0.2)' : '1px solid rgba(255,77,109,0.2)'
                }}>
                {isAdmin ? (
                  <div className="space-y-4 font-mono text-xs">
                    {result.story?.split('\n\n').map((para: string, i: number) => (
                      <div key={i}>
                        {para.includes(':') && para.split('\n')[0].endsWith(':') ? (
                          <div>
                            <div className="text-[#f0c040] font-bold mb-2 text-sm">{para.split('\n')[0]}</div>
                            <div className="text-[#e8e8f0] leading-relaxed pl-2">{para.split('\n').slice(1).join('\n')}</div>
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
                    {result.insights?.slice(0, 3).map((ins: string, i: number) => (
                      <div key={i} className="text-[#e8e8f0] leading-relaxed border-l-2 pl-3 py-1"
                        style={{borderColor: result.optType === 'CE' ? 'rgba(57,217,138,0.4)' : 'rgba(255,77,109,0.4)'}}>
                        {ins}
                      </div>
                    ))}
                    <div className="mt-6 text-center text-[10px] font-mono text-[#6b6b85]">
                      Not Financial Advice · God Particle ⚛
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* MATRIX */}
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
                      { label: '📈 GAP UP', color: '#39d98a', border: 'border-[#39d98a]/20', bg: 'bg-[#39d98a]/10', rows: result.matrix?.filter((r: any) => r.gap.includes('Up')) ?? [] },
                      { label: '➡️ FLAT', color: '#f0c040', border: 'border-[#f0c040]/20', bg: 'bg-[#f0c040]/10', rows: result.matrix?.filter((r: any) => r.gap.includes('Flat')) ?? [] },
                      { label: '📉 GAP DOWN', color: '#ff4d6d', border: 'border-[#ff4d6d]/20', bg: 'bg-[#ff4d6d]/10', rows: result.matrix?.filter((r: any) => r.gap.includes('Down')) ?? [] },
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
                  <div className="relative rounded-2xl overflow-hidden p-8"
                    style={{
                      background: result.optType === 'CE' ? 'linear-gradient(135deg, #0a0a0f 0%, #0a1a0a 50%, #0a0a0f 100%)' : 'linear-gradient(135deg, #0a0a0f 0%, #1a0a0a 50%, #0a0a0f 100%)',
                      border: result.optType === 'CE' ? '1px solid rgba(57,217,138,0.3)' : '1px solid rgba(255,77,109,0.3)',
                      boxShadow: result.optType === 'CE' ? '0 0 60px rgba(57,217,138,0.08)' : '0 0 60px rgba(255,77,109,0.08)'
                    }}>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                      <div className="text-[220px] font-black opacity-[0.025]"
                        style={{color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d'}}>⚛</div>
                    </div>
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
                        EXPIRY: <strong className="text-[#e8e8f0]">{result.expiry?.toUpperCase()}</strong>
                      </div>
                    </div>
                    <div className="relative z-10 overflow-x-auto mb-8">
                      <table className="w-full font-mono text-sm">
                        <thead>
                          <tr style={{borderBottom: result.optType === 'CE' ? '1px solid rgba(57,217,138,0.3)' : '1px solid rgba(255,77,109,0.3)'}}>
                            {['SCENARIO','BUY ZONE','TARGET','STOP LOSS'].map(h => (
                              <th key={h} className="text-left px-4 py-3 text-xs tracking-widest font-bold"
                                style={{color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d'}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.matrix?.map((row: any, i: number) => (
                            <tr key={i} style={{borderBottom: '1px solid rgba(255,255,255,0.04)'}}>
                              <td className="px-4 py-3 font-bold text-[#e8e8f0] text-xs">{row.gap}</td>
                              {row.avoid ? (
                                <td colSpan={3} className="px-4 py-3 font-black text-xs"
                                  style={{color: result.optType === 'CE' ? '#ff4d6d' : '#39d98a'}}>AVOID</td>
                              ) : (
                                <>
                                  <td className="px-4 py-3 font-bold text-xs"
                                    style={{color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d'}}>
                                    ₹{row.buyZoneLow}–₹{row.buyZoneHigh}
                                  </td>
                                  <td className="px-4 py-3 font-bold text-[#f0c040] text-xs">₹{row.t1}</td>
                                  <td className="px-4 py-3 font-bold text-[#e8e8f0] text-xs">₹{row.sl}</td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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

📍 God Particle (PCB): ₹${result.pcb?.toFixed(0)}
📊 Last Close: ₹${result.lc?.toFixed(2)}
📈 VWAP: ₹${result.vwap?.toFixed(0)} | OI-WAP: ₹${result.oiwap?.toFixed(0)}
⏰ Days to Expiry: ${result.dte}d
📊 OI Growth: ${result.oiGrowthMultiple}x

Signal: ${result.lc > result.pcb ? (result.optType === 'CE' ? '🟢 BUYERS IN CONTROL' : '🔴 PE BUYERS DOMINANT') : (result.optType === 'CE' ? '🔴 WRITERS WINNING' : '🟢 PE WRITERS DOMINANT')}

━━━━━━━━━━━━━━━━━━━━━━
🎯 TOMORROW'S SCENARIOS

📈 Gap Up 100+:
  Entry: ₹${result.matrix?.find((r: any) => r.gap === 'Gap Up 100')?.buyZoneHigh ?? '—'} | T1: ₹${result.matrix?.find((r: any) => r.gap === 'Gap Up 100')?.t1 ?? '—'} | SL: ₹${result.matrix?.find((r: any) => r.gap === 'Gap Up 100')?.sl ?? '—'}

➡️ Flat Open:
  Entry: ₹${result.matrix?.find((r: any) => r.gap?.includes('Flat'))?.buyZoneHigh ?? '—'} | T1: ₹${result.matrix?.find((r: any) => r.gap?.includes('Flat'))?.t1 ?? '—'} | SL: ₹${result.matrix?.find((r: any) => r.gap?.includes('Flat'))?.sl ?? '—'}

📉 Gap Down 100:
  Entry: ₹${result.matrix?.find((r: any) => r.gap === 'Gap Down 100')?.buyZoneHigh ?? '—'} | T1: ₹${result.matrix?.find((r: any) => r.gap === 'Gap Down 100')?.t1 ?? '—'} | SL: ₹${result.matrix?.find((r: any) => r.gap === 'Gap Down 100')?.sl ?? '—'}

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
