import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { computeGodParticle, saveAnalysis } from '../lib/market';

export default function StockAnalysis() {
  const { user, profile, refreshProfile } = useAuth();
  const role = profile?.role ?? 'free';
  const isAdmin = role === 'admin';

  const [analysisType, setAnalysisType] = useState<'gct' | 'options'>('gct');
  const [stockName, setStockName] = useState('');
  const [exchange, setExchange] = useState<'NSE' | 'BSE'>('NSE');
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
  const [gctTab, setGctTab] = useState('overview');
  const [holdingQty, setHoldingQty] = useState('');

  const sectorPE: Record<string, number> = {
    'Energy/Oil': 18, 'Banking': 20, 'IT': 28,
    'Defence/PSU': 30, 'FMCG': 50, 'Pharma': 35,
    'Auto': 25, 'Conglomerate': 22, 'Default': 25
  };

  const canAccess = ['premium', 'pro', 'admin'].includes(role);
  const canAutoFetch = ['pro', 'admin'].includes(role);

  const location = useLocation();
  useEffect(() => {
    const replay = (location.state as any)?.replay;
    if (!replay?.result) return;
    const r = replay.result;
    if (r.type === 'gct') {
      setStockName(r.stockName || replay.index_name || '');
      setResult(r);
      setStep('result');
    } else {
      setStockName(r.stockName || replay.index_name || '');
      setOptStrike(String(replay.strike || ''));
      setOptType(replay.option_type || 'CE');
      setOptExpiry(replay.expiry || '');
      setAnalysisType('options');
      setResult({ type: 'options', ...r, stockName: r.stockName || replay.index_name });
      setActiveTab('raw');
      setStep('result');
    }
  }, []);

  // ── AUTO FETCH STOCK PRICE — uses smooth-endpoint (Yahoo Finance) ──
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
      // Fetch all stored records (could be daily or monthly candles)
      const { data: existing } = await supabase
        .from('stock_price_data')
        .select('*')
        .eq('stock_name', stockName.toUpperCase())
        .order('trade_date', { ascending: false })
        .limit(500);

      // Count unique YYYY-MM months — records may be daily, so count months not rows
      const uniqueMonths = new Set(
        (existing || []).map((r: any) => (r.trade_date || '').substring(0, 7))
      ).size;

      if (uniqueMonths >= 6) {
        setFetchMsg(`✅ Found ${uniqueMonths} months in database!`);
        processMonthlyData(existing!);
        return;
      }

      setFetchMsg(`⏳ Fetching 14 months from ${exchange} via server...`);

      // Use smooth-endpoint directly (routes stock_price to Yahoo Finance)
      const { data, error: fnError } = await supabase.functions.invoke('smooth-endpoint', {
        body: { type: 'stock_price', symbol: stockName.toUpperCase(), exchange }
      });

      if (fnError) throw new Error(fnError.message.includes('non-2xx')
        ? `Edge function error — if using BSE, run: supabase functions deploy smooth-endpoint`
        : fnError.message);
      if (!data?.success) throw new Error(data?.error || 'Fetch failed');

      const records: any[] = data.data?.data || [];
      if (!records.length) throw new Error(
        `No data for "${stockName}" on ${exchange}. ` +
        `Check the exact symbol (e.g. SBIN not SBI, BAJFINANCE not BAJAJ-FINANCE).`
      );

      const toSave = records
        .map((r: any) => ({
          stock_name: stockName.toUpperCase(),
          trade_date: r.CH_TIMESTAMP,
          open:   parseFloat(r.CH_OPENING_PRICE  || 0),
          high:   parseFloat(r.CH_TRADE_HIGH_PRICE || 0),
          low:    parseFloat(r.CH_TRADE_LOW_PRICE  || 0),
          close:  parseFloat(r.CH_CLOSING_PRICE    || 0),
          volume: parseFloat(r.CH_TOT_TRADED_QTY   || 0),
        }))
        .filter(r => r.close > 0);

      if (!toSave.length) throw new Error('No valid price records in response.');

      // Save to data bank immediately
      const { error: saveErr } = await supabase
        .from('stock_price_data')
        .upsert(toSave, { onConflict: 'stock_name,trade_date' });

      if (saveErr) console.warn('Data bank save warning:', saveErr.message);

      setFetchMsg(`✅ Saved ${toSave.length} months for ${stockName.toUpperCase()} (${exchange})!`);
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

      // Use smooth-endpoint directly (routes stock_chain to Upstox v2)
      const { data, error: fnError } = await supabase.functions.invoke('smooth-endpoint', {
        body: { type: 'stock_chain', symbol: stockName.toUpperCase() }
      });

      if (fnError) throw new Error(fnError.message);
      if (!data?.success) throw new Error(data?.error || 'Fetch failed');

      // smooth-endpoint returns { allExpiries: [{ expiry, strikes, spotPrice }], tradeDate }
      const allExpiries: any[] = data.data?.allExpiries || [];
      if (!allExpiries.length) throw new Error(`No options data for ${stockName}`);

      // Find the requested expiry or fall back to first available
      const selectedChain = allExpiries.find((e: any) => e.expiry === optExpiry) || allExpiries[0];
      if (!selectedChain) throw new Error(`Expiry ${optExpiry} not found for ${stockName}`);

      // Upstox v2 strikes already in correct format; normalise field names for DB
      const rawStrikes: Record<string, any> = selectedChain.strikes || {};
      const strikes: Record<string, any> = {};
      Object.entries(rawStrikes).forEach(([k, v]: [string, any]) => {
        strikes[k] = {
          ce_ltp:    v.ce_ltp  || 0,
          ce_oi:     v.ce_oi   || 0,
          ce_chng_oi: v.ce_coi || 0,   // smooth-endpoint stores as ce_coi
          ce_vol:    v.ce_vol  || 0,
          pe_ltp:    v.pe_ltp  || 0,
          pe_oi:     v.pe_oi   || 0,
          pe_chng_oi: v.pe_coi || 0,   // smooth-endpoint stores as pe_coi
          pe_vol:    v.pe_vol  || 0,
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

      setOptFetchMsg(`✅ Fetched ${Object.keys(strikes).length} strikes for ${stockName}!`);

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
  // Works with both daily records and Yahoo monthly candles.
  // Aggregates all records for a month into one proper monthly candle.
  function processMonthlyData(rawData: any[]) {
    const monthly: Record<string, any> = {};
    rawData.forEach((row: any) => {
      const date = row.trade_date;
      if (!date) return;
      const key = date.substring(0, 7); // YYYY-MM
      const high   = parseFloat(row.high   || 0);
      const low    = parseFloat(row.low    || 0);
      const close  = parseFloat(row.close  || 0);
      const open   = parseFloat(row.open   || 0);
      const volume = parseFloat(row.volume || 0);
      if (close <= 0) return;
      if (!monthly[key]) {
        monthly[key] = { firstDate: date, lastDate: date, open, high, low, close, volume };
      } else {
        // Proper monthly aggregation across daily records
        if (date < monthly[key].firstDate) { monthly[key].firstDate = date; monthly[key].open = open; }
        if (date > monthly[key].lastDate)  { monthly[key].lastDate  = date; monthly[key].close = close; }
        if (high > monthly[key].high) monthly[key].high = high;
        if (low  > 0 && low < monthly[key].low) monthly[key].low = low;
        monthly[key].volume += volume;
      }
    });
    // Sort oldest → newest, use last 14 months
    const monthlyData = Object.entries(monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]: [string, any]) => ({ date: v.lastDate || key + '-01', ...v }))
      .filter((r: any) => r.high > 0 && r.close > 0)
      .slice(-14);
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

  // ── RUN GCT v3.0 ──
  function runGCT() {
    if (csvData.length < 6) { setError('Need at least 6 months of data!'); return; }
    setLoading(true);
    setError('');
    try {
      const data = [...csvData].sort((a, b) => a.date.localeCompare(b.date));

      // ── Step 1: Per-month calculations ──
      // Yahoo Finance monthly bars often return 0 volume for Indian stocks — fall back to equal weights
      const rawVol = data.reduce((s, d) => s + d.volume, 0);
      const workingData = rawVol === 0
        ? data.map(d => ({ ...d, volume: 1 }))
        : data;
      const totalVol = workingData.reduce((s, d) => s + d.volume, 0);
      const tp    = workingData.map(d => (d.high + d.low + d.close) / 3);
      const range = workingData.map(d => d.high - d.low);
      const vmsArr = workingData.map(d => {
        const r = d.high - d.low;
        return r === 0 ? 0.5 : Math.max(0, Math.min(1, (d.close - d.low) / r));
      });

      // ── Step 2: MGC — Monthly Gravitational Core ──
      const mgc = workingData.reduce((s, d, i) => s + tp[i] * d.volume, 0) / totalVol;

      // ── Step 3: VWAR — Volume Weighted Average Range ──
      // Capped 1%–7% of MGC so crash levels never go negative and upside stays realistic
      let vwar = workingData.reduce((s, d, i) => s + range[i] * d.volume, 0) / totalVol;
      vwar = Math.min(Math.max(vwar, mgc * 0.01), mgc * 0.07);

      // ── Step 4: MCL — Monthly Commitment Line ──
      const mcl = workingData.reduce((s, d) => s + d.close * d.volume, 0) / totalVol;

      // ── Step 5: Core levels ──
      const al = mgc + vwar;
      const cl = mgc - vwar;

      // ── Step 6: VMS — Volumetric Momentum Skew ──
      const avgVms = vmsArr.reduce((s, v) => s + v, 0) / vmsArr.length;
      const vmsLabel = avgVms > 0.6 ? 'Buyers are strong' : avgVms >= 0.4 ? 'Market is balanced' : 'Sellers are dominant';

      // ── Step 7: Crash levels L1–L5 ──
      const crashLevels = [1,2,3,4,5].map(n => ({
        n, price: Math.round(mgc - vwar * n),
        mood:  ['Fear starts','Everyone scared','Panic — blood on streets','Major crash','Black swan event'][n-1],
        alloc: [20, 30, 30, 15, 5][n-1],
        emoji: ['🟡','🟠','🔴','💀','☠️'][n-1],
      }));

      // ── Step 8: Upside levels U1–U5 ──
      const upsideLevels = [1,2,3,4,5].map(n => ({
        n, price: Math.round(mgc + vwar * n),
        signal: ['BUY — Fresh entry, full size','ADD SMALL — momentum confirmed','HOLD only — no fresh buying','HOLD — stay alert, overheated','EXIT 100% — no exceptions'][n-1],
        action: ['Monthly close above + hold 3+ days to confirm','Hold existing. Small fresh buy allowed.','Hold only. Do not buy more.','Hold. Very alert. Overheated zone.','Exit everything immediately. Target reached.'][n-1],
        trailSLLabel: ['MGC','U1 / AL','U1 / AL','U2','EXIT'][n-1],
        trailSLPrice: [Math.round(mgc), Math.round(mgc+vwar), Math.round(mgc+vwar), Math.round(mgc+vwar*2), 0][n-1],
        emoji: ['🟢','🔵','🟡','🟠','🔴'][n-1],
      }));

      // ── Current price & zone ──
      const currentPrice = data[data.length - 1].close;
      let zone: string, zoneDesc: string, zoneCol: string;
      if (currentPrice >= al) {
        zone = 'BUY ZONE'; zoneDesc = 'Safe to buy. Markup phase.'; zoneCol = '#39d98a';
      } else if (currentPrice >= mgc) {
        zone = 'WATCH ZONE'; zoneDesc = 'Above soul. Wait for AL breakout.'; zoneCol = '#f0c040';
      } else if (currentPrice >= cl) {
        zone = 'DANGER ZONE'; zoneDesc = 'Below soul. Risky. Avoid fresh buying.'; zoneCol = '#ff8c42';
      } else {
        zone = 'CRASH ZONE'; zoneDesc = 'Crash territory. Accumulate in parts only.'; zoneCol = '#ff4d6d';
      }

      // ── FSS Checks ──
      const peVal    = parseFloat(pe);
      const epsVal   = parseFloat(eps);
      const bvVal    = parseFloat(bookValue);
      const roceVal  = parseFloat(roce);
      const benchPE  = sectorPE[sector] || 25;
      const fssChecks: any[] = [];

      if (epsVal > 0 && crashLevels[0].price > 0) {
        const peAtL1 = crashLevels[0].price / epsVal;
        fssChecks.push({
          name: 'PE at L1',
          passCondition: `< ${benchPE} (${sector} benchmark)`,
          pass: peAtL1 < benchPE,
          value: peAtL1.toFixed(1),
          badge: peAtL1 < benchPE * 0.5 ? 'Deep Value' : null,
        });
      } else if (epsVal <= 0 && pe) {
        fssChecks.push({ name: 'PE Ratio', passCondition: 'EPS > 0', pass: false, value: 'Not profitable', badge: null });
      }

      if (bvVal > 0) {
        const pb = currentPrice / bvVal;
        fssChecks.push({
          name: 'P/B Ratio',
          passCondition: '< 2.5',
          pass: pb < 2.5,
          value: pb.toFixed(2),
          badge: pb < 1.0 ? 'Below Book Value' : null,
        });
      } else if (bvVal < 0) {
        fssChecks.push({ name: 'P/B Ratio', passCondition: '< 2.5', pass: false, value: 'Negative book value', badge: null });
      }

      if (rev2 && rev3) {
        const r2 = parseFloat(rev2), r3 = parseFloat(rev3);
        const g = ((r3 - r2) / r2 * 100).toFixed(1);
        fssChecks.push({
          name: 'Revenue Growth (Y2→Y3)',
          passCondition: 'Y3 > Y2',
          pass: r3 > r2,
          value: r3 > r2 ? `+${g}%` : `${g}% (declining)`,
          badge: null,
        });
      }

      if (profit2 && profit3) {
        const p2 = parseFloat(profit2), p3 = parseFloat(profit3);
        const g = ((p3 - p2) / p2 * 100).toFixed(1);
        fssChecks.push({
          name: 'Profit Growth (Y2→Y3)',
          passCondition: 'Y3 > Y2',
          pass: p3 > p2,
          value: p3 > p2 ? `+${g}%` : `${g}% (declining)`,
          badge: null,
        });
      }

      if (roceVal) {
        fssChecks.push({
          name: 'ROCE',
          passCondition: '≥ 8%',
          pass: roceVal >= 8,
          value: `${roceVal}%`,
          badge: roceVal >= 25 ? 'Excellent Returns' : null,
        });
      }

      const fssScore = fssChecks.filter(c => c.pass).length;
      const fssTotal = fssChecks.length;
      const hasFundamentals = fssTotal > 0;
      const fssVerdict = !hasFundamentals ? null :
        fssScore === 5 ? '🟢 STRONG BUY — fundamentally excellent' :
        fssScore === 4 ? '✅ GOOD BUY — strong, minor concern' :
        fssScore === 3 ? '⚡ DECENT BUY — acceptable risk' :
        fssScore === 2 ? '⚠️ CAREFUL — mixed signals, small buys only' :
        fssScore === 1 ? '🔴 RISKY — avoid unless high conviction' :
                         '💀 VALUE TRAP — price low but company is sick';

      // ── Personalised Buy Plan ──
      let buyPlanTitle = '';
      let buyPlanLines: string[] = [];
      const l5price = crashLevels[4].price;
      const p2n = parseFloat(profit2), p3n = parseFloat(profit3);
      const profGrowthStr = (profit2 && profit3 && p3n > p2n)
        ? ` Profits up ${((p3n-p2n)/p2n*100).toFixed(0)}%.` : '';

      if (zone === 'BUY ZONE') {
        buyPlanTitle = 'BREAKOUT CONFIRMED — BUY NOW';
        buyPlanLines = [
          `Price is above AL ₹${Math.round(al).toLocaleString()} — markup phase confirmed.`,
          `Entry: Buy now at market. Keep SL = MGC ₹${Math.round(mgc).toLocaleString()}.`,
          `First target: U2 ₹${upsideLevels[1].price.toLocaleString()}.`,
          `Final target: U5 ₹${upsideLevels[4].price.toLocaleString()} — exit 100% there.`,
          `Trail SL up as price rises: at U2 move SL to U1, at U3 keep SL at U1, at U4 move SL to U2.`,
        ];
      } else if (zone === 'WATCH ZONE') {
        buyPlanTitle = 'WAIT FOR BREAKOUT ABOVE AL';
        buyPlanLines = [
          `Price is between MGC and AL. Above soul but below ascension line.`,
          `Wait for monthly close above AL ₹${Math.round(al).toLocaleString()}.`,
          `Then confirm price holds above AL for 3+ consecutive trading days.`,
          `Only then buy. Target: U2 ₹${upsideLevels[1].price.toLocaleString()} then U5 ₹${upsideLevels[4].price.toLocaleString()}.`,
          `If price drops below MGC ₹${Math.round(mgc).toLocaleString()} instead — move to crash plan below.`,
        ];
      } else if (zone === 'DANGER ZONE') {
        buyPlanTitle = 'DANGER — WAIT OR BUY SMALL AT CL';
        buyPlanLines = [
          `Price is below soul price MGC ₹${Math.round(mgc).toLocaleString()} — institutions in pain.`,
          `Do not average up. Wait to see if price holds CL ₹${Math.round(cl).toLocaleString()} as support.`,
          `Small buy only if price bounces strongly from CL with volume surge.`,
          `First recovery target: MGC ₹${Math.round(mgc).toLocaleString()}, then AL ₹${Math.round(al).toLocaleString()}.`,
          `Overall SL: monthly close below L5 ₹${l5price.toLocaleString()} — exit everything.`,
        ];
      } else {
        // CRASH ZONE
        const activeLevels = crashLevels.filter(l => currentPrice <= l.price + vwar * 0.5);
        buyPlanTitle = 'CRASH ZONE — ACCUMULATE IN PARTS';
        buyPlanLines = [
          `Price is in crash territory. Do NOT invest all money at once.`,
          ...activeLevels.slice(0, 4).map(l =>
            `At L${l.n} ₹${l.price.toLocaleString()}: invest ${l.alloc}% of budget. Mood: ${l.mood}.`
          ),
          `First recovery target: MGC ₹${Math.round(mgc).toLocaleString()}.`,
          `Bull run only above AL ₹${Math.round(al).toLocaleString()}.`,
          `Overall SL: monthly close below L5 ₹${l5price.toLocaleString()} — exit everything immediately.`,
        ];
      }

      // ── One-Line Verdict ──
      const fssStr = !hasFundamentals ? '' :
        fssScore >= 4 ? ' — business is fundamentally strong' :
        fssScore >= 3 ? ' — fundamentals are decent' :
        fssScore >= 2 ? ' — mixed fundamentals' :
        ' — weak fundamentals, trade carefully';
      let verdict = '';
      if (zone === 'BUY ZONE') {
        verdict = `${stockName} is in markup phase at ₹${Math.round(currentPrice).toLocaleString()}${fssStr}${profGrowthStr} Breakout confirmed above AL ₹${Math.round(al).toLocaleString()}. Trail SL to MGC ₹${Math.round(mgc).toLocaleString()}. Final exit at U5 ₹${upsideLevels[4].price.toLocaleString()}.`;
      } else if (zone === 'WATCH ZONE') {
        verdict = `${stockName} is above soul price at ₹${Math.round(currentPrice).toLocaleString()}${fssStr}. Wait for confirmed breakout above AL ₹${Math.round(al).toLocaleString()}. Real bull run only above that level.`;
      } else if (zone === 'DANGER ZONE') {
        verdict = `${stockName} is below soul price at ₹${Math.round(currentPrice).toLocaleString()}${fssStr}. Risky zone — wait for MGC ₹${Math.round(mgc).toLocaleString()} to hold as support before buying.`;
      } else {
        verdict = `${stockName} is in panic zone at ₹${Math.round(currentPrice).toLocaleString()}${fssStr}${profGrowthStr} Accumulate in parts between ₹${Math.round(currentPrice).toLocaleString()} and ₹${l5price.toLocaleString()}. Real bull run only above ₹${Math.round(al).toLocaleString()}.`;
      }

      const stockGctResult = {
        type: 'gct', stockName, exchange,
        currentPrice: Math.round(currentPrice),
        mgc: Math.round(mgc), vwar: Math.round(vwar),
        mcl: Math.round(mcl), al: Math.round(al), cl: Math.round(cl),
        avgVms: parseFloat(avgVms.toFixed(2)), vmsLabel,
        zone, zoneDesc, zoneCol,
        crashLevels, upsideLevels,
        fssChecks, fssScore, fssTotal, fssVerdict, hasFundamentals,
        buyPlanTitle, buyPlanLines,
        verdict,
        dataMonths: data.length,
        firstDate: data[0].date, lastDate: data[data.length - 1].date,
      };

      if (user) saveAnalysis(user.id, stockName.toUpperCase(), 0, 'STOCK_GCT', new Date().toISOString().split('T')[0], stockGctResult).catch(() => {});
      setResult(stockGctResult);
      setGctTab('overview');
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
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Exchange & Symbol</label>
                  <div className="flex gap-2">
                    <div className="flex rounded-lg overflow-hidden border border-[#1e1e2e] shrink-0">
                      {(['NSE', 'BSE'] as const).map(ex => (
                        <button key={ex} onClick={() => setExchange(ex)}
                          className={`px-3 py-2.5 text-xs font-black transition-all ${exchange === ex ? 'bg-[#f0c040] text-black' : 'bg-[#16161f] text-[#6b6b85] hover:text-[#e8e8f0]'}`}>
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
                <h2 className="text-sm font-black uppercase tracking-widest text-[#6b6b85] mb-1">Step 4 — Fundamental Data (Optional but Powerful)</h2>
                <div className="bg-[#f0c040]/8 border border-[#f0c040]/25 rounded-xl p-3 mb-4 text-xs font-mono text-[#f0c040]">
                  💡 Analysis runs without fundamentals — but adding them unlocks the FSS score and gives you a full buy/avoid verdict. Get data from screener.in for best results.
                </div>
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

        {/* ── GCT v3.0 RESULTS ── */}
        {canAccess && step === 'result' && result?.type === 'gct' && (() => {
          const zc = result.zoneCol || '#f0c040';
          const tabs = [
            { id: 'overview', label: '📊 Overview' },
            { id: 'crash',    label: '💥 Crash Buy' },
            { id: 'upside',   label: '🚀 Upside' },
            { id: 'fss',      label: '🔬 FSS' },
            { id: 'plan',     label: '🎯 My Plan' },
          ];
          return (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black">
                    <span style={{ color: zc }}>{result.stockName}</span>
                    <span className="text-[#6b6b85] text-sm font-mono ml-2">({result.exchange})</span>
                  </h2>
                  <div className="text-xs font-mono text-[#6b6b85]">{result.dataMonths} months · {result.firstDate} → {result.lastDate}</div>
                </div>
                <button onClick={() => { setStep('input'); setResult(null); setCsvData([]); }}
                  className="px-4 py-2 text-xs font-bold border border-[#1e1e2e] rounded-lg hover:border-[#f0c040] transition-all">← New</button>
              </div>

              {/* Zone card */}
              <div className="rounded-2xl p-5 text-center"
                style={{ background: `linear-gradient(135deg,#0a0a0f,${zc}18)`, border: `1px solid ${zc}50` }}>
                <div className="text-xs font-mono tracking-widest mb-1" style={{ color: zc }}>⚛ GCT v3.0 — GRAVITATIONAL COST THEORY</div>
                <div className="text-4xl font-black mb-1">₹{result.currentPrice.toLocaleString()}</div>
                <div className="inline-block px-5 py-1.5 rounded-full font-black text-sm mb-2"
                  style={{ background: `${zc}25`, color: zc, border: `1px solid ${zc}50` }}>{result.zone}</div>
                <div className="text-sm font-mono" style={{ color: zc }}>{result.zoneDesc}</div>
                <div className="flex justify-center gap-6 mt-3 text-xs font-mono text-[#6b6b85]">
                  <span>MGC ₹{result.mgc.toLocaleString()}</span>
                  <span>VWAR ₹{result.vwar.toLocaleString()}</span>
                  <span>VMS {result.avgVms} — {result.vmsLabel}</span>
                </div>
              </div>

              {/* Tab bar */}
              <div className="flex gap-1 bg-[#111118] rounded-xl p-1 overflow-x-auto">
                {tabs.map(t => (
                  <button key={t.id} onClick={() => setGctTab(t.id)}
                    className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${gctTab === t.id ? 'bg-[#16161f] text-[#e8e8f0] border border-[#1e1e2e]' : 'text-[#6b6b85]'}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* ── OVERVIEW TAB ── */}
              {gctTab === 'overview' && (
                <div className="space-y-4">
                  {/* 4 core levels */}
                  <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5">
                    <div className="text-sm font-black mb-4 text-[#f0c040]">📐 4 Core Technical Levels</div>
                    {[
                      { label: 'AL — Ascension Line', price: result.al,  desc: 'BUY zone starts here. Price above = markup phase.', color: '#39d98a' },
                      { label: 'MGC — Soul of Stock',  price: result.mgc, desc: 'Gravitational centre. Institutions anchored here.', color: '#4d9fff' },
                      { label: 'MCL — Commitment Line',price: result.mcl, desc: 'Where long-term committed buyers averaged cost.', color: '#a78bfa' },
                      { label: 'CL — Collapse Line',   price: result.cl,  desc: 'Danger zone starts here. Below = institutions in pain.', color: '#ff4d6d' },
                    ].map((lv, i) => {
                      const above = [Infinity, result.al, result.mgc, result.mcl];
                      const here  = result.currentPrice < above[i] && result.currentPrice >= lv.price;
                      return (
                        <div key={i} className="flex items-center justify-between p-3 rounded-xl mb-2"
                          style={{ background: `${lv.color}0d`, border: `1px solid ${lv.color}30` }}>
                          <div>
                            <div className="text-xs font-bold" style={{ color: lv.color }}>{lv.label}</div>
                            <div className="text-[11px] font-mono text-[#6b6b85]">{lv.desc}</div>
                          </div>
                          <div className="text-right shrink-0 ml-4">
                            <div className="text-lg font-black" style={{ color: lv.color }}>₹{lv.price.toLocaleString()}</div>
                            {here && <div className="text-[10px] font-black text-[#f0c040]">← YOU ARE HERE</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* VMS momentum */}
                  <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5">
                    <div className="text-sm font-black mb-3 text-[#f0c040]">📈 Volumetric Momentum Skew</div>
                    <div className="flex items-center gap-4">
                      <div className="text-3xl font-black" style={{ color: result.avgVms > 0.6 ? '#39d98a' : result.avgVms >= 0.4 ? '#f0c040' : '#ff4d6d' }}>
                        {result.avgVms}
                      </div>
                      <div>
                        <div className="text-sm font-bold" style={{ color: result.avgVms > 0.6 ? '#39d98a' : result.avgVms >= 0.4 ? '#f0c040' : '#ff4d6d' }}>
                          {result.vmsLabel}
                        </div>
                        <div className="text-xs font-mono text-[#6b6b85]">0 = sellers dominated · 1 = buyers dominated</div>
                      </div>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-[#1e1e2e] overflow-hidden">
                      <div className="h-2 rounded-full transition-all"
                        style={{ width: `${result.avgVms * 100}%`, background: result.avgVms > 0.6 ? '#39d98a' : result.avgVms >= 0.4 ? '#f0c040' : '#ff4d6d' }} />
                    </div>
                  </div>
                </div>
              )}

              {/* ── CRASH BUY TAB ── */}
              {gctTab === 'crash' && (
                <div className="space-y-4">
                  <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5">
                    <div className="text-sm font-black mb-1 text-[#ff4d6d]">💥 Crash Buying Map — L1 to L5</div>
                    <div className="text-xs font-mono text-[#6b6b85] mb-4">Never invest all money at once. Spread across levels.</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs font-mono">
                        <thead>
                          <tr className="border-b border-[#1e1e2e]">
                            {['Level','Price','Market Mood','Invest'].map(h => (
                              <th key={h} className="text-left px-3 py-2 text-[#6b6b85] uppercase tracking-widest font-normal">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.crashLevels.map((lv: any, i: number) => {
                            const here = result.currentPrice <= lv.price + result.vwar * 0.5 &&
                              (i === 0 || result.currentPrice > result.crashLevels[i-1].price - result.vwar * 0.5);
                            return (
                              <tr key={i} className={`border-b border-[#1e1e2e]/50 ${here ? 'bg-[#f0c040]/10' : ''}`}>
                                <td className="px-3 py-3 font-bold">{lv.emoji} L{lv.n}</td>
                                <td className="px-3 py-3 font-black text-[#f0c040]">
                                  ₹{lv.price.toLocaleString()}
                                  {here && <span className="ml-1 text-[9px] bg-[#f0c040] text-black px-1 rounded">HERE</span>}
                                </td>
                                <td className="px-3 py-3 text-[#6b6b85]">{lv.mood}</td>
                                <td className="px-3 py-3 font-bold text-[#39d98a]">{lv.alloc}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4 p-3 rounded-xl bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 text-xs font-mono text-[#ff4d6d]">
                      ⛔ Overall Stop Loss: If monthly CLOSE goes below L5 ₹{result.crashLevels[4].price.toLocaleString()} → exit everything immediately. No exceptions.
                    </div>
                  </div>
                </div>
              )}

              {/* ── UPSIDE TAB ── */}
              {gctTab === 'upside' && (
                <div className="space-y-4">
                  {/* Upside map */}
                  <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5">
                    <div className="text-sm font-black mb-1 text-[#39d98a]">🚀 Upside Breakout Map — U1 to U5</div>
                    <div className="text-xs font-mono text-[#6b6b85] mb-4">
                      Buy signal needs TWO confirmations: monthly close above level AND price holds 3+ days.
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs font-mono">
                        <thead>
                          <tr className="border-b border-[#1e1e2e]">
                            {['Level','Price','Signal','Trail SL'].map(h => (
                              <th key={h} className="text-left px-3 py-2 text-[#6b6b85] uppercase tracking-widest font-normal">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.upsideLevels.map((lv: any) => {
                            const here = result.currentPrice >= lv.price - result.vwar * 0.5 &&
                              result.currentPrice < lv.price + result.vwar * 0.5;
                            const color = ['#39d98a','#4d9fff','#f0c040','#ff8c42','#ff4d6d'][lv.n - 1];
                            return (
                              <tr key={lv.n} className={`border-b border-[#1e1e2e]/50 ${here ? 'bg-[#39d98a]/10' : ''}`}>
                                <td className="px-3 py-3 font-bold">{lv.emoji} U{lv.n}</td>
                                <td className="px-3 py-3 font-black" style={{ color }}>
                                  ₹{lv.price.toLocaleString()}
                                  {here && <span className="ml-1 text-[9px] bg-[#39d98a] text-black px-1 rounded">HERE</span>}
                                </td>
                                <td className="px-3 py-3" style={{ color }}>{lv.signal}</td>
                                <td className="px-3 py-3 text-[#6b6b85]">
                                  {lv.n === 5 ? '🚨 EXIT ALL' : `₹${lv.trailSLPrice.toLocaleString()} (${lv.trailSLLabel})`}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Hold & Exit rules */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="bg-[#39d98a]/10 border border-[#39d98a]/30 rounded-xl p-4">
                      <div className="text-xs font-black text-[#39d98a] mb-2">✅ HOLD WHEN</div>
                      <ul className="space-y-1 text-xs font-mono text-[#e8e8f0]">
                        <li>· Price between AL and U5</li>
                        <li>· Monthly close above entry level</li>
                        <li>· Pullback to AL after breakout</li>
                        <li>· Trend still intact on monthly chart</li>
                      </ul>
                    </div>
                    <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-xl p-4">
                      <div className="text-xs font-black text-[#ff4d6d] mb-2">🛑 EXIT — STOP LOSS</div>
                      <ul className="space-y-1 text-xs font-mono text-[#e8e8f0]">
                        <li>· 2 consecutive monthly closes below MGC</li>
                        <li>· Monthly close below AL after breakout</li>
                        <li>· Monthly close below L5 (crash SL)</li>
                        <li>· Trailing SL hit (see table above)</li>
                      </ul>
                    </div>
                    <div className="bg-[#f0c040]/10 border border-[#f0c040]/30 rounded-xl p-4">
                      <div className="text-xs font-black text-[#f0c040] mb-2">🎯 EXIT — TARGET</div>
                      <ul className="space-y-1 text-xs font-mono text-[#e8e8f0]">
                        <li>· Price reaches U5 → exit 100%</li>
                        <li>· ₹{result.upsideLevels[4].price.toLocaleString()} — no exceptions</li>
                        <li>· Blow-off top = sell everything</li>
                        <li>· Do not be greedy at U5</li>
                      </ul>
                    </div>
                  </div>

                  {/* Trailing SL ladder */}
                  <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5">
                    <div className="text-sm font-black mb-1 text-[#f0c040]">🪜 Trailing Stop Loss Ladder</div>
                    <div className="text-xs font-mono text-[#6b6b85] mb-4">As price rises, move SL up to lock in profit. SL always stays ~2 VWAR bands below current level.</div>
                    <div className="space-y-2">
                      {[
                        { when: `Price reaches U1 — ₹${result.upsideLevels[0].price.toLocaleString()}`, moveSL: `MGC — ₹${result.mgc.toLocaleString()}` },
                        { when: `Price reaches U2 — ₹${result.upsideLevels[1].price.toLocaleString()}`, moveSL: `U1 / AL — ₹${result.upsideLevels[0].price.toLocaleString()}` },
                        { when: `Price reaches U3 — ₹${result.upsideLevels[2].price.toLocaleString()}`, moveSL: `U1 / AL — ₹${result.upsideLevels[0].price.toLocaleString()} (keep wide)` },
                        { when: `Price reaches U4 — ₹${result.upsideLevels[3].price.toLocaleString()}`, moveSL: `U2 — ₹${result.upsideLevels[1].price.toLocaleString()}` },
                        { when: `Price reaches U5 — ₹${result.upsideLevels[4].price.toLocaleString()}`, moveSL: '🚨 EXIT 100% immediately' },
                      ].map((row, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-[#16161f] text-xs font-mono">
                          <span className="text-[#6b6b85]">{row.when}</span>
                          <span className="font-bold text-[#f0c040]">→ Move SL to {row.moveSL}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── FSS TAB ── */}
              {gctTab === 'fss' && (
                <div className="space-y-4">
                  {!result.hasFundamentals ? (
                    <div className="bg-[#f0c040]/10 border border-[#f0c040]/30 rounded-2xl p-6 text-center">
                      <div className="text-3xl mb-3">🔬</div>
                      <div className="text-sm font-black text-[#f0c040] mb-2">No Fundamental Data Added</div>
                      <div className="text-xs font-mono text-[#6b6b85] mb-4 leading-relaxed">
                        Go back and add PE, EPS, Book Value, ROCE, Revenue and Profit data<br/>
                        from screener.in to get a Fundamental Safety Score.<br/>
                        The GCT technical analysis above is still fully valid without it.
                      </div>
                      <button onClick={() => { setStep('input'); setResult(null); }}
                        className="px-5 py-2 bg-[#f0c040] text-black font-black text-xs rounded-lg">
                        ← Add Fundamentals
                      </button>
                    </div>
                  ) : (
                    <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5">
                      <div className="text-sm font-black mb-4 text-[#f0c040]">🔬 Fundamental Safety Score (FSS)</div>
                      <div className="space-y-2 mb-5">
                        {result.fssChecks.map((ck: any, i: number) => (
                          <div key={i} className={`flex items-center justify-between p-3 rounded-xl border ${ck.pass ? 'bg-[#39d98a]/08 border-[#39d98a]/25' : 'bg-[#ff4d6d]/08 border-[#ff4d6d]/25'}`}>
                            <div>
                              <div className="text-xs font-bold text-[#e8e8f0]">{ck.name}</div>
                              <div className="text-[11px] font-mono text-[#6b6b85]">Pass if {ck.passCondition}</div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 ml-4">
                              {ck.badge && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#f0c040]/20 text-[#f0c040]">{ck.badge}</span>
                              )}
                              <span className="text-sm font-black" style={{ color: ck.pass ? '#39d98a' : '#ff4d6d' }}>
                                {ck.value}
                              </span>
                              <span className="text-base">{ck.pass ? '✅' : '❌'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="text-center p-5 rounded-xl bg-[#16161f] border border-[#1e1e2e]">
                        <div className="text-xs font-mono text-[#6b6b85] mb-1 uppercase tracking-widest">FSS Score</div>
                        <div className="text-4xl font-black text-[#f0c040] mb-2">{result.fssScore} / {result.fssTotal}</div>
                        <div className="text-sm font-bold">{result.fssVerdict}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── MY PLAN TAB ── */}
              {gctTab === 'plan' && (() => {
                const qty        = parseInt(holdingQty) || 0;
                const holdValue  = qty * result.currentPrice;
                const upsidePct  = Math.round((result.upsideLevels[4].price - result.currentPrice) / result.currentPrice * 100);
                const downPct    = Math.round((result.currentPrice - result.crashLevels[4].price) / result.currentPrice * 100);
                const rrRatio    = downPct > 0 ? (upsidePct / downPct).toFixed(1) : '∞';
                const uScore     = Math.min(100, Math.max(0, Math.round(
                  (upsidePct / (upsidePct + downPct)) * 60 +
                  result.avgVms * 25 +
                  (result.hasFundamentals ? (result.fssScore / result.fssTotal) * 15 : 7.5)
                )));
                const uScoreColor = uScore >= 70 ? '#39d98a' : uScore >= 45 ? '#f0c040' : '#ff4d6d';
                const uScoreLabel = uScore >= 70 ? 'Strong Upside' : uScore >= 45 ? 'Moderate Upside' : 'Limited Upside';
                const fmt = (n: number) => `₹${Math.round(n).toLocaleString()}`;
                return (
                  <div className="space-y-4">

                    {/* Qty input for holding context */}
                    <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-4">
                      <div className="text-xs font-black text-[#f0c040] mb-3">Already holding this stock?</div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <label className="text-[10px] font-mono text-[#6b6b85] uppercase mb-1 block">Shares I Already Hold</label>
                          <input type="number" value={holdingQty} onChange={e => setHoldingQty(e.target.value)}
                            placeholder="Leave blank if fresh buyer"
                            className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]" />
                        </div>
                        {qty > 0 && (
                          <div className="text-right pt-5">
                            <div className="text-[10px] font-mono text-[#6b6b85]">CURRENT VALUE</div>
                            <div className="text-lg font-black text-[#e8e8f0]">{fmt(holdValue)}</div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Snapshot */}
                    <div className="rounded-2xl p-5" style={{ background: `linear-gradient(135deg,#0a0a0f,${zc}18)`, border: `1px solid ${zc}50` }}>
                      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                        <div>
                          <div className="text-xs font-mono text-[#6b6b85]">CURRENT PRICE</div>
                          <div className="text-4xl font-black">₹{result.currentPrice.toLocaleString()}</div>
                          <div className="inline-block mt-1 px-3 py-1 rounded-full text-xs font-black" style={{ background: `${zc}25`, color: zc }}>{result.zone}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-mono text-[#6b6b85]">UPSIDE SCORE</div>
                          <div className="text-5xl font-black" style={{ color: uScoreColor }}>{uScore}<span className="text-xl">/100</span></div>
                          <div className="text-xs font-bold" style={{ color: uScoreColor }}>{uScoreLabel}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-[#16161f] rounded-xl p-2">
                          <div className="text-[10px] font-mono text-[#6b6b85]">MAX PROFIT POTENTIAL</div>
                          <div className="text-lg font-black text-[#39d98a]">+{upsidePct}%</div>
                          <div className="text-[10px] font-mono text-[#6b6b85]">if it reaches {fmt(result.upsideLevels[4].price)}</div>
                        </div>
                        <div className="bg-[#16161f] rounded-xl p-2">
                          <div className="text-[10px] font-mono text-[#6b6b85]">MAX RISK</div>
                          <div className="text-lg font-black text-[#ff4d6d]">-{downPct}%</div>
                          <div className="text-[10px] font-mono text-[#6b6b85]">if it crashes to {fmt(result.crashLevels[4].price)}</div>
                        </div>
                        <div className="bg-[#16161f] rounded-xl p-2">
                          <div className="text-[10px] font-mono text-[#6b6b85]">REWARD VS RISK</div>
                          <div className="text-lg font-black text-[#f0c040]">{rrRatio}x</div>
                          <div className="text-[10px] font-mono text-[#6b6b85]">potential gain per ₹1 risk</div>
                        </div>
                      </div>
                    </div>

                    {/* ── PLAN A: Buying Fresh ── */}
                    <div className="bg-[#111118] border border-[#39d98a]/30 rounded-2xl p-5">
                      <div className="text-sm font-black text-[#39d98a] mb-1">📈 PLAN A — Buying Fresh</div>
                      <div className="text-xs font-mono text-[#6b6b85] mb-4">
                        {result.zone === 'BUY ZONE'
                          ? `Stock is in a strong zone. You can buy now.`
                          : result.zone === 'WATCH ZONE'
                          ? `Stock is recovering. Wait for it to cross ${fmt(result.al)} before buying.`
                          : `Stock is falling. Do NOT put all money in now. Buy in small parts as it falls.`}
                      </div>

                      {/* Upside breakout entry */}
                      <div className="mb-4 p-4 rounded-xl bg-[#39d98a]/08 border border-[#39d98a]/20">
                        <div className="text-xs font-black text-[#39d98a] mb-2">IF STOCK GOES UP — Buy when it crosses {fmt(result.al)}</div>
                        <div className="text-xs font-mono text-[#e8e8f0] leading-relaxed">
                          Wait for the stock to close above {fmt(result.al)} for at least 3 days.
                          Then put in <span className="font-black text-[#f0c040]">100% of your planned capital</span> for this stock.
                          Keep a stop loss at {fmt(result.mgc)} — if it falls below that after you buy, sell everything.
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-mono">
                          <div className="bg-[#16161f] rounded-lg p-2">
                            <div className="text-[#6b6b85]">Buy at</div>
                            <div className="font-black text-[#39d98a]">{fmt(result.al)}+</div>
                          </div>
                          <div className="bg-[#16161f] rounded-lg p-2">
                            <div className="text-[#6b6b85]">First Target</div>
                            <div className="font-black text-[#f0c040]">{fmt(result.upsideLevels[1].price)}</div>
                          </div>
                          <div className="bg-[#16161f] rounded-lg p-2">
                            <div className="text-[#6b6b85]">Final Exit</div>
                            <div className="font-black text-[#ff4d6d]">{fmt(result.upsideLevels[4].price)}</div>
                          </div>
                        </div>
                      </div>

                      {/* Crash accumulation */}
                      <div className="p-4 rounded-xl bg-[#ff4d6d]/08 border border-[#ff4d6d]/20">
                        <div className="text-xs font-black text-[#ff4d6d] mb-2">IF STOCK KEEPS FALLING — Buy in parts at these levels</div>
                        <div className="text-xs font-mono text-[#6b6b85] mb-3">Never put all money in at once. Split your capital like this as it falls:</div>
                        <div className="space-y-2">
                          {result.crashLevels.map((lv: any) => {
                            const here = result.currentPrice <= lv.price + result.vwar * 0.5 &&
                              (lv.n === 1 || result.currentPrice > result.crashLevels[lv.n-2].price - result.vwar * 0.5);
                            return (
                              <div key={lv.n} className={`flex items-center justify-between p-3 rounded-xl text-xs font-mono ${here ? 'bg-[#f0c040]/15 border border-[#f0c040]/40' : 'bg-[#16161f]'}`}>
                                <div>
                                  <span className="font-black text-[#f0c040]">{fmt(lv.price)}</span>
                                  {here && <span className="ml-2 text-[9px] bg-[#f0c040] text-black px-1.5 py-0.5 rounded font-black">NEAR HERE NOW</span>}
                                  <div className="text-[#6b6b85] mt-0.5">{lv.mood}</div>
                                </div>
                                <div className="text-right">
                                  <div className="font-black text-[#39d98a]">Invest {lv.alloc}% of capital</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-3 p-3 rounded-xl bg-[#ff4d6d]/15 border border-[#ff4d6d]/30 text-xs font-mono text-[#ff4d6d] font-bold">
                          ⛔ STOP LOSS: If stock closes a full month below {fmt(result.crashLevels[4].price)} → Sell everything immediately. No waiting.
                        </div>
                      </div>
                    </div>

                    {/* ── PLAN B: Already Holding ── */}
                    <div className="bg-[#111118] border border-[#a78bfa]/30 rounded-2xl p-5">
                      <div className="text-sm font-black text-[#a78bfa] mb-1">
                        🤝 PLAN B — Already Holding
                        {qty > 0 ? ` (${qty} shares · current value ${fmt(holdValue)})` : ''}
                      </div>
                      <div className="space-y-3 mt-3">
                        <div className="p-4 rounded-xl bg-[#39d98a]/08 border border-[#39d98a]/20">
                          <div className="text-xs font-black text-[#39d98a] mb-2">✅ KEEP HOLDING if</div>
                          <div className="space-y-1.5 text-xs font-mono text-[#e8e8f0]">
                            <div>· Stock stays above {fmt(result.al)} — you are in profit zone, relax</div>
                            <div>· Stock dips to {fmt(result.al)} but recovers — normal pullback, do not panic sell</div>
                            <div>· Stock is between {fmt(result.al)} and {fmt(result.upsideLevels[4].price)} — stay in, target not reached yet</div>
                          </div>
                        </div>
                        <div className="p-4 rounded-xl bg-[#ff4d6d]/08 border border-[#ff4d6d]/20">
                          <div className="text-xs font-black text-[#ff4d6d] mb-2">🛑 SELL (Stop Loss) if</div>
                          <div className="space-y-1.5 text-xs font-mono text-[#e8e8f0]">
                            <div>· Stock closes 2 months in a row below {fmt(result.mgc)} — trend has reversed, get out</div>
                            <div>· Stock falls below {fmt(result.al)} after you bought on a breakout — trade has failed, exit</div>
                            <div>· Stock closes below {fmt(result.crashLevels[4].price)} — emergency exit, sell all shares</div>
                          </div>
                        </div>
                        <div className="p-4 rounded-xl bg-[#f0c040]/08 border border-[#f0c040]/20">
                          <div className="text-xs font-black text-[#f0c040] mb-2">🎯 SELL (Profit Target)</div>
                          <div className="space-y-1.5 text-xs font-mono text-[#e8e8f0]">
                            <div>· At {fmt(result.upsideLevels[1].price)} → sell 30% of your shares and lock that profit</div>
                            <div>· At {fmt(result.upsideLevels[3].price)} → sell another 40%. Keep 30% for the final run</div>
                            <div>· At {fmt(result.upsideLevels[4].price)} → <span className="font-black text-[#f0c040]">SELL the remaining 30% immediately.</span> Do not be greedy.</div>
                            {qty > 0 && <div className="mt-2 font-black text-[#39d98a]">At final target {fmt(result.upsideLevels[4].price)}, your {qty} shares would be worth {fmt(qty * result.upsideLevels[4].price)}</div>}
                          </div>
                        </div>
                        <div className="p-4 rounded-xl bg-[#16161f] border border-[#1e1e2e]">
                          <div className="text-xs font-black text-[#f0c040] mb-2">🪜 AS STOCK RISES — Move your stop loss up</div>
                          <div className="text-xs font-mono text-[#6b6b85] mb-2">This protects your profit. If it falls back, you still exit with a gain.</div>
                          <div className="space-y-1.5 text-xs font-mono">
                            <div className="flex justify-between"><span className="text-[#6b6b85]">When price reaches {fmt(result.upsideLevels[0].price)}</span><span className="font-bold text-[#f0c040]">→ set SL at {fmt(result.mgc)}</span></div>
                            <div className="flex justify-between"><span className="text-[#6b6b85]">When price reaches {fmt(result.upsideLevels[1].price)}</span><span className="font-bold text-[#f0c040]">→ set SL at {fmt(result.upsideLevels[0].price)}</span></div>
                            <div className="flex justify-between"><span className="text-[#6b6b85]">When price reaches {fmt(result.upsideLevels[3].price)}</span><span className="font-bold text-[#f0c040]">→ set SL at {fmt(result.upsideLevels[1].price)}</span></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Verdict */}
                    <div className="rounded-2xl p-5" style={{ background: `linear-gradient(135deg,#0a0a0f,${zc}15)`, border: `1px solid ${zc}40` }}>
                      <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">⚛ Bottom Line</div>
                      <div className="text-sm font-bold leading-relaxed">{result.verdict}</div>
                      <div className="mt-3 text-[10px] font-mono text-[#6b6b85]">Not Financial Advice · GCT v3.0 · God Particle ⚛</div>
                    </div>

                  </div>
                );
              })()}
            </div>
          );
        })()}

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
