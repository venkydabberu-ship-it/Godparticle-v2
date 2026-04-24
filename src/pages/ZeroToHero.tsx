import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  INDEX_CONFIG, ALL_Z2H_INDICES,
  getExpiryDates, isExpiryDay, getExpiriesForMonth,
  SNAPSHOT_META, computeZ2H,
  type Z2HSnapshot, type SnapshotType,
} from '../lib/z2h';
import { fetchAndSaveZ2HSnapshot } from '../lib/autofetch';

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

export default function ZeroToHero() {
  const { user, profile, refreshProfile } = useAuth();
  const role = profile?.role ?? 'free';
  const isAdmin = role === 'admin';
  const credits = profile?.credits ?? 0;
  const canAccess = role !== 'free';
  const isPremiumPlus = ['premium', 'pro', 'admin'].includes(role);
  const isBasic = role === 'basic';

  const [index, setIndex] = useState('NIFTY50');
  const [expiry, setExpiry] = useState('');
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [result, setResult] = useState<any>(null);
  const [fetchingMorning, setFetchingMorning] = useState(false);
  const [fetchingAnalysis, setFetchingAnalysis] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  const todayStr = new Date().toISOString().split('T')[0];
  const cfg = INDEX_CONFIG[index];
  const expiryDatesThisMonth = getExpiriesForMonth(index, calYear, calMonth);
  const selectedIsExpiry = expiry ? isExpiryDay(index, expiry) : false;
  const nextExpiryAfterSelected = (!selectedIsExpiry && expiry)
    ? getExpiryDates(index, 1, new Date(expiry + 'T00:00:00'))[0] ?? ''
    : '';

  useEffect(() => {
    const dates = getExpiryDates(index, 4);
    if (dates.length > 0) {
      const next = dates[0];
      setExpiry(next);
      const [y, m] = next.split('-').map(Number);
      setCalYear(y);
      setCalMonth(m - 1);
    }
    setResult(null);
    setSnapshots([]);
  }, [index]);

  useEffect(() => {
    if (!expiry) return;
    setResult(null);
    setError('');
    if (isExpiryDay(index, expiry)) loadSnapshots();
    else setSnapshots([]);
  }, [expiry, index]);

  async function loadSnapshots() {
    const { data } = await supabase
      .from('z2h_snapshots')
      .select('*')
      .eq('index_name', index)
      .eq('expiry_date', expiry)
      .order('snapshot_type');
    setSnapshots(data || []);
  }

  const getSnap = (type: SnapshotType) => snapshots.find(s => s.snapshot_type === type) ?? null;
  const snap930 = getSnap('EXPIRY_930');
  const snap1115 = getSnap('EXPIRY_1115');
  const snapDayBefore = getSnap('DAY_BEFORE');

  function buildCalCells(): (string | null)[] {
    const firstDow = new Date(calYear, calMonth, 1).getDay();
    const lastDate = new Date(calYear, calMonth + 1, 0).getDate();
    const cells: (string | null)[] = Array(firstDow).fill(null);
    for (let d = 1; d <= lastDate; d++)
      cells.push(`${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    return cells;
  }

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  }

  async function fetchMorning() {
    if (!user) return;
    setError('');
    setFetchingMorning(true);
    try {
      await fetchAndSaveZ2HSnapshot(index, expiry, 'EXPIRY_930', user.id);
      await loadSnapshots();
    } catch (e: any) {
      setError('Morning fetch failed: ' + e.message);
    } finally {
      setFetchingMorning(false);
    }
  }

  async function fetchAnalysis() {
    if (!user) return;
    setError('');
    if (isBasic) {
      if (credits < 10) { setError('Need 10 credits for analysis snapshot!'); return; }
      const { error: ce } = await supabase.rpc('use_credits', { p_user_id: user.id, p_credits: 10 });
      if (ce) { setError('Credit deduction failed!'); return; }
      await refreshProfile();
    }
    setFetchingAnalysis(true);
    try {
      await fetchAndSaveZ2HSnapshot(index, expiry, 'EXPIRY_1115', user.id);
      await loadSnapshots();
    } catch (e: any) {
      setError('Analysis fetch failed: ' + e.message);
    } finally {
      setFetchingAnalysis(false);
    }
  }

  async function runAnalysis() {
    if (!snap930 || !snap1115) return;
    setAnalyzing(true);
    setError('');
    try {
      const r = computeZ2H(
        snapDayBefore as Z2HSnapshot | null,
        snap930 as Z2HSnapshot,
        snap1115 as Z2HSnapshot,
        index
      );
      setResult(r);
    } catch (e: any) {
      setError('Analysis error: ' + e.message);
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#1e1e2e]">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#f0c040] rounded-xl flex items-center justify-center text-lg">⚛</div>
          <div className="font-bold text-base">God Particle</div>
        </Link>
        <div className="flex items-center gap-3">
          <div className="text-xs font-mono text-[#6b6b85]">
            Credits: <span className="text-[#f0c040] font-bold">{isPremiumPlus ? '∞' : credits}</span>
          </div>
          <Link to="/dashboard" className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040]">← Dashboard</Link>
        </div>
      </nav>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="text-2xl">🚀</div>
            <h1 className="text-2xl font-black">Zero to Hero</h1>
            <span className="text-xs font-bold px-2 py-1 rounded-full bg-[#f0c040]/10 text-[#f0c040] border border-[#f0c040]/20">EXPIRY DAY ONLY</span>
          </div>
          <p className="text-xs font-mono text-[#6b6b85]">Identifies deeply OTM options on expiry day with 3x–10x potential.</p>
        </div>

        {!canAccess && (
          <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-2xl p-6 mb-6 text-center">
            <div className="text-3xl mb-3">🔒</div>
            <div className="text-sm font-bold mb-2">Premium Feature</div>
            <div className="text-xs font-mono text-[#6b6b85] mb-4">Zero to Hero is available for Basic and above plans.</div>
            <Link to="/pricing" className="inline-block bg-[#f0c040] text-black font-black px-6 py-2.5 rounded-xl text-sm">Upgrade Now →</Link>
          </div>
        )}

        {isBasic && (
          <div className="bg-[#f0c040]/10 border border-[#f0c040]/30 rounded-2xl p-4 mb-6">
            <div className="text-xs font-mono text-[#f0c040]">
              ⚡ Basic Plan · Morning snapshot FREE · Analysis snapshot 10 credits · You have {credits} credits ·
              <Link to="/pricing" className="underline ml-1">Upgrade for unlimited access →</Link>
            </div>
          </div>
        )}

        {canAccess && (
          <>
            {/* STEP 1 — Index */}
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 mb-4">
              <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-4">Step 1 · Select Index</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {ALL_Z2H_INDICES.map(key => {
                  const c = INDEX_CONFIG[key];
                  const isSelected = index === key;
                  return (
                    <button key={key} onClick={() => setIndex(key)}
                      className={`py-3 px-3 rounded-xl text-xs font-bold transition-all border text-left ${
                        isSelected ? 'text-black border-transparent' : 'bg-[#16161f] text-[#6b6b85] border-[#1e1e2e] hover:border-[#2e2e3e]'
                      }`}
                      style={isSelected ? { background: c.color } : undefined}>
                      <div>{c.label}</div>
                      <div className={`text-[9px] mt-0.5 font-mono ${isSelected ? 'text-black/60' : 'text-[#444]'}`}>{c.expiryLabel}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* STEP 2 — Calendar */}
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 mb-4">
              <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-4">Step 2 · Select Expiry Date</div>
              <div className="bg-[#16161f] border border-[#1e1e2e] rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <button onClick={prevMonth} className="w-8 h-8 rounded-lg bg-[#1e1e2e] hover:bg-[#2e2e3e] flex items-center justify-center text-[#6b6b85] hover:text-white transition-all text-lg">‹</button>
                  <span className="text-sm font-bold">{MONTHS[calMonth]} {calYear}</span>
                  <button onClick={nextMonth} className="w-8 h-8 rounded-lg bg-[#1e1e2e] hover:bg-[#2e2e3e] flex items-center justify-center text-[#6b6b85] hover:text-white transition-all text-lg">›</button>
                </div>
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                    <div key={d} className="text-center text-[10px] font-mono text-[#6b6b85] py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {buildCalCells().map((dateStr, i) => {
                    if (!dateStr) return <div key={`e-${i}`} />;
                    const isExpiry = expiryDatesThisMonth.has(dateStr);
                    const isSelected = dateStr === expiry;
                    const isToday = dateStr === todayStr;
                    return (
                      <button key={dateStr} onClick={() => setExpiry(dateStr)}
                        className={`aspect-square flex flex-col items-center justify-center text-xs rounded-lg transition-all relative ${
                          isSelected ? 'font-black text-black' :
                          isExpiry ? 'font-bold' :
                          'text-[#3a3a4a] hover:bg-[#1e1e2e] hover:text-[#6b6b85]'
                        }`}
                        style={
                          isSelected ? { background: cfg.color } :
                          isExpiry ? { color: cfg.color, background: `${cfg.color}18` } :
                          undefined
                        }>
                        {dateStr.split('-')[2]}
                        {isToday && !isSelected && (
                          <div className="absolute bottom-0.5 w-1 h-1 rounded-full bg-[#f0c040]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-3 text-[10px] font-mono text-[#6b6b85]">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded" style={{ background: cfg.color }} />
                  <span>Expiry Day</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1 h-1 rounded-full bg-[#f0c040]" />
                  <span>Today</span>
                </div>
              </div>
              {expiry && (
                <div className={`mt-3 rounded-xl px-4 py-3 text-xs font-mono border ${
                  selectedIsExpiry
                    ? 'bg-[#39d98a]/10 border-[#39d98a]/30 text-[#39d98a]'
                    : 'bg-[#ff4d6d]/10 border-[#ff4d6d]/30 text-[#ff4d6d]'
                }`}>
                  {selectedIsExpiry
                    ? `✅ ${expiry} is a valid expiry day for ${cfg.label}. Ready to fetch data!`
                    : `⏰ ${expiry} is NOT an expiry day for ${cfg.label}.${nextExpiryAfterSelected ? ` Come back on ${nextExpiryAfterSelected}!` : ''}`
                  }
                </div>
              )}
            </div>

            {/* STEP 3 — Snapshots */}
            {selectedIsExpiry && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 mb-4">
                <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-4">Step 3 · Capture Market Snapshots</div>
                {error && (
                  <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-lg px-4 py-2 text-xs font-mono text-[#ff4d6d] mb-4">{error}</div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div className={`rounded-xl p-4 border ${snap930 ? 'border-[#39d98a]/30 bg-[#39d98a]/5' : 'border-[#1e1e2e] bg-[#16161f]'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="text-xs font-bold">Morning Snapshot</div>
                        <div className="text-[10px] font-mono text-[#6b6b85]">Ideal: 9:30 AM · fetch anytime</div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#39d98a]/10 text-[#39d98a] border border-[#39d98a]/20">FREE</span>
                    </div>
                    {snap930 ? (
                      <div className="text-[10px] font-mono space-y-0.5">
                        <div className="text-[#39d98a]">✅ Captured</div>
                        <div className="text-[#6b6b85]">Spot: <span className="text-[#e8e8f0]">{snap930.spot_price?.toLocaleString()}</span> · MP: <span className="text-[#e8e8f0]">{snap930.max_pain?.toLocaleString()}</span> · VIX: <span className="text-[#e8e8f0]">{snap930.vix}</span></div>
                        <button onClick={fetchMorning} disabled={fetchingMorning}
                          className="mt-2 w-full py-1.5 rounded-lg text-[10px] font-bold bg-[#1e1e2e] text-[#6b6b85] hover:text-[#39d98a] disabled:opacity-40 transition-all">
                          {fetchingMorning ? '⏳ Refreshing...' : '🔄 Re-fetch'}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="text-[10px] font-mono text-[#6b6b85] mb-3">⏳ Not captured yet. Fetch after market opens.</div>
                        <button onClick={fetchMorning} disabled={fetchingMorning}
                          className="w-full py-2 rounded-lg text-xs font-black bg-[#39d98a]/20 text-[#39d98a] border border-[#39d98a]/30 hover:bg-[#39d98a]/30 disabled:opacity-40 transition-all">
                          {fetchingMorning ? '⏳ Fetching...' : '📡 Fetch Morning Data (Free)'}
                        </button>
                      </>
                    )}
                  </div>

                  <div className={`rounded-xl p-4 border ${snap1115 ? 'border-[#f0c040]/30 bg-[#f0c040]/5' : 'border-[#1e1e2e] bg-[#16161f]'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="text-xs font-bold">Analysis Snapshot</div>
                        <div className="text-[10px] font-mono text-[#6b6b85]">Ideal: 11:15 AM · fetch anytime</div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        isPremiumPlus ? 'bg-[#f0c040]/10 text-[#f0c040] border-[#f0c040]/20' : 'bg-[#ff8c42]/10 text-[#ff8c42] border-[#ff8c42]/20'
                      }`}>{isPremiumPlus ? 'FREE' : '5 Credits'}</span>
                    </div>
                    {snap1115 ? (
                      <div className="text-[10px] font-mono space-y-0.5">
                        <div className="text-[#f0c040]">✅ Captured</div>
                        <div className="text-[#6b6b85]">Spot: <span className="text-[#e8e8f0]">{snap1115.spot_price?.toLocaleString()}</span> · MP: <span className="text-[#e8e8f0]">{snap1115.max_pain?.toLocaleString()}</span> · VIX: <span className="text-[#e8e8f0]">{snap1115.vix}</span></div>
                        <button onClick={fetchAnalysis} disabled={fetchingAnalysis}
                          className="mt-2 w-full py-1.5 rounded-lg text-[10px] font-bold bg-[#1e1e2e] text-[#6b6b85] hover:text-[#f0c040] disabled:opacity-40 transition-all">
                          {fetchingAnalysis ? '⏳ Refreshing...' : '🔄 Re-fetch'}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="text-[10px] font-mono text-[#6b6b85] mb-3">
                          ⏳ Not captured yet. Fetch after 11:15 AM.
                          {!snap930 && <span className="text-[#ff4d6d]"> Fetch morning data first!</span>}
                        </div>
                        <button onClick={fetchAnalysis} disabled={fetchingAnalysis || !snap930}
                          className="w-full py-2 rounded-lg text-xs font-black bg-[#f0c040]/20 text-[#f0c040] border border-[#f0c040]/30 hover:bg-[#f0c040]/30 disabled:opacity-40 transition-all">
                          {fetchingAnalysis ? '⏳ Fetching...' : `📊 Fetch Analysis Data${isBasic ? ' — 10 Credits' : ' (Free)'}`}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isAdmin && (
                  <div className="mt-2">
                    <div className="text-[10px] font-mono text-[#f0c040] font-bold mb-2 uppercase tracking-widest">Admin · All Snapshots</div>
                    <div className="grid grid-cols-5 gap-2">
                      {(['DAY_BEFORE','EXPIRY_930','EXPIRY_1115','EXPIRY_115','EXPIRY_315'] as SnapshotType[]).map(type => {
                        const s = getSnap(type);
                        const meta = SNAPSHOT_META[type];
                        return (
                          <div key={type} className={`rounded-xl p-3 text-center border ${s ? 'border-[#39d98a]/30 bg-[#39d98a]/5' : 'border-[#1e1e2e] bg-[#16161f]'}`}>
                            <div className="text-sm mb-1">{s ? '✅' : '⏳'}</div>
                            <div className="text-[9px] font-mono text-[#6b6b85] leading-tight">{meta.label}</div>
                            <div className="text-[9px] font-mono text-[#444]">{meta.time}</div>
                            {s && <div className="text-[9px] font-mono text-[#39d98a] mt-1">{s.spot_price?.toLocaleString()}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 4 — Run Analysis */}
            {selectedIsExpiry && snap930 && snap1115 && !result && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 mb-4">
                <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-4">Step 4 · Run Analysis</div>
                {error && (
                  <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-lg px-4 py-2 text-xs font-mono text-[#ff4d6d] mb-4">{error}</div>
                )}
                <button onClick={runAnalysis} disabled={analyzing}
                  className="w-full bg-[#f0c040] text-black font-black py-3 rounded-xl text-sm hover:bg-[#ffd060] transition-all disabled:opacity-40">
                  {analyzing ? '⏳ Computing 5 Forces...' : '🚀 Run Zero to Hero Analysis'}
                </button>
              </div>
            )}

            {/* RESULT */}
            {result && (
              <div>
                {result.signal === 'NO_TRADE' ? (
                  <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-2xl p-8 text-center">
                    <div className="text-4xl mb-4">🚫</div>
                    <div className="text-xl font-black mb-2 text-[#ff4d6d]">NO TRADE TODAY</div>
                    <div className="text-sm font-mono text-[#6b6b85] mb-4">{result.reason}</div>
                    <div className="text-xs font-mono text-[#6b6b85]">Forces aligned: {result.forces?.count ?? 0}/5 · Direction: {result.direction}</div>
                    <div className="mt-4 text-xs font-mono text-[#f0c040]">⭐ Patience is the edge. Wait for next expiry with 4+ forces.</div>
                  </div>
                ) : (
                  <>
                    {(() => {
                      const isBull = result.direction === 'BULLISH';
                      const col = isBull ? '#39d98a' : '#ff4d6d';
                      const entryLTP = result.entryLTPRef ?? 0;
                      const sl = Math.round(entryLTP * (result.stopLossPct ?? 0.5));
                      const t1 = Math.round(entryLTP * (result.target1x ?? 3));
                      const t2 = Math.round(entryLTP * (result.target2x ?? 5));
                      const hero = Math.round(entryLTP * (result.heroX ?? 10));
                      return (
                        <div className="relative rounded-2xl overflow-hidden p-8 mb-6"
                          style={{
                            background: isBull ? 'linear-gradient(135deg,#0a0a0f 0%,#0a1a0a 50%,#0a0a0f 100%)' : 'linear-gradient(135deg,#0a0a0f 0%,#1a0a0a 50%,#0a0a0f 100%)',
                            border: `1px solid ${col}4d`,
                            boxShadow: `0 0 60px ${col}14`
                          }}>
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                            <div className="text-[180px] font-black opacity-[0.03]" style={{ color: col }}>🚀</div>
                          </div>
                          <div className="relative z-10">
                            <div className="text-center mb-8">
                              <div className="text-xs font-mono tracking-[3px] mb-2" style={{ color: col }}>🚀 ZERO TO HERO SIGNAL</div>
                              <div className="text-3xl font-black mb-1" style={{ color: col }}>{result.selectedStrike} {result.optionType}</div>
                              <div className="text-sm font-mono text-[#6b6b85]">{index} · Expiry: {expiry}</div>
                              <div className="mt-2 inline-block px-4 py-1 rounded-full text-xs font-bold"
                                style={{ background: `${col}1a`, color: col, border: `1px solid ${col}4d` }}>
                                {isBull ? '📈 BULLISH' : '📉 BEARISH'} · {result.forces?.count ?? 0}/5 Forces
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 mb-6">
                              <div className="bg-black/20 rounded-xl p-4 text-center">
                                <div className="text-xs font-mono text-[#6b6b85] mb-1 uppercase tracking-widest">⏰ Entry Time</div>
                                <div className="text-2xl font-black text-[#f0c040]">1:15 PM</div>
                                <div className="text-xs font-mono text-[#6b6b85] mt-1">Gamma window opens</div>
                              </div>
                              <div className="bg-black/20 rounded-xl p-4 text-center">
                                <div className="text-xs font-mono text-[#6b6b85] mb-1 uppercase tracking-widest">💰 Entry Zone</div>
                                <div className="text-2xl font-black" style={{ color: col }}>{entryLTP > 0 ? `₹${entryLTP}` : 'At Market'}</div>
                                <div className="text-xs font-mono text-[#6b6b85] mt-1">LTP ref at 11:15 AM</div>
                              </div>
                            </div>
                            <div className="rounded-xl overflow-hidden mb-6" style={{ border: `1px solid ${col}33` }}>
                              <table className="w-full font-mono text-sm">
                                <thead>
                                  <tr style={{ borderBottom: `1px solid ${col}33`, background: 'rgba(0,0,0,0.3)' }}>
                                    {['LEVEL','PRICE','RETURN','ACTION'].map(h => (
                                      <th key={h} className="text-left px-4 py-3 text-xs tracking-widest font-bold text-[#6b6b85]">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {[
                                    { level: '🛑 Stop Loss',   price: sl,   ret: '-50%', action: 'EXIT ALL',     color: '#ff4d6d' },
                                    { level: '🎯 Target 1',    price: t1,   ret: '3x',   action: 'Exit 50%',     color: '#f0c040' },
                                    { level: '🎯 Target 2',    price: t2,   ret: '5x',   action: 'Exit 30%',     color: '#39d98a' },
                                    { level: '💎 Hero Target', price: hero, ret: '10x',  action: 'Let 20% ride', color: '#4d9fff' },
                                  ].map((row, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                      <td className="px-4 py-3 font-bold text-xs" style={{ color: row.color }}>{row.level}</td>
                                      <td className="px-4 py-3 font-black text-sm" style={{ color: row.color }}>₹{row.price}</td>
                                      <td className="px-4 py-3 text-xs" style={{ color: row.color }}>{row.ret}</td>
                                      <td className="px-4 py-3 text-xs text-[#6b6b85]">{row.action}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {result.skipConditions?.length > 0 && (
                              <div className="bg-black/20 rounded-xl p-4 mb-6">
                                <div className="text-xs font-mono text-[#ff4d6d] font-bold mb-2 uppercase tracking-widest">⚠️ Skip Trade If</div>
                                {result.skipConditions.map((c: string, i: number) => (
                                  <div key={i} className="text-xs font-mono text-[#6b6b85] mb-1">→ {c}</div>
                                ))}
                              </div>
                            )}
                            {isPremiumPlus && result.forces && (
                              <div className="bg-black/20 rounded-xl p-4 mb-6">
                                <div className="text-xs font-mono text-[#f0c040] font-bold mb-3 uppercase tracking-widest">🔬 5-Force Analysis</div>
                                <div className="grid grid-cols-1 gap-2">
                                  {[
                                    { label: 'Force 1 — Direction (200pt move)', ok: result.forces.direction },
                                    { label: 'Force 2 — OI Accumulation',        ok: result.forces.oi       },
                                    { label: 'Force 3 — PCB / God Particle',     ok: result.forces.pcb      },
                                    { label: 'Force 4 — Max Pain Gravity',       ok: result.forces.maxPain  },
                                    { label: 'Force 5 — VIX + Gamma Window',    ok: result.forces.vix      },
                                  ].map((f, i) => (
                                    <div key={i} className="flex items-center justify-between text-xs font-mono">
                                      <span className="text-[#6b6b85]">{f.label}</span>
                                      <span className={f.ok ? 'text-[#39d98a]' : 'text-[#ff4d6d]'}>{f.ok ? '✅ CONFIRMED' : '❌ NOT MET'}</span>
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-3 pt-3 border-t border-[#1e1e2e] flex items-center justify-between">
                                  <span className="text-xs font-mono text-[#6b6b85]">Forces Aligned</span>
                                  <span className={`text-sm font-black ${result.forces.count >= 4 ? 'text-[#39d98a]' : result.forces.count >= 3 ? 'text-[#f0c040]' : 'text-[#ff4d6d]'}`}>
                                    {result.forces.count}/5
                                  </span>
                                </div>
                              </div>
                            )}
                            {isAdmin && (
                              <div className="bg-black/20 rounded-xl p-4 mb-6">
                                <div className="text-xs font-mono text-[#f0c040] font-bold mb-3 uppercase tracking-widest">📊 Market Context</div>
                                <div className="grid grid-cols-3 gap-4 text-xs font-mono">
                                  <div>
                                    <div className="text-[#6b6b85] mb-1">Spot Move</div>
                                    <div className={`font-bold ${result.spotMove < 0 ? 'text-[#ff4d6d]' : 'text-[#39d98a]'}`}>{result.spotMove > 0 ? '+' : ''}{Math.round(result.spotMove)} pts</div>
                                  </div>
                                  <div>
                                    <div className="text-[#6b6b85] mb-1">Max Pain</div>
                                    <div className="font-bold">{result.maxPain1115?.toLocaleString()}</div>
                                  </div>
                                  <div>
                                    <div className="text-[#6b6b85] mb-1">VIX</div>
                                    <div className={`font-bold ${result.vix1115 >= 18 ? 'text-[#39d98a]' : 'text-[#ff4d6d]'}`}>{result.vix1115}</div>
                                  </div>
                                </div>
                              </div>
                            )}
                            <div className="text-center space-y-2">
                              <div className="text-xs font-mono text-[#6b6b85]">⭐ Entry only between 1:15 PM – 2:00 PM · Not Financial Advice</div>
                              <div className="text-xs font-black tracking-widest" style={{ color: col }}>DEVELOPED BY GOD PARTICLE ⚛</div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

