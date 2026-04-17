import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { computeGodParticle, saveAnalysis } from '../lib/market';

export default function StockAnalysis() {
  const { user, profile, refreshProfile } = useAuth();
  const role = profile?.role ?? 'free';
  const isAdmin = role === 'admin';

  const [analysisType, setAnalysisType] = useState<'gct' | 'options'>('gct');
  const [stockName, setStockName] = useState('');
  const [sector, setSector] = useState('Default');
  const [csvData, setCsvData] = useState<any[]>([]);
  const [dataSource, setDataSource] = useState<'upload' | 'autofetch'>('upload');
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchMsg, setFetchMsg] = useState('');
  const [optExpiry, setOptExpiry] = useState('');
  const [optStrike, setOptStrike] = useState('');
  const [optType, setOptType] = useState('CE');
  const [optCsvData, setOptCsvData] = useState<any[]>([]);
  const [optFetchLoading, setOptFetchLoading] = useState(false);
  const [optFetchMsg, setOptFetchMsg] = useState('');
  const [optDataSource, setOptDataSource] = useState<'upload' | 'autofetch'>('upload');
  const [exchange, setExchange] = useState<'NSE' | 'BSE'>('NSE');
  const [pe, setPe] = useState('');
  const [eps, setEps] = useState('');
  const [bookValue, setBookValue] = useState('');
  const [roce, setRoce] = useState('');
  const [rev2, setRev2] = useState('');
  const [rev3, setRev3] = useState('');
  const [profit2, setProfit2] = useState('');
  const [profit3, setProfit3] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'input' | 'result'>('input');
  const [activeTab, setActiveTab] = useState('raw');

  const sectorPE: Record<string, number> = {
    'Energy/Oil': 18, 'Banking': 20, 'IT': 28,
    'Defence/PSU': 30, 'FMCG': 50, 'Pharma': 35,
    'Auto': 25, 'Conglomerate': 22, 'Default': 25
  };

  const canAccess = ['premium', 'pro', 'admin'].includes(role);
  const canAutoFetch = ['pro', 'admin'].includes(role);

  // ── AUTO FETCH STOCK PRICE — uses Edge Function ──
  async function handleAutoFetchPrice() {
    if (!stockName.trim()) { setError('Enter stock name first!'); return; }
    if (!user || !profile) return;

    if (role === 'premium') {
      if ((profile.credits ?? 0) < 2) {
        setError('Need 2 credits to auto fetch. Buy more credits!');
        return;
      }
      await supabase.rpc('use_credits', { p_user_id: user.id, p_credits: 2 });
      await refreshProfile();
    }

    setFetchLoading(true);
    setFetchMsg('⏳ Checking database...');
    setError('');

    try {
      // Check existing data first
      const { data: existing } = await supabase
        .from('stock_price_data')
        .select('*')
        .eq('stock_name', stockName.toUpperCase())
        .order('trade_date', { ascending: false })
        .limit(365);

      if (existing && existing.length >= 60) {
        setFetchMsg(`✅ Found ${existing.length} days in database!`);
        processMonthlyData(existing);
        return;
      }

      setFetchMsg('⏳ Fetching from NSE via server...');

      // Use Supabase Edge Function
      const { data, error: fnError } = await supabase.functions.invoke('fetch-nse-data', {
        body: { type: 'stock_price', symbol: stockName.toUpperCase(), exchange }
      });

      if (fnError) throw new Error(fnError.message);
      if (!data?.success) throw new Error(data?.error || 'Fetch failed');

      const records = data.data?.data || [];
      if (!records.length) throw new Error(`No data for ${stockName}. Check symbol.`);

      const toSave = records.map((r: any) => ({
        stock_name: stockName.toUpperCase(),
        trade_date: r.CH_TIMESTAMP,
        open: parseFloat(r.CH_OPENING_PRICE || 0),
        high: parseFloat(r.CH_TRADE_HIGH_PRICE || 0),
        low: parseFloat(r.CH_TRADE_LOW_PRICE || 0),
        close: parseFloat(r.CH_CLOSING_PRICE || 0),
        volume: parseFloat(r.CH_TOT_TRADED_QTY || 0),
      }));

      await supabase.from('stock_price_data')
        .upsert(toSave, { onConflict: 'stock_name,trade_date' });

      // Save fundamentals (52W H/L + LTP) to data bank
      const sorted = [...toSave].sort((a, b) => b.trade_date.localeCompare(a.trade_date));
      const latestRaw = records.find((r: any) => r.CH_TIMESTAMP === sorted[0]?.trade_date);
      if (latestRaw) {
        const today = new Date().toISOString().split('T')[0];
        await supabase.from('stock_fundamentals').upsert({
          stock_name: stockName.toUpperCase(),
          trade_date: today,
          ltp: sorted[0].close,
          week52_high: parseFloat(latestRaw.CH_52WEEK_HIGH_PRICE || 0) || null,
          week52_low: parseFloat(latestRaw.CH_52WEEK_LOW_PRICE || 0) || null,
        }, { onConflict: 'stock_name,trade_date' });
      }

      setFetchMsg(`✅ Fetched ${records.length} days — saved to Data Bank!`);
      processMonthlyData(toSave);

    } catch (err: any) {
      setError(err.message || 'Auto fetch failed! Upload CSV manually.');
      setFetchMsg('');
    } finally {
      setFetchLoading(false);
    }
  }

  // ── AUTO FETCH STOCK OPTIONS — uses Edge Function ──
  async function handleAutoFetchOptions() {
    if (!stockName.trim()) { setError('Enter stock name first!'); return; }
    if (!optExpiry) { setError('Select expiry date first!'); return; }
    if (!user || !profile) return;

    setOptFetchLoading(true);
    setOptFetchMsg('⏳ Checking database...');
    setError('');

    try {
      // Check existing data first
      const { data: existing } = await supabase
        .from('market_data')
        .select('*')
        .eq('index_name', stockName.toUpperCase())
        .eq('expiry', optExpiry)
        .order('trade_date', { ascending: false })
        .limit(30);

      if (existing && existing.length >= 3) {
        setOptFetchMsg(`✅ Found ${existing.length} days of ${stockName} option data!`);
        const optData = existing.map((r: any) => {
          const sd = r.strike_data?.[optStrike];
          if (!sd) return null;
          const isCE = optType === 'CE';
          return {
            date: r.trade_date,
            close: isCE ? sd.ce_ltp : sd.pe_ltp,
            volume: isCE ? sd.ce_vol : sd.pe_vol,
            oi: isCE ? sd.ce_oi : sd.pe_oi,
            chng_oi: isCE ? sd.ce_chng_oi : sd.pe_chng_oi,
          };
        }).filter(Boolean);
        setOptCsvData(optData);
        return;
      }

      setOptFetchMsg('⏳ Fetching stock option chain via server...');

      // Use Supabase Edge Function
      const { data, error: fnError } = await supabase.functions.invoke('fetch-nse-data', {
        body: { type: 'stock_chain', symbol: stockName.toUpperCase(), exchange }
      });

      if (fnError) throw new Error(fnError.message);
      if (!data?.success) throw new Error(data?.error || 'Fetch failed');

      const records = data.data?.records?.data || [];
      if (!records.length) throw new Error(`No options data for ${stockName}`);

      // Parse strikes
      const strikes: Record<string, any> = {};
      records.forEach((r: any) => {
        const strike = r.strikePrice;
        if (!strike) return;
        strikes[strike] = {
          ce_ltp: r.CE?.lastPrice || 0,
          ce_oi: r.CE?.openInterest || 0,
          ce_chng_oi: r.CE?.changeinOpenInterest || 0,
          ce_vol: r.CE?.totalTradedVolume || 0,
          pe_ltp: r.PE?.lastPrice || 0,
          pe_oi: r.PE?.openInterest || 0,
          pe_chng_oi: r.PE?.changeinOpenInterest || 0,
          pe_vol: r.PE?.totalTradedVolume || 0,
        };
      });

      const today = new Date().toISOString().split('T')[0];

      // Save to database
      await supabase.from('market_data').insert({
        index_name: stockName.toUpperCase(),
        expiry: optExpiry,
        trade_date: today,
        strike_data: strikes,
        uploaded_by: user.id,
        category: 'stock',
        timeframe: 'daily'
      });

      setOptFetchMsg(`✅ Fetched ${Object.keys(strikes).length} strikes for ${stockName} — saved to Data Bank!`);

      // Get last 6 days from DB now
      const { data: rows } = await supabase
        .from('market_data')
        .select('*')
        .eq('index_name', stockName.toUpperCase())
        .eq('expiry', optExpiry)
        .order('trade_date', { ascending: true })
        .limit(6);

      if (rows && rows.length > 0 && optStrike) {
        const isCE = optType === 'CE';
        const optData = rows.map((r: any) => {
          const s = r.strike_data?.[optStrike];
          if (!s) return null;
          return {
            date: r.trade_date,
            close: isCE ? s.ce_ltp : s.pe_ltp,
            volume: isCE ? s.ce_vol : s.pe_vol,
            oi: isCE ? s.ce_oi : s.pe_oi,
            chng_oi: isCE ? s.ce_chng_oi : s.pe_chng_oi,
          };
        }).filter(Boolean);
        setOptCsvData(optData);
        setOptFetchMsg(`✅ ${optData.length} days of ${stockName} ${optStrike} ${optType} ready!`);
      } else if (optStrike && strikes[optStrike]) {
        const sd = strikes[optStrike];
        const isCE = optType === 'CE';
        setOptCsvData([{
          date: today,
          close: isCE ? sd.ce_ltp : sd.pe_ltp,
          volume: isCE ? sd.ce_vol : sd.pe_vol,
          oi: isCE ? sd.ce_oi : sd.pe_oi,
          chng_oi: isCE ? sd.ce_chng_oi : sd.pe_chng_oi,
        }]);
      }

    } catch (err: any) {
      setError(err.message || 'Options fetch failed! Upload CSV manually.');
      setOptFetchMsg('');
    } finally {
      setOptFetchLoading(false);
    }
  }

  // ── PROCESS MONTHLY DATA ──
  function processMonthlyData(rawData: any[]) {
    const monthly: Record<string, any> = {};
    rawData.forEach((row: any) => {
      const date = row.trade_date;
      if (!date) return;
      const d = new Date(date);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (!monthly[key] || new Date(date) > new Date(monthly[key].date)) {
        monthly[key] = {
          date,
          high: parseFloat(row.high || 0),
          low: parseFloat(row.low || 0),
          close: parseFloat(row.close || 0),
          volume: parseFloat(row.volume || 0),
        };
      }
    });
    const monthlyData = Object.values(monthly).slice(-12)
      .filter((r: any) => r.high > 0 && r.volume > 0);
    if (monthlyData.length < 6) {
      setError('Not enough data! Need at least 6 months.');
      return;
    }
    setCsvData(monthlyData as any[]);
    setFetchMsg(prev => prev + ` · ${monthlyData.length} months ready!`);
  }

  // ── CSV UPLOAD — PRICE ──
  async function handlePriceCSV(e: React.ChangeEvent<HTMLInputElement>) {
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
    const monthly: Record<string, any> = {};
    rows.forEach(row => {
      const date = row.DATE;
      const parts = date.split('-');
      const key = parts[0].length === 4
        ? `${parts[0]}-${parts[1]}`
        : `${parts[2]}-${parts[1]}`;
      if (!monthly[key] || new Date(date) > new Date(monthly[key].DATE)) {
        monthly[key] = row;
      }
    });
    const monthlyData = Object.values(monthly).slice(-12).map((r: any) => ({
      date: r.DATE,
      high: parseFloat(r.HIGH?.replace(/,/g,'') || '0'),
      low: parseFloat(r.LOW?.replace(/,/g,'') || '0'),
      close: parseFloat(r.CLOSE?.replace(/,/g,'') || '0'),
      volume: parseFloat(r.VOLUME?.replace(/,/g,'') || '0'),
    })).filter(r => r.high > 0 && r.volume > 0);
    setCsvData(monthlyData);
  }

  // ── CSV UPLOAD — OPTIONS ──
  async function handleOptionsCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g,''));
    const rows = lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/"/g,''));
      const row: any = {};
      headers.forEach((h, i) => { row[h] = vals[i]; });
      return row;
    }).filter(r => r.Date || r.DATE);
    const optData = rows.map((r: any) => ({
      date: r.Date || r.DATE,
      close: parseFloat(r.Close || r.CLOSE || r.LTP || '0'),
      volume: parseFloat(r.Volume?.replace(/,/g,'') || r.VOLUME?.replace(/,/g,'') || '0'),
      oi: parseFloat(r.OI?.replace(/,/g,'') || r['Open Interest']?.replace(/,/g,'') || '0'),
      chng_oi: parseFloat(r['Chng in OI']?.replace(/,/g,'') || r.CHNG_OI?.replace(/,/g,'') || '0'),
    })).filter(r => r.close > 0);
    setOptCsvData(optData);
  }

  // ── RUN GCT ──
  function runGCT() {
    if (csvData.length < 6) { setError('Need at least 6 months!'); return; }
    setLoading(true);
    setError('');
    try {
      const data = csvData;
      const totalVol = data.reduce((s, d) => s + d.volume, 0);
      const tp = data.map(d => (d.high + d.low + d.close) / 3);
      const mgc = data.reduce((s, d, i) => s + tp[i] * d.volume, 0) / totalVol;
      const vwar = data.reduce((s, d) => s + (d.high - d.low) * d.volume, 0) / totalVol;
      const mcl = data.reduce((s, d) => s + d.close * d.volume, 0) / totalVol;
      const al = mgc + vwar;
      const cl = mgc - vwar;
      const vms = data.map(d => {
        const range = d.high - d.low;
        return range === 0 ? 0.5 : (d.close - d.low) / range;
      });
      const avgVms = vms.reduce((s, v) => s + v, 0) / vms.length;
      const crashLevels = [1,2,3,4,5].map(n => ({
        level: n,
        price: Math.round(mgc - vwar * n),
        label: ['Fear starts','Everyone scared','Panic/Blood on streets','Major crash','Black swan'][n-1],
        allocation: [20,30,30,15,5][n-1],
        emoji: ['🟡','🟠','🔴','💀','☠️'][n-1]
      }));
      const currentPrice = data[data.length-1].close;
      const zone = currentPrice >= al ? 'BUY ZONE' :
        currentPrice >= mgc ? 'WATCH ZONE' :
        currentPrice >= cl ? 'DANGER ZONE' : 'CRASH ZONE';
      const peVal = parseFloat(pe);
      const epsVal = parseFloat(eps);
      const bvVal = parseFloat(bookValue);
      const roceVal = parseFloat(roce);
      const benchmarkPE = sectorPE[sector] || 25;
      const fssChecks: any[] = [];
      if (peVal && epsVal) {
        const peAtLevel = currentPrice / epsVal;
        fssChecks.push({ name: 'PE Ratio', pass: peAtLevel < benchmarkPE, value: `${peAtLevel.toFixed(1)} vs ${benchmarkPE}` });
      }
      if (bvVal) {
        const pb = currentPrice / bvVal;
        fssChecks.push({ name: 'PB Ratio', pass: pb < 2.5, value: `PB = ${pb.toFixed(2)}` });
      }
      if (rev2 && rev3) {
        const r2 = parseFloat(rev2), r3 = parseFloat(rev3);
        fssChecks.push({ name: 'Revenue Growth', pass: r3 > r2, value: r3 > r2 ? `+${((r3-r2)/r2*100).toFixed(1)}%` : 'Declining' });
      }
      if (profit2 && profit3) {
        const p2 = parseFloat(profit2), p3 = parseFloat(profit3);
        fssChecks.push({ name: 'Profit Growth', pass: p3 > p2, value: p3 > p2 ? `+${((p3-p2)/p2*100).toFixed(1)}%` : 'Declining' });
      }
      if (roceVal) fssChecks.push({ name: 'ROCE', pass: roceVal >= 8, value: `${roceVal}%` });
      const fssScore = fssChecks.filter(c => c.pass).length;
      const fssVerdict = ['💀 VALUE TRAP','🔴 RISKY','⚠️ CAREFUL','⚡ DECENT BUY','✅ GOOD BUY','🟢 STRONG BUY'][fssScore];
      setResult({
        type: 'gct', stockName, currentPrice: Math.round(currentPrice),
        mgc: Math.round(mgc), vwar: Math.round(vwar),
        mcl: Math.round(mcl), al: Math.round(al), cl: Math.round(cl),
        avgVms: avgVms.toFixed(2), zone, crashLevels,
        fssChecks, fssScore, fssVerdict,
        dataMonths: data.length,
        firstDate: data[0].date, lastDate: data[data.length-1].date
      });

      // Save manually entered fundamental values to data bank
      const fundRecord: Record<string, any> = {
        stock_name: stockName.toUpperCase(),
        trade_date: new Date().toISOString().split('T')[0],
        ltp: Math.round(currentPrice),
      };
      if (pe)        fundRecord.pe_ratio   = parseFloat(pe);
      if (eps)       fundRecord.eps        = parseFloat(eps);
      if (bookValue) fundRecord.book_value = parseFloat(bookValue);
      if (roce)      fundRecord.roce       = parseFloat(roce);
      try {
        await supabase.from('stock_fundamentals')
          .upsert(fundRecord, { onConflict: 'stock_name,trade_date' });
      } catch {}

      setStep('result');
    } catch (err: any) {
      setError(err.message || 'Analysis failed!');
    } finally {
      setLoading(false);
    }
  }

  // ── RUN GOD PARTICLE ON STOCK OPTIONS ──
  async function runOptionsAnalysis() {
    if (optCsvData.length < 2) { setError('Need at least 2 days of options data!'); return; }
    if (!optStrike) { setError('Enter strike price!'); return; }
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      if (!['admin','premium','pro'].includes(role)) {
        await supabase.rpc('use_credits', { p_user_id: user.id, p_credits: 2 });
        await refreshProfile();
      }
      const computed = computeGodParticle(
        optCsvData, parseFloat(optStrike), optType, optExpiry, stockName.toUpperCase()
      );
      await saveAnalysis(user.id, stockName.toUpperCase(), parseFloat(optStrike), optType, optExpiry, computed);
      setResult({ type: 'options', ...computed, stockName });
      setActiveTab('raw');
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

  const adminTabs = ['raw','decomp','gp','story','matrix','ig'];
  const adminTabLabels = ['📊 Raw','🔀 Decomp','⚛ God Particle','📖 Story','🎯 Matrix','📸 Instagram'];
  const customerTabs = ['raw','story','matrix'];
  const customerTabLabels = ['📊 Raw Data','📖 Analysis','🎯 Trade Levels'];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#1e1e2e]">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#f0c040] rounded-xl flex items-center justify-center text-lg">⚛</div>
          <div className="font-bold text-base">God Particle</div>
        </Link>
        <Link to="/dashboard" className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040]">← Dashboard</Link>
      </nav>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="text-2xl">🏢</div>
            <h1 className="text-2xl font-black">Stock Analysis</h1>
          </div>
          <p className="text-xs font-mono text-[#6b6b85]">GCT crash levels + God Particle options analysis for any stock</p>
        </div>

        {!canAccess && (
          <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-2xl p-6 mb-6 text-center">
            <div className="text-3xl mb-3">🔒</div>
            <div className="text-sm font-bold mb-2">Premium Feature</div>
            <div className="text-xs font-mono text-[#6b6b85] mb-4">Available for Premium and above.</div>
            <Link to="/pricing" className="inline-block bg-[#f0c040] text-black font-black px-6 py-2.5 rounded-xl text-sm">Upgrade Now →</Link>
          </div>
        )}

        {canAccess && step === 'input' && (
          <div className="space-y-6">
            {/* Analysis Type */}
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
              <h2 className="text-sm font-black uppercase tracking-widest text-[#6b6b85] mb-4">Step 1 — Analysis Type</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button onClick={() => setAnalysisType('gct')}
                  className={`p-4 rounded-xl text-left transition-all border ${analysisType === 'gct' ? 'border-[#f0c040] bg-[#f0c040]/10' : 'border-[#1e1e2e] bg-[#16161f]'}`}>
                  <div className="text-lg mb-1">📊</div>
                  <div className="font-black text-sm mb-1" style={{color: analysisType === 'gct' ? '#f0c040' : '#e8e8f0'}}>GCT — Price Analysis</div>
                  <div className="text-xs font-mono text-[#6b6b85]">Find crash buying levels using 12 months price data</div>
                  <div className="text-[10px] font-mono mt-2 text-[#6b6b85]">Premium: CSV upload · Pro/Admin: Auto fetch FREE</div>
                </button>
                <button onClick={() => setAnalysisType('options')}
                  className={`p-4 rounded-xl text-left transition-all border ${analysisType === 'options' ? 'border-[#4d9fff] bg-[#4d9fff]/10' : 'border-[#1e1e2e] bg-[#16161f]'} ${!['pro','admin'].includes(role) ? 'opacity-50' : ''}`}
                  disabled={!['pro','admin'].includes(role)}>
                  <div className="text-lg mb-1">⚛</div>
                  <div className="font-black text-sm mb-1" style={{color: analysisType === 'options' ? '#4d9fff' : '#e8e8f0'}}>
                    God Particle — Options Analysis {!['pro','admin'].includes(role) && '🔒'}
                  </div>
                  <div className="text-xs font-mono text-[#6b6b85]">Full God Particle analysis on stock option strikes</div>
                  <div className="text-[10px] font-mono mt-2 text-[#6b6b85]">Pro/Admin only · Auto fetch FREE</div>
                </button>
              </div>
              {analysisType === 'options' && !['pro','admin'].includes(role) && (
                <div className="mt-3 text-xs font-mono text-[#ff4d6d]">
                  ⚠️ Stock options analysis is available for Pro plan only.
                  <Link to="/pricing" className="underline ml-1">Upgrade →</Link>
                </div>
              )}
            </div>

            {/* Stock Details */}
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
              <h2 className="text-sm font-black uppercase tracking-widest text-[#6b6b85] mb-4">Step 2 — Stock Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Stock Symbol</label>
                  <div className="flex gap-2">
                    <div className="flex rounded-lg overflow-hidden border border-[#1e1e2e] shrink-0">
                      {(['NSE', 'BSE'] as const).map(ex => (
                        <button key={ex} onClick={() => setExchange(ex)}
                          className={`px-3 py-2.5 text-xs font-black transition-all ${exchange === ex ? 'bg-[#f0c040] text-black' : 'bg-[#16161f] text-[#6b6b85]'}`}>
                          {ex}
                        </button>
                      ))}
                    </div>
                    <input type="text" value={stockName}
                      onChange={e => setStockName(e.target.value.toUpperCase())}
                      placeholder="e.g. RELIANCE, SBI, TCS"
                      className="flex-1 bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]" />
                  </div>
                </div>
                {analysisType === 'gct' && (
                  <div>
                    <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Sector</label>
                    <select value={sector} onChange={e => setSector(e.target.value)}
                      className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]">
                      {Object.keys(sectorPE).map(s => (
                        <option key={s} value={s}>{s} (PE: {sectorPE[s]})</option>
                      ))}
                    </select>
                  </div>
                )}
                {analysisType === 'options' && (
                  <>
                    <div>
                      <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Option Type</label>
                      <div className="flex gap-2">
                        {['CE','PE'].map(t => (
                          <button key={t} onClick={() => setOptType(t)}
                            className={`flex-1 py-2.5 rounded-lg text-sm font-black transition-all ${optType === t ? (t === 'CE' ? 'bg-[#39d98a] text-black' : 'bg-[#ff4d6d] text-black') : 'bg-[#16161f] text-[#6b6b85] border border-[#1e1e2e]'}`}>
                            {t === 'CE' ? '📈 CE' : '📉 PE'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Expiry</label>
                      <select value={optExpiry} onChange={e => setOptExpiry(e.target.value)}
                        className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]">
                        <option value="">Select expiry</option>
                        <option value="29-May-2026">29 May 2026</option>
                        <option value="26-Jun-2026">26 Jun 2026</option>
                        <option value="31-Jul-2026">31 Jul 2026</option>
                        <option value="27-Aug-2026">27 Aug 2026</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Strike Price</label>
                      <input type="number" value={optStrike} onChange={e => setOptStrike(e.target.value)}
                        placeholder="e.g. 500, 1000, 2500"
                        className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]" />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* GCT Data Source */}
            {analysisType === 'gct' && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
                <h2 className="text-sm font-black uppercase tracking-widest text-[#6b6b85] mb-4">Step 3 — Price Data</h2>
                <div className="flex gap-2 mb-4">
                  <button onClick={() => setDataSource('upload')}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${dataSource === 'upload' ? 'bg-[#f0c040] text-black' : 'bg-[#16161f] text-[#6b6b85] border border-[#1e1e2e]'}`}>
                    📄 Upload CSV
                  </button>
                  <button onClick={() => setDataSource('autofetch')}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${dataSource === 'autofetch' ? 'bg-[#39d98a] text-black' : 'bg-[#16161f] text-[#6b6b85] border border-[#1e1e2e]'}`}>
                    🤖 Auto Fetch {canAutoFetch ? '(FREE)' : '(2 credits)'}
                  </button>
                </div>
                {dataSource === 'upload' && (
                  <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer transition-all ${csvData.length > 0 ? 'border-[#39d98a]/50' : 'border-[#1e1e2e] hover:border-[#f0c040]'}`}>
                    <input type="file" accept=".csv" className="hidden" onChange={handlePriceCSV} />
                    <div className="text-3xl mb-2">{csvData.length > 0 ? '✅' : '📄'}</div>
                    <div className="text-sm font-mono text-[#6b6b85]">
                      {csvData.length > 0 ? `✅ ${csvData.length} months loaded` : 'Upload NSE Historical Data CSV (12-14 months)'}
                    </div>
                  </label>
                )}
                {dataSource === 'autofetch' && (
                  <div>
                    {role === 'premium' && (
                      <div className="bg-[#f0c040]/5 border border-[#f0c040]/20 rounded-xl p-3 mb-3 text-xs font-mono text-[#f0c040]">
                        ⚡ Costs 2 credits · You have {profile?.credits ?? 0} credits
                      </div>
                    )}
                    {canAutoFetch && (
                      <div className="bg-[#39d98a]/5 border border-[#39d98a]/20 rounded-xl p-3 mb-3 text-xs font-mono text-[#39d98a]">
                        ✅ Pro/Admin — Auto fetch is FREE · Data fetched via secure server
                      </div>
                    )}
                    <button onClick={handleAutoFetchPrice} disabled={fetchLoading || !stockName.trim()}
                      className="w-full bg-[#39d98a] text-black font-black py-3 rounded-xl text-sm hover:opacity-90 transition-all disabled:opacity-40">
                      {fetchLoading ? '⏳ Fetching...' : `🤖 Auto Fetch ${stockName || 'Stock'} Price Data`}
                    </button>
                    {fetchMsg && (
                      <div className="mt-3 text-xs font-mono text-[#39d98a] bg-[#39d98a]/10 border border-[#39d98a]/20 rounded-lg px-4 py-2">
                        {fetchMsg}
                      </div>
                    )}
                    {csvData.length > 0 && (
                      <div className="mt-2 text-xs font-mono text-[#39d98a] text-center">✅ {csvData.length} months ready!</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Options Data Source */}
            {analysisType === 'options' && ['pro','admin'].includes(role) && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
                <h2 className="text-sm font-black uppercase tracking-widest text-[#6b6b85] mb-4">Step 3 — Options Data</h2>
                <div className="flex gap-2 mb-4">
                  <button onClick={() => setOptDataSource('upload')}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${optDataSource === 'upload' ? 'bg-[#f0c040] text-black' : 'bg-[#16161f] text-[#6b6b85] border border-[#1e1e2e]'}`}>
                    📄 Upload CSV
                  </button>
                  <button onClick={() => setOptDataSource('autofetch')}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${optDataSource === 'autofetch' ? 'bg-[#4d9fff] text-black' : 'bg-[#16161f] text-[#6b6b85] border border-[#1e1e2e]'}`}>
                    🤖 Auto Fetch (FREE)
                  </button>
                </div>
                {optDataSource === 'upload' && (
                  <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer transition-all ${optCsvData.length > 0 ? 'border-[#39d98a]/50' : 'border-[#1e1e2e] hover:border-[#4d9fff]'}`}>
                    <input type="file" accept=".csv" className="hidden" onChange={handleOptionsCSV} />
                    <div className="text-3xl mb-2">{optCsvData.length > 0 ? '✅' : '📄'}</div>
                    <div className="text-sm font-mono text-[#6b6b85]">
                      {optCsvData.length > 0 ? `✅ ${optCsvData.length} days loaded` : 'Upload stock option chain CSV (last 1 month)'}
                    </div>
                  </label>
                )}
                {optDataSource === 'autofetch' && (
                  <div>
                    <div className="bg-[#4d9fff]/5 border border-[#4d9fff]/20 rounded-xl p-3 mb-3 text-xs font-mono text-[#4d9fff]">
                      ✅ Pro/Admin — Auto fetch stock options FREE · Via secure server
                    </div>
                    <button onClick={handleAutoFetchOptions}
                      disabled={optFetchLoading || !stockName.trim() || !optExpiry}
                      className="w-full bg-[#4d9fff] text-black font-black py-3 rounded-xl text-sm hover:opacity-90 transition-all disabled:opacity-40">
                      {optFetchLoading ? '⏳ Fetching options...' : `🤖 Auto Fetch ${stockName || 'Stock'} Option Chain`}
                    </button>
                    {optFetchMsg && (
                      <div className="mt-3 text-xs font-mono text-[#4d9fff] bg-[#4d9fff]/10 border border-[#4d9fff]/20 rounded-lg px-4 py-2">
                        {optFetchMsg}
                      </div>
                    )}
                    {optCsvData.length > 0 && (
                      <div className="mt-2 text-xs font-mono text-[#39d98a] text-center">
                        ✅ {optCsvData.length} days of options data ready!
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Fundamental Data */}
            {analysisType === 'gct' && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
                <h2 className="text-sm font-black uppercase tracking-widest text-[#6b6b85] mb-1">Step 4 — Fundamental Data (Optional)</h2>
                <div className="text-xs font-mono text-[#6b6b85] mb-4">Enter from screener.in or moneycontrol.com</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    { label: 'PE Ratio', val: pe, set: setPe, placeholder: 'e.g. 22.5' },
                    { label: 'EPS (TTM)', val: eps, set: setEps, placeholder: 'e.g. 65.4' },
                    { label: 'Book Value/share', val: bookValue, set: setBookValue, placeholder: 'e.g. 450' },
                    { label: 'ROCE %', val: roce, set: setRoce, placeholder: 'e.g. 15.2' },
                    { label: 'Revenue Y2', val: rev2, set: setRev2, placeholder: 'Cr e.g. 92000' },
                    { label: 'Revenue Y3 (latest)', val: rev3, set: setRev3, placeholder: 'Cr e.g. 98000' },
                    { label: 'Net Profit Y2', val: profit2, set: setProfit2, placeholder: 'Cr e.g. 14000' },
                    { label: 'Net Profit Y3', val: profit3, set: setProfit3, placeholder: 'Cr e.g. 16000' },
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
            )}

            {error && (
              <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-lg px-4 py-2 text-xs font-mono text-[#ff4d6d]">{error}</div>
            )}

            {analysisType === 'gct' ? (
              <button onClick={runGCT} disabled={loading || csvData.length < 6 || !stockName}
                className="w-full bg-[#f0c040] text-black font-black py-3 rounded-xl text-sm hover:bg-[#ffd060] transition-all disabled:opacity-40">
                {loading ? '⏳ Analysing...' : csvData.length < 6 ? '📊 Run GCT Analysis (get data first)' : `📊 Run GCT + FSS Analysis — ${stockName}`}
              </button>
            ) : (
              <button onClick={runOptionsAnalysis} disabled={loading || optCsvData.length < 2 || !stockName || !optStrike}
                className="w-full bg-[#4d9fff] text-black font-black py-3 rounded-xl text-sm hover:opacity-90 transition-all disabled:opacity-40">
                {loading ? '⏳ Analysing...' : optCsvData.length < 2 ? '⚛ Run God Particle Analysis (fetch options data first)' : `⚛ Run God Particle Analysis — ${stockName} ${optStrike} ${optType}`}
              </button>
            )}
          </div>
        )}

        {/* GCT RESULTS */}
        {canAccess && step === 'result' && result?.type === 'gct' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black"><span className="text-[#f0c040]">{result.stockName}</span> — GCT</h2>
              <button onClick={() => { setStep('input'); setResult(null); setCsvData([]); }}
                className="px-4 py-2 text-xs font-bold border border-[#1e1e2e] rounded-lg hover:border-[#f0c040] transition-all">← New Analysis</button>
            </div>
            <div className="rounded-2xl p-6 text-center"
              style={{ background: `linear-gradient(135deg, #0a0a0f, ${zoneColor(result.zone)}15)`, border: `1px solid ${zoneColor(result.zone)}40` }}>
              <div className="text-xs font-mono tracking-widest mb-2" style={{ color: zoneColor(result.zone) }}>⚛ GRAVITATIONAL COST THEORY</div>
              <div className="text-3xl font-black mb-1">{result.stockName}</div>
              <div className="text-2xl font-black mb-3" style={{ color: zoneColor(result.zone) }}>₹{result.currentPrice.toLocaleString()}</div>
              <div className="inline-block px-6 py-2 rounded-full font-black text-sm"
                style={{ background: `${zoneColor(result.zone)}20`, color: zoneColor(result.zone), border: `1px solid ${zoneColor(result.zone)}40` }}>
                {result.zone}
              </div>
              <div className="text-xs font-mono text-[#6b6b85] mt-2">{result.dataMonths} months · {result.firstDate} to {result.lastDate}</div>
            </div>
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
              <div className="text-sm font-black mb-4 text-[#f0c040]">📊 4 Key Technical Levels</div>
              <div className="space-y-3">
                {[
                  { label: '🟢 AL — Ascension Line', price: result.al, desc: 'BUY zone starts here', color: '#39d98a' },
                  { label: '⚪ MGC — Soul of the Stock', price: result.mgc, desc: 'Gravitational centre', color: '#4d9fff' },
                  { label: '🔵 MCL — Commitment Line', price: result.mcl, desc: 'Where institutions averaged', color: '#a78bfa' },
                  { label: '🔴 CL — Collapse Line', price: result.cl, desc: 'Danger zone starts here', color: '#ff4d6d' },
                ].map((level, i) => {
                  const prices = [result.al * 999, result.al, result.mgc, result.mcl];
                  const isCurrent = result.currentPrice >= (i < 3 ? level.price : 0) && result.currentPrice < prices[i];
                  return (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl"
                      style={{ background: `${level.color}10`, border: `1px solid ${level.color}30` }}>
                      <div>
                        <div className="text-xs font-bold" style={{ color: level.color }}>{level.label}</div>
                        <div className="text-xs font-mono text-[#6b6b85]">{level.desc}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-black" style={{ color: level.color }}>₹{level.price.toLocaleString()}</div>
                        {isCurrent && <div className="text-[10px] font-bold text-[#f0c040]">← YOU ARE HERE</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
              <div className="text-sm font-black mb-4 text-[#f0c040]">💥 Crash Buying Map</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead><tr className="border-b border-[#1e1e2e]">
                    {['Level','Price','Market Mood','Allocation'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-[#6b6b85] uppercase tracking-widest font-normal">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {result.crashLevels.map((cl: any, i: number) => {
                      const isCurrent = result.currentPrice <= cl.price && (i === 0 || result.currentPrice > result.crashLevels[i-1].price);
                      return (
                        <tr key={i} className={`border-b border-[#1e1e2e]/50 ${isCurrent ? 'bg-[#f0c040]/10' : ''}`}>
                          <td className="px-3 py-3 font-bold">{cl.emoji} L{cl.level}</td>
                          <td className="px-3 py-3 font-black text-[#f0c040]">₹{cl.price.toLocaleString()} {isCurrent && <span className="text-[10px]">← HERE</span>}</td>
                          <td className="px-3 py-3 text-[#6b6b85]">{cl.label}</td>
                          <td className="px-3 py-3 text-[#39d98a] font-bold">{cl.allocation}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {result.fssChecks?.length > 0 && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
                <div className="text-sm font-black mb-4 text-[#f0c040]">🔬 Fundamental Safety Score</div>
                <div className="space-y-2 mb-4">
                  {result.fssChecks.map((check: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-[#16161f]">
                      <span className="text-xs font-mono">{check.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-[#6b6b85]">{check.value}</span>
                        <span>{check.pass ? '✅' : '❌'}</span>
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
            <div className="bg-gradient-to-r from-[#f0c040]/10 to-transparent border border-[#f0c040]/30 rounded-2xl p-6">
              <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">⚛ God Particle Verdict</div>
              <div className="text-sm font-bold leading-relaxed">
                {result.zone === 'BUY ZONE' ? `${result.stockName}: Above AL ₹${result.al.toLocaleString()}. Safe to accumulate.` :
                 result.zone === 'CRASH ZONE' ? `${result.stockName}: Crash zone — accumulate between ₹${result.currentPrice.toLocaleString()} and ₹${result.crashLevels[4].price.toLocaleString()}. Target: MGC ₹${result.mgc.toLocaleString()}.` :
                 result.zone === 'DANGER ZONE' ? `${result.stockName}: Below soul price. Wait for MGC ₹${result.mgc.toLocaleString()} support.` :
                 `${result.stockName}: Watch for AL breakout above ₹${result.al.toLocaleString()}.`}
              </div>
              <div className="mt-3 text-xs font-mono text-[#6b6b85]">Not Financial Advice · God Particle ⚛</div>
            </div>
          </div>
        )}

        {/* OPTIONS RESULTS */}
        {canAccess && step === 'result' && result?.type === 'options' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-black"><span className="text-[#f0c040]">{result.stockName} {result.strike} {result.optType}</span></h2>
              <button onClick={() => { setStep('input'); setResult(null); setOptCsvData([]); }}
                className="px-4 py-2 text-xs font-bold border border-[#1e1e2e] rounded-lg hover:border-[#f0c040] transition-all">← New Analysis</button>
            </div>
            {isAdmin && (
              <div className="bg-gradient-to-r from-[#f0c040]/10 to-[#f0c040]/5 border border-[#f0c040]/30 rounded-2xl p-6 mb-6 flex items-center gap-8 flex-wrap">
                <div>
                  <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-1">⚛ God Particle (PCB)</div>
                  <div className="text-5xl font-black text-[#f0c040]">₹{result.pcb?.toFixed(1)}</div>
                </div>
                <div className="w-px h-14 bg-[#1e1e2e]" />
                <div className="flex flex-col gap-2">
                  <div className="text-xs font-mono"><span className="text-[#6b6b85] mr-2">VWAP</span>₹{result.vwap?.toFixed(1)}</div>
                  <div className="text-xs font-mono"><span className="text-[#6b6b85] mr-2">OI-WAP</span>₹{result.oiwap?.toFixed(1)}</div>
                  <div className="text-xs font-mono"><span className="text-[#6b6b85] mr-2">Last Close</span>₹{result.lc?.toFixed(2)}</div>
                  <div className="text-xs font-mono"><span className="text-[#6b6b85] mr-2">Days to Expiry</span>{result.dte}d</div>
                </div>
              </div>
            )}
            {!isAdmin && (
              <div className="rounded-2xl p-6 mb-6 text-center relative overflow-hidden"
                style={{
                  background: result.optType === 'CE' ? 'linear-gradient(135deg, #0a1a0a, #0a0a0f)' : 'linear-gradient(135deg, #1a0a0a, #0a0a0f)',
                  border: result.optType === 'CE' ? '1px solid rgba(57,217,138,0.3)' : '1px solid rgba(255,77,109,0.3)'
                }}>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                  <div className="text-[180px] font-black opacity-[0.03]"
                    style={{ color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d' }}>⚛</div>
                </div>
                <div className="relative z-10">
                  <div className="text-xs font-mono tracking-widest mb-2"
                    style={{ color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d' }}>⚛ GOD PARTICLE ANALYSIS</div>
                  <div className="text-2xl font-black mb-1"
                    style={{ color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d' }}>
                    {result.stockName} {result.strike} {result.optType}
                  </div>
                  <div className="text-sm font-mono text-[#6b6b85] mb-4">Expiry: {result.expiry} · {result.dte}d left</div>
                  <div className="inline-block px-8 py-4 rounded-xl"
                    style={{
                      background: result.optType === 'CE' ? 'rgba(57,217,138,0.1)' : 'rgba(255,77,109,0.1)',
                      border: result.optType === 'CE' ? '1px solid rgba(57,217,138,0.3)' : '1px solid rgba(255,77,109,0.3)'
                    }}>
                    <div className="text-xs font-mono text-[#6b6b85] mb-1 uppercase tracking-widest">⚛ God Particle</div>
                    <div className="text-4xl font-black" style={{ color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d' }}>
                      ₹{result.pcb?.toFixed(1)}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="flex gap-1 bg-[#111118] rounded-xl p-1 mb-6 overflow-x-auto">
              {(isAdmin ? adminTabs : customerTabs).map((t, i) => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${activeTab === t ? 'bg-[#16161f] text-[#e8e8f0] border border-[#1e1e2e]' : 'text-[#6b6b85]'}`}>
                  {isAdmin ? adminTabLabels[i] : customerTabLabels[i]}
                </button>
              ))}
            </div>
            {activeTab === 'raw' && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead><tr className="border-b border-[#1e1e2e]">
                    {['Date','Close','Volume','OI','Chng OI'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[#6b6b85] uppercase tracking-widest font-normal">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {result.data?.map((d: any, i: number) => (
                      <tr key={i} className="border-b border-[#1e1e2e]/50">
                        <td className="px-4 py-3">{d.date}</td>
                        <td className="px-4 py-3 font-bold">₹{d.close?.toFixed(2)}</td>
                        <td className="px-4 py-3">{d.volume?.toLocaleString()}</td>
                        <td className="px-4 py-3">{d.oi?.toLocaleString()}</td>
                        <td className={`px-4 py-3 ${d.chng_oi >= 0 ? 'text-[#39d98a]' : 'text-[#ff4d6d]'}`}>
                          {d.chng_oi >= 0 ? '+' : ''}{Math.round(d.chng_oi)?.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {activeTab === 'story' && (
              <div className="rounded-xl p-6"
                style={{
                  background: isAdmin ? '#111118' : result.optType === 'CE' ? 'linear-gradient(135deg, #0a1a0a, #0a0a0f)' : 'linear-gradient(135deg, #1a0a0a, #0a0a0f)',
                  border: isAdmin ? '1px solid #1e1e2e' : result.optType === 'CE' ? '1px solid rgba(57,217,138,0.2)' : '1px solid rgba(255,77,109,0.2)'
                }}>
                {isAdmin ? (
                  <div className="space-y-3 font-mono text-xs">
                    {result.story?.split('\n\n').map((para: string, i: number) => (
                      <div key={i} className="text-[#e8e8f0] leading-relaxed">{para}</div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3 font-mono text-xs">
                    <div className="text-center mb-4">
                      <span className="text-xs tracking-widest font-bold"
                        style={{ color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d' }}>⚛ MARKET ANALYSIS</span>
                    </div>
                    {result.insights?.slice(0,3).map((ins: string, i: number) => (
                      <div key={i} className="text-[#e8e8f0] leading-relaxed border-l-2 pl-3 py-1"
                        style={{ borderColor: result.optType === 'CE' ? 'rgba(57,217,138,0.4)' : 'rgba(255,77,109,0.4)' }}>
                        {ins}
                      </div>
                    ))}
                    <div className="mt-4 text-center text-[10px] font-mono text-[#6b6b85]">Not Financial Advice · God Particle ⚛</div>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'matrix' && (
              <div className="relative rounded-2xl overflow-hidden p-8"
                style={{
                  background: result.optType === 'CE' ? 'linear-gradient(135deg, #0a0a0f 0%, #0a1a0a 50%, #0a0a0f 100%)' : 'linear-gradient(135deg, #0a0a0f 0%, #1a0a0a 50%, #0a0a0f 100%)',
                  border: result.optType === 'CE' ? '1px solid rgba(57,217,138,0.3)' : '1px solid rgba(255,77,109,0.3)'
                }}>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                  <div className="text-[220px] font-black opacity-[0.025]"
                    style={{ color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d' }}>⚛</div>
                </div>
                <div className="relative z-10 text-center mb-8">
                  <div className="text-xs font-mono tracking-[3px] mb-3"
                    style={{ color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d' }}>⚛ GOD PARTICLE ANALYSIS</div>
                  <div className="text-3xl font-black mb-2">
                    STRIKE: <span style={{ color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d' }}>{result.strike} {result.optType}</span>
                  </div>
                  <div className="text-sm font-mono text-[#6b6b85]">{result.stockName} · EXPIRY: {result.expiry?.toUpperCase()}</div>
                </div>
                <div className="relative z-10 overflow-x-auto mb-8">
                  <table className="w-full font-mono text-sm">
                    <thead>
                      <tr style={{ borderBottom: result.optType === 'CE' ? '1px solid rgba(57,217,138,0.3)' : '1px solid rgba(255,77,109,0.3)' }}>
                        {['SCENARIO','BUY ZONE','TARGET','STOP LOSS'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs tracking-widest font-bold"
                            style={{ color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.matrix?.map((row: any, i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td className="px-4 py-3 font-bold text-[#e8e8f0] text-xs">{row.gap}</td>
                          {row.avoid ? (
                            <td colSpan={3} className="px-4 py-3 font-black text-xs"
                              style={{ color: result.optType === 'CE' ? '#ff4d6d' : '#39d98a' }}>AVOID</td>
                          ) : (
                            <>
                              <td className="px-4 py-3 font-bold text-xs"
                                style={{ color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d' }}>
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
                  <div className="text-xs font-mono text-[#6b6b85]">⭐ Best Setup · Wait 15 min after open · Not Financial Advice</div>
                  <div className="text-xs font-black tracking-widest"
                    style={{ color: result.optType === 'CE' ? '#39d98a' : '#ff4d6d' }}>DEVELOPED BY GOD PARTICLE ⚛</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
