import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase, callEdge } from '../lib/supabase';
import {
  INDEX_CONFIG, ALL_Z2H_INDICES,
  getExpiryDates, isExpiryDay, getExpiriesForMonth,
  computeZ2H, calculateMaxPain, analyzeReversal,
  computeMaxPainPull, buildTodayExpirySetup,
  type Z2HSnapshot, type SnapshotType, type ReversalAnalysis,
  type MaxPainPullResult, type TodayExpirySetup, type Z2HStrikeCandidate,
} from '../lib/z2h';
import { fetchAndSaveZ2HSnapshot } from '../lib/autofetch';

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

export default function ZeroToHero() {
  const { user, profile, refreshProfile } = useAuth();
  const role = profile?.role ?? 'free';
  const isAdmin = role === 'admin';
  const credits = profile?.credits ?? 0;
  const canAccess = true; // all plans can access Z2H
  const isPremiumPlus = ['premium', 'pro', 'admin'].includes(role);
  const isBasic = role === 'basic';

  const [index, setIndex] = useState('NIFTY50');
  const [expiry, setExpiry] = useState('');
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [prevDaySnap, setPrevDaySnap] = useState<Z2HSnapshot | null>(null);
  const [result, setResult] = useState<any>(null);
  const [reversal, setReversal] = useState<ReversalAnalysis | null>(null);
  const [fetchingMorning, setFetchingMorning] = useState(false);
  const [fetchingAnalysis, setFetchingAnalysis] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [todaySetups, setTodaySetups] = useState<TodayExpirySetup[]>([]);
  const [setupsLoading, setSetupsLoading] = useState(false);
  const [z2hAiInsight, setZ2hAiInsight] = useState('');
  const [z2hAiLoading, setZ2hAiLoading] = useState(false);
  const [z2hAiError, setZ2hAiError] = useState('');
  const [activeTier, setActiveTier] = useState<0|1|2|3>(0);
  const [activeDir, setActiveDir] = useState<'PE'|'CE'>('PE');

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
    setPrevDaySnap(null);
    setActiveTier(0);
    setActiveDir('PE');
  }, [index]);

  useEffect(() => {
    if (!expiry) return;
    setResult(null);
    setError('');
    setActiveTier(0);
    setActiveDir('PE');
    loadSnapshots();
  }, [expiry, index]);

  // Anti-staleness: when user returns to the tab, silently refresh auth + reload snapshots
  useEffect(() => {
    let hiddenAt = 0;
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else {
        const awayMs = Date.now() - hiddenAt;
        if (awayMs > 3 * 60 * 1000 && expiry) { // away > 3 min
          supabase.auth.getSession(); // refreshes token if expired
          loadSnapshots();            // silently reload snapshot data
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [expiry, index]);

  // Load today's expiry setups across all indices — morning briefing
  useEffect(() => {
    async function loadTodaySetups() {
      setSetupsLoading(true);
      try {
        const today = new Date().toISOString().split('T')[0];
        const expiringToday = ALL_Z2H_INDICES.filter(k => isExpiryDay(k, today));
        if (!expiringToday.length) { setTodaySetups([]); return; }

        const results: TodayExpirySetup[] = [];
        for (const indexKey of expiringToday) {
          const { data } = await supabase
            .from('market_data')
            .select('strike_data, expiry')
            .eq('index_name', indexKey)
            .eq('expiry', today)
            .order('trade_date', { ascending: false })
            .limit(1);
          if (data?.length) {
            const setup = buildTodayExpirySetup(indexKey, data[0].expiry, data[0].strike_data || {});
            results.push(setup);
          }
        }
        setTodaySetups(results);
      } finally {
        setSetupsLoading(false);
      }
    }
    loadTodaySetups();
  }, []);

  async function loadSnapshots() {
    const { data } = await supabase
      .from('z2h_snapshots')
      .select('*')
      .eq('index_name', index)
      .eq('expiry_date', expiry)
      .order('snapshot_type');
    setSnapshots(data || []);

    // If no DAY_BEFORE in z2h_snapshots, load from market_data (saved by admin auto-fetch)
    const hasDayBefore = (data || []).some((s: any) =>
      s.snapshot_type === 'DAY_BEFORE' || s.snapshot_type === 'EXPIRY_EOD'
    );
    if (!hasDayBefore) {
      const prevDay = new Date(expiry + 'T12:00:00');
      prevDay.setDate(prevDay.getDate() - 1);
      const prevDayStr = prevDay.toISOString().split('T')[0];
      const { data: md } = await supabase
        .from('market_data')
        .select('strike_data')
        .eq('index_name', index)
        .eq('expiry', expiry)
        .eq('trade_date', prevDayStr)
        .limit(1);
      if (md && md.length > 0) {
        const sd = md[0].strike_data || {};
        const spot = sd['_spot_close'] || 0;
        const strikesOnly = Object.fromEntries(Object.entries(sd).filter(([k]) => !k.startsWith('_')));
        const mp = calculateMaxPain(strikesOnly);
        setPrevDaySnap({ index_name: index, expiry_date: expiry, snapshot_type: 'DAY_BEFORE', spot_price: spot, max_pain: mp, vix: 0, strike_data: strikesOnly } as Z2HSnapshot);
      } else {
        setPrevDaySnap(null);
      }
    } else {
      setPrevDaySnap(null);
    }
  }

  const getSnap = (type: SnapshotType) => snapshots.find(s => s.snapshot_type === type) ?? null;
  const snap930 = getSnap('EXPIRY_930');
  const snap1115 = getSnap('EXPIRY_1115');
  // DAY_BEFORE: from z2h_snapshots first, then market_data fallback (prevDaySnap)
  const snapDayBefore = getSnap('DAY_BEFORE') ?? getSnap('EXPIRY_EOD') ?? prevDaySnap;

  // Computed inline — no useEffect needed since snap930/snapDayBefore are already derived from state
  const maxPainPull: MaxPainPullResult | null = (snap930 && selectedIsExpiry)
    ? computeMaxPainPull(snapDayBefore as Z2HSnapshot | null, snap930 as Z2HSnapshot, index)
    : null;

  // Resolve prev day max pain for display — DB may have stored it as null
  const prevDayMaxPain: number = (() => {
    if (!snapDayBefore) return 0;
    if (snapDayBefore.max_pain) return snapDayBefore.max_pain;
    if (snapDayBefore.strike_data) return calculateMaxPain(snapDayBefore.strike_data);
    return 0;
  })();

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

  async function fetchZ2HAIInsight() {
    if (!maxPainPull) return;
    setZ2hAiLoading(true);
    setZ2hAiError('');
    try {
      const data = await callEdge('ai-insight', {
        type: 'z2h_signal',
        data: {
          signal: maxPainPull.signal,
          direction: maxPainPull.direction,
          indexKey: index,
          expiry,
          spot930: maxPainPull.spot930,
          prevMaxPain: maxPainPull.prevMaxPain,
          pullStrike: maxPainPull.pullStrike,
          wallStrike: maxPainPull.wallStrike,
          pullLTP: maxPainPull.pullLTP,
          gapPct: maxPainPull.gapPct,
          gap: maxPainPull.gap,
          optionType: maxPainPull.optionType,
          targets: maxPainPull.targets,
        },
      });
      setZ2hAiInsight(data.insight);
    } catch (err: any) {
      setZ2hAiError(err.message || 'AI insight failed');
    } finally {
      setZ2hAiLoading(false);
    }
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
    if (!isPremiumPlus) {
      if (credits < 5) { setError('Need 5 credits for Analysis CSV!'); return; }
      const { error: ce } = await supabase.rpc('use_credits', { p_user_id: user.id, p_credits: 5 });
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
    if (!snap930) return;
    setAnalyzing(true);
    setError('');
    try {
      const r = computeZ2H(
        snapDayBefore as Z2HSnapshot | null,
        snap930 as Z2HSnapshot,
        snap1115 as Z2HSnapshot | null,
        index
      );
      setResult(r);
      setActiveDir(r.direction === 'BEARISH' ? 'PE' : 'CE');
      setActiveTier(0);
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

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="text-2xl">🚀</div>
            <h1 className="text-2xl font-black">Zero to Hero</h1>
            <span className="text-xs font-bold px-2 py-1 rounded-full bg-[#f0c040]/10 text-[#f0c040] border border-[#f0c040]/20">EXPIRY DAY ONLY</span>
          </div>
          <p className="text-xs font-mono text-[#6b6b85]">Identifies deeply OTM options on expiry day with 3x–10x potential.</p>
        </div>

        {/* TODAY'S EXPIRY SETUPS — morning briefing across all indices */}
        {(todaySetups.length > 0 || setupsLoading) && (
          <div className="bg-[#111118] border border-[#f0c040]/30 rounded-2xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="text-base">🎯</div>
              <div className="text-xs font-black uppercase tracking-widest text-[#f0c040]">Today's Expiry — Max Pain Pull & Gamma Wall Watch</div>
            </div>
            {setupsLoading ? (
              <div className="text-xs font-mono text-[#6b6b85]">Loading today's setups...</div>
            ) : (
              <div className="space-y-3">
                {todaySetups.map(setup => {
                  const cfg = INDEX_CONFIG[setup.indexKey];
                  const col = cfg?.color ?? '#f0c040';
                  const isAction = setup.isActionable;
                  return (
                    <div
                      key={setup.indexKey}
                      className={`rounded-xl p-4 border cursor-pointer transition-all ${
                        isAction
                          ? 'border-[#f0c040]/40 bg-[#f0c040]/5 hover:border-[#f0c040]/60'
                          : 'border-[#1e1e2e] bg-[#16161f]'
                      }`}
                      onClick={() => { setIndex(setup.indexKey); setExpiry(setup.expiry); }}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-xs" style={{ color: col }}>{setup.indexKey}</span>
                          <span className="text-[9px] font-mono text-[#6b6b85] bg-[#1e1e2e] px-1.5 py-0.5 rounded">Exp {setup.expiry.slice(5).replace('-', ' ')}</span>
                          {isAction && (
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                              setup.direction === 'BULLISH'
                                ? 'bg-[#39d98a]/15 text-[#39d98a] border border-[#39d98a]/30'
                                : 'bg-[#ff4d6d]/15 text-[#ff4d6d] border border-[#ff4d6d]/30'
                            }`}>
                              {setup.direction === 'BULLISH' ? '▲ BULL PULL' : '▼ BEAR PULL'}
                            </span>
                          )}
                          {!isAction && setup.hasGammaWall && (
                            <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-[#a855f7]/15 text-[#a855f7] border border-[#a855f7]/30">
                              ⚡ GAMMA WALL
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-mono">
                          <span className="text-[#6b6b85]">Spot <span className="text-[#e8e8f0]">{setup.prevSpot.toLocaleString('en-IN')}</span></span>
                          <span className="text-[#6b6b85]">MaxPain <span className="text-[#f0c040]">{setup.prevMaxPain.toLocaleString('en-IN')}</span></span>
                          <span className={`font-black ${isAction ? (setup.direction === 'BULLISH' ? 'text-[#39d98a]' : 'text-[#ff4d6d]') : 'text-[#6b6b85]'}`}>
                            {setup.gap > 0 ? '+' : ''}{setup.gap} pts ({setup.gapPct}%)
                          </span>
                        </div>
                      </div>
                      {isAction && (
                        <div className="mt-2 text-[10px] font-mono text-[#6b6b85]">
                          Watch: <span className="text-[#f0c040] font-black">{setup.indexKey} {setup.pullStrike} {setup.optionType}</span>
                          {' '}— spot is {Math.abs(setup.gap)} pts {setup.gap > 0 ? 'below' : 'above'} max pain.
                          Buy at 9:30 AM if premium is cheap (&lt;₹150). Exit at max pain target {setup.prevMaxPain.toLocaleString('en-IN')}.
                        </div>
                      )}
                      {!isAction && setup.hasGammaWall && (
                        <div className="mt-2 text-[10px] font-mono text-[#6b6b85]">
                          {setup.ceWallDistPct >= 0.3 && setup.ceWallDistPct <= 3.0 && (
                            <div>CE wall: <span className="text-[#a855f7] font-black">{setup.ceWallStrike} CE</span> is {setup.ceWallDistPct}% above spot — massive CE OI. If spot pushes up, gamma squeeze possible. Confirm live LTP &lt;₹150 at 9:30 AM.</div>
                          )}
                          {setup.peWallDistPct >= 0.3 && setup.peWallDistPct <= 3.0 && (
                            <div className="mt-1">PE wall: <span className="text-[#a855f7] font-black">{setup.peWallStrike} PE</span> is {setup.peWallDistPct}% below spot — massive PE OI. If spot breaks down, gamma squeeze possible. Confirm live LTP &lt;₹150 at 9:30 AM.</div>
                          )}
                        </div>
                      )}
                      {!isAction && !setup.hasGammaWall && (
                        <div className="mt-1 text-[9px] font-mono text-[#3a3a4a]">
                          Gap {setup.gapPct}% — {setup.gapPct < 1 ? 'spot at max pain · no clear edge today' : 'too far from max pain (risky)'}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="text-[9px] font-mono text-[#6b6b85]">Based on yesterday's OI close · Click any row to analyse that index</div>
              </div>
            )}
          </div>
        )}

        {!isPremiumPlus && credits >= 0 && (
          <div className="bg-[#f0c040]/10 border border-[#f0c040]/30 rounded-2xl p-4 mb-6">
            <div className="text-xs font-mono text-[#f0c040]">
              ⚡ Opening CSV — Free · Analysis CSV — 5 credits · You have {credits} credits ·
              <Link to="/pricing" className="underline ml-1">Upgrade to Premium for unlimited free access →</Link>
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

            {/* STEP 3 — Market CSV Data */}
            {selectedIsExpiry && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest">Step 3 · Market CSV Data</div>
                  <button onClick={loadSnapshots} className="text-[10px] font-mono text-[#6b6b85] hover:text-[#f0c040] border border-[#1e1e2e] rounded-lg px-2 py-1 transition-all">🔄 Refresh</button>
                </div>
                {error && (
                  <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-lg px-4 py-2 text-xs font-mono text-[#ff4d6d] mb-4">{error}</div>
                )}

                {/* Prev Day Close — loaded from database by admin auto-fetch */}
                <div className={`rounded-xl p-4 border mb-4 ${snapDayBefore ? 'border-[#4d9fff]/30 bg-[#4d9fff]/5' : 'border-[#1e1e2e]/60 bg-[#16161f]/60'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <div className="text-xs font-bold text-[#4d9fff]">Prev Day Close</div>
                      <div className="text-[10px] font-mono text-[#6b6b85]">Loaded from database · used for PCB (Force 3)</div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#4d9fff]/10 text-[#4d9fff] border border-[#4d9fff]/20">AUTO</span>
                  </div>
                  {snapDayBefore ? (
                    <div className="text-[10px] font-mono space-y-0.5">
                      <div className="text-[#4d9fff]">✅ Loaded from database</div>
                      <div className="text-[#6b6b85]">Spot: <span className="text-[#e8e8f0]">{snapDayBefore.spot_price?.toLocaleString()}</span> · Max Pain: <span className="text-[#f0c040]">{prevDayMaxPain > 0 ? prevDayMaxPain.toLocaleString() : '—'}</span></div>
                    </div>
                  ) : (
                    <div className="text-[10px] font-mono text-[#6b6b85]">
                      ⏳ Not yet available. Admin auto-fetch will populate this. Analysis still works without it — Force 3 (PCB) gives benefit of doubt.
                    </div>
                  )}
                </div>

                {/* Opening CSV + Analysis CSV */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  {/* Opening CSV */}
                  <div className={`rounded-xl p-4 border ${snap930 ? 'border-[#39d98a]/30 bg-[#39d98a]/5' : 'border-[#1e1e2e] bg-[#16161f]'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="text-xs font-bold">Opening CSV</div>
                        <div className="text-[10px] font-mono text-[#6b6b85]">Recommended: 9:30 AM · Free for all</div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#39d98a]/10 text-[#39d98a] border border-[#39d98a]/20">FREE</span>
                    </div>
                    {snap930 ? (
                      <div className="text-[10px] font-mono space-y-0.5">
                        <div className="text-[#39d98a]">✅ Fetched</div>
                        <div className="text-[#6b6b85]">Spot: <span className="text-[#e8e8f0]">{snap930.spot_price?.toLocaleString()}</span> · MP: <span className="text-[#e8e8f0]">{snap930.max_pain?.toLocaleString()}</span> · VIX: <span className="text-[#e8e8f0]">{snap930.vix}</span></div>
                        <button onClick={fetchMorning} disabled={fetchingMorning}
                          className="mt-2 w-full py-1.5 rounded-lg text-[10px] font-bold bg-[#1e1e2e] text-[#6b6b85] hover:text-[#39d98a] disabled:opacity-40 transition-all">
                          {fetchingMorning ? '⏳ Re-fetching...' : '🔄 Re-fetch'}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="text-[10px] font-mono text-[#6b6b85] mb-3">⏳ Not fetched yet. Fetch anytime after market opens.</div>
                        <button onClick={fetchMorning} disabled={fetchingMorning}
                          className="w-full py-2 rounded-lg text-xs font-black bg-[#39d98a]/20 text-[#39d98a] border border-[#39d98a]/30 hover:bg-[#39d98a]/30 disabled:opacity-40 transition-all">
                          {fetchingMorning ? '⏳ Fetching...' : '📡 Fetch Opening CSV (Free)'}
                        </button>
                      </>
                    )}
                  </div>

                  {/* Analysis CSV */}
                  <div className={`rounded-xl p-4 border ${snap1115 ? 'border-[#f0c040]/30 bg-[#f0c040]/5' : 'border-[#1e1e2e] bg-[#16161f]'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="text-xs font-bold">Analysis CSV</div>
                        <div className="text-[10px] font-mono text-[#6b6b85]">Recommended: 11:15 AM · Fetch anytime</div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        isPremiumPlus ? 'bg-[#f0c040]/10 text-[#f0c040] border-[#f0c040]/20' : 'bg-[#ff8c42]/10 text-[#ff8c42] border-[#ff8c42]/20'
                      }`}>{isPremiumPlus ? 'FREE' : '5 Credits'}</span>
                    </div>
                    {snap1115 ? (
                      <div className="text-[10px] font-mono space-y-0.5">
                        <div className="text-[#f0c040]">✅ Fetched</div>
                        <div className="text-[#6b6b85]">Spot: <span className="text-[#e8e8f0]">{snap1115.spot_price?.toLocaleString()}</span> · MP: <span className="text-[#e8e8f0]">{snap1115.max_pain?.toLocaleString()}</span> · VIX: <span className="text-[#e8e8f0]">{snap1115.vix}</span></div>
                        <button onClick={fetchAnalysis} disabled={fetchingAnalysis}
                          className="mt-2 w-full py-1.5 rounded-lg text-[10px] font-bold bg-[#1e1e2e] text-[#6b6b85] hover:text-[#f0c040] disabled:opacity-40 transition-all">
                          {fetchingAnalysis ? '⏳ Re-fetching...' : '🔄 Re-fetch'}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="text-[10px] font-mono text-[#6b6b85] mb-3">⏳ Not fetched yet. Fetch anytime after market opens.</div>
                        <button onClick={fetchAnalysis} disabled={fetchingAnalysis}
                          className="w-full py-2 rounded-lg text-xs font-black bg-[#f0c040]/20 text-[#f0c040] border border-[#f0c040]/30 hover:bg-[#f0c040]/30 disabled:opacity-40 transition-all">
                          {fetchingAnalysis ? '⏳ Fetching...' : `📊 Fetch Analysis CSV${isPremiumPlus ? ' (Free)' : ' — 5 Credits'}`}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* MAX PAIN PULL / GAMMA WALL SQUEEZE — early signal from 9:30 AM data only */}
            {selectedIsExpiry && snap930 && maxPainPull && (
              <div className={`rounded-2xl p-6 mb-4 border ${
                maxPainPull.signal === 'GAMMA_WALL_SQUEEZE'
                  ? (maxPainPull.strength === 'HIGH' ? 'bg-[#a855f7]/8 border-[#a855f7]/40' : 'bg-[#a855f7]/5 border-[#a855f7]/25')
                  : (maxPainPull.strength === 'HIGH' ? 'bg-[#f0c040]/8 border-[#f0c040]/40' : 'bg-[#ff8c42]/8 border-[#ff8c42]/40')
              }`}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl">{maxPainPull.signal === 'GAMMA_WALL_SQUEEZE' ? '🧲' : '⚡'}</span>
                  <div>
                    <div className={`text-xs font-black uppercase tracking-widest ${
                      maxPainPull.signal === 'GAMMA_WALL_SQUEEZE'
                        ? 'text-[#a855f7]'
                        : (maxPainPull.strength === 'HIGH' ? 'text-[#f0c040]' : 'text-[#ff8c42]')
                    }`}>
                      {maxPainPull.signal === 'GAMMA_WALL_SQUEEZE'
                        ? `Gamma Wall Squeeze — ${maxPainPull.strength === 'HIGH' ? 'STRONG SETUP' : 'MODERATE SETUP'}`
                        : `Max Pain Pull — ${maxPainPull.strength === 'HIGH' ? 'STRONG SETUP' : 'MODERATE SETUP'}`
                      }
                    </div>
                    <div className="text-[9px] font-mono text-[#6b6b85]">
                      {maxPainPull.signal === 'GAMMA_WALL_SQUEEZE'
                        ? 'Gamma squeeze · Enter 9:30–10:30 AM · OI wall forces writers to hedge if spot approaches'
                        : 'Gravity pull · Enter 9:30–10:30 AM · Before the confirmed 5-force window'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="bg-black/30 rounded-xl p-3 text-center">
                    <div className="text-[9px] font-mono text-[#6b6b85] uppercase mb-1">
                      {maxPainPull.signal === 'GAMMA_WALL_SQUEEZE' ? 'Wall Strike' : 'Strike'}
                    </div>
                    <div className={`font-black text-lg ${maxPainPull.direction === 'BULLISH' ? 'text-[#39d98a]' : 'text-[#ff4d6d]'}`}>
                      {maxPainPull.pullStrike} {maxPainPull.optionType}
                    </div>
                  </div>
                  <div className="bg-black/30 rounded-xl p-3 text-center">
                    <div className="text-[9px] font-mono text-[#6b6b85] uppercase mb-1">Entry LTP</div>
                    <div className="font-black text-lg text-[#f0c040]">
                      {maxPainPull.pullLTP > 0 ? `₹${maxPainPull.pullLTP}` : '—'}
                    </div>
                  </div>
                  <div className="bg-black/30 rounded-xl p-3 text-center">
                    <div className="text-[9px] font-mono text-[#6b6b85] uppercase mb-1">
                      {maxPainPull.signal === 'GAMMA_WALL_SQUEEZE' ? 'Wall Target' : 'Gap to MaxPain'}
                    </div>
                    <div className={`font-black text-lg ${maxPainPull.direction === 'BULLISH' ? 'text-[#39d98a]' : 'text-[#ff4d6d]'}`}>
                      {maxPainPull.signal === 'GAMMA_WALL_SQUEEZE' && maxPainPull.wallStrike
                        ? maxPainPull.wallStrike.toLocaleString('en-IN')
                        : `${Math.abs(maxPainPull.gap)} pts`}
                    </div>
                  </div>
                  <div className="bg-black/30 rounded-xl p-3 text-center">
                    <div className="text-[9px] font-mono text-[#6b6b85] uppercase mb-1">
                      {maxPainPull.signal === 'GAMMA_WALL_SQUEEZE' ? 'OTM from Spot' : 'Pull %'}
                    </div>
                    <div className="font-black text-lg text-[#e8e8f0]">
                      {maxPainPull.signal === 'GAMMA_WALL_SQUEEZE'
                        ? `${Math.round(Math.abs(
                            maxPainPull.direction === 'BULLISH'
                              ? maxPainPull.pullStrike - maxPainPull.spot930
                              : maxPainPull.spot930 - maxPainPull.pullStrike
                          ))} pts`
                        : `${maxPainPull.gapPct}%`}
                    </div>
                  </div>
                </div>

                <div className="text-[10px] font-mono text-[#6b6b85] mb-3">{maxPainPull.reason}</div>

                {maxPainPull.pullLTP > 0 && (
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {[
                      { label: 'SL',      val: maxPainPull.targets.sl,   col: '#ff4d6d' },
                      { label: 'T1 3x',   val: maxPainPull.targets.t1,   col: '#f0c040' },
                      { label: 'T2 5x',   val: maxPainPull.targets.t2,   col: '#39d98a' },
                      { label: 'Hero 10x',val: maxPainPull.targets.hero,  col: '#4d9fff' },
                    ].map(r => (
                      <div key={r.label} className="bg-black/30 rounded-lg p-2 text-center">
                        <div className="text-[9px] font-mono text-[#6b6b85]">{r.label}</div>
                        <div className="font-black text-sm" style={{ color: r.col }}>₹{r.val}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="bg-black/20 rounded-xl p-3 text-[10px] font-mono text-[#6b6b85]">
                  {maxPainPull.signal === 'GAMMA_WALL_SQUEEZE' ? (
                    <><span className="text-[#a855f7] font-black">⚠ Risk:</span> Gamma squeezes require market to MOVE toward the wall. If spot stalls at max pain by 11:00 AM, exit. Size to 25-50% of normal — all-or-nothing trade. Confirm LTP is still cheap (&lt;₹150) before entry.</>
                  ) : (
                    <><span className="text-[#f0c040] font-black">⚠ Risk:</span> EARLY signal — direction not yet confirmed by volume. Size to 25-50% of normal. All-or-nothing trade. If spot doesn't move toward max pain by 12:00 PM, exit immediately.</>
                  )}
                </div>

                {/* AI TRADE INSIGHT */}
                <div className="mt-3 pt-3 border-t border-white/10">
                  {!z2hAiInsight && !z2hAiLoading && (
                    <button
                      onClick={fetchZ2HAIInsight}
                      className="w-full py-2.5 rounded-xl text-xs font-black border border-[#a855f7]/40 text-[#a855f7] hover:bg-[#a855f7]/10 transition-all"
                    >
                      🤖 Get AI Trade Insight
                    </button>
                  )}
                  {z2hAiLoading && (
                    <div className="text-center text-xs font-mono text-[#a855f7] py-2">⏳ AI is analysing this setup...</div>
                  )}
                  {z2hAiError && (
                    <div className="text-xs font-mono text-[#ff4d6d] py-1">{z2hAiError}</div>
                  )}
                  {z2hAiInsight && (
                    <div className="bg-[#1a1020] border border-[#a855f7]/30 rounded-xl p-4">
                      <div className="text-[9px] font-black uppercase tracking-widest text-[#a855f7] mb-2">🤖 AI Trade Insight</div>
                      <div className="text-[11px] font-mono text-[#e8e8f0] leading-relaxed whitespace-pre-line">{z2hAiInsight}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 4 — Get Z2H Trade */}
            {selectedIsExpiry && snap930 && !result && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 mb-4">
                {!snap1115 && (
                  <div className="bg-[#f0c040]/10 border border-[#f0c040]/20 rounded-lg px-4 py-2 text-xs font-mono text-[#f0c040] mb-4">
                    ⚠ Analysis CSV not uploaded yet — running <span className="font-black">Preliminary Analysis</span> using 9:30 AM data.
                    Upload the 11:15 AM CSV for final 5-force confirmation.
                  </div>
                )}
                {error && (
                  <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-lg px-4 py-2 text-xs font-mono text-[#ff4d6d] mb-4">{error}</div>
                )}
                <button onClick={runAnalysis} disabled={analyzing}
                  className={`w-full font-black py-3 rounded-xl text-sm transition-all disabled:opacity-40 ${
                    snap1115
                      ? 'bg-[#f0c040] text-black hover:bg-[#ffd060]'
                      : 'bg-[#f0c040]/70 text-black hover:bg-[#f0c040]/90'
                  }`}>
                  {analyzing
                    ? '⏳ Scanning All Strikes...'
                    : snap1115
                    ? '🚀 Run Full Z2H Analysis'
                    : '⚡ Run Preliminary Analysis (9:30 AM only)'}
                </button>
              </div>
            )}

            {/* RESULT */}
            {result && (() => {
              const isPrimBull = result.direction === 'BULLISH';
              const dirCol = isPrimBull ? '#39d98a' : '#ff4d6d';
              const candidates: Z2HStrikeCandidate[] = activeDir === 'PE'
                ? (result.peCandidates ?? [])
                : (result.ceCandidates ?? []);
              const filtered = activeTier === 0
                ? candidates
                : candidates.filter((c: Z2HStrikeCandidate) => c.tier === activeTier);

              const TIER_META = {
                1: { label: '🎰 T1 ₹2–50',   color: '#f0c040', bg: '#f0c04015', border: '#f0c04030', tag: 'Lottery' },
                2: { label: '⚡ T2 ₹50–150',  color: '#ff8c42', bg: '#ff8c4215', border: '#ff8c4230', tag: 'Power Play' },
                3: { label: '🎯 T3 ₹150–350', color: '#a855f7', bg: '#a855f715', border: '#a855f730', tag: 'Calculated' },
              } as const;

              const renderCard = (c: Z2HStrikeCandidate) => {
                const tm = TIER_META[c.tier];
                const col = activeDir === 'PE' ? '#ff4d6d' : '#39d98a';
                return (
                  <div key={c.strike} className="rounded-xl p-4 border"
                    style={{ background: activeDir === 'PE' ? '#1a0a0a' : '#0a1a0a', borderColor: `${col}33` }}>
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="text-base font-black" style={{ color: col }}>{c.strike} {c.optionType}</div>
                        <div className="text-[10px] font-mono text-[#e8e8f0] mt-0.5">₹{c.ltp} <span className="text-[#6b6b85]">entry</span></div>
                      </div>
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full"
                        style={{ background: tm.bg, color: tm.color, border: `1px solid ${tm.border}` }}>
                        {tm.tag}
                      </span>
                    </div>

                    {/* Signal grid */}
                    <div className="grid grid-cols-2 gap-1.5 mb-3">
                      <div className="bg-black/30 rounded-lg p-2">
                        <div className="text-[9px] font-mono text-[#6b6b85]">Gamma Score</div>
                        <div className="text-[11px] font-bold text-[#e8e8f0]">{c.gammaScore}</div>
                      </div>
                      <div className="bg-black/30 rounded-lg p-2">
                        <div className="text-[9px] font-mono text-[#6b6b85]">Vol / OI</div>
                        <div className={`text-[11px] font-bold ${c.volOiRatio > 0.2 ? 'text-[#39d98a]' : 'text-[#6b6b85]'}`}>
                          {c.vol > 0 ? c.volOiRatio.toFixed(2) : '—'}
                        </div>
                      </div>
                      <div className="bg-black/30 rounded-lg p-2">
                        <div className="text-[9px] font-mono text-[#6b6b85]">OI Change</div>
                        <div className={`text-[11px] font-bold ${c.oiChangePct > 0 ? 'text-[#39d98a]' : c.oiChangePct < 0 ? 'text-[#ff4d6d]' : 'text-[#6b6b85]'}`}>
                          {c.oi930 > 0 ? `${c.oiChangePct > 0 ? '+' : ''}${c.oiChangePct}%` : '—'}
                        </div>
                      </div>
                      <div className="bg-black/30 rounded-lg p-2">
                        <div className="text-[9px] font-mono text-[#6b6b85]">Signals</div>
                        <div className="flex gap-1.5 mt-0.5">
                          <span className={`text-[9px] font-mono font-bold ${c.pcbBroken ? 'text-[#39d98a]' : 'text-[#3a3a4a]'}`}>PCB</span>
                          <span className={`text-[9px] font-mono font-bold ${c.maxPainAligned ? 'text-[#39d98a]' : 'text-[#3a3a4a]'}`}>MP</span>
                        </div>
                      </div>
                    </div>

                    {/* Targets */}
                    <div className="grid grid-cols-4 gap-1 mb-2">
                      {[
                        { label: 'SL',   val: c.sl,      col: '#ff4d6d' },
                        { label: '3×',   val: c.target1, col: '#f0c040' },
                        { label: '5×',   val: c.target2, col: '#39d98a' },
                        { label: '10×',  val: c.hero,    col: '#4d9fff' },
                      ].map(r => (
                        <div key={r.label} className="bg-black/30 rounded p-1.5 text-center">
                          <div className="text-[8px] font-mono text-[#6b6b85]">{r.label}</div>
                          <div className="text-[10px] font-black" style={{ color: r.col }}>₹{r.val}</div>
                        </div>
                      ))}
                    </div>

                    {/* Required spot level */}
                    <div className="text-[9px] font-mono text-[#6b6b85] text-center">
                      Needs {index} {c.optionType === 'PE' ? '↓' : '↑'} {c.requiredSpotLevel.toLocaleString('en-IN')} for 10×
                    </div>
                  </div>
                );
              };

              return (
                <div>
                  {/* Preliminary warning */}
                  {result.isPreliminary && (
                    <div className="bg-[#f0c040]/10 border border-[#f0c040]/30 rounded-xl px-4 py-3 text-xs font-mono text-[#f0c040] mb-4">
                      ⚠ <span className="font-black">PRELIMINARY</span> — using 9:30 AM snapshot only. Upload the 11:15 AM CSV and re-run for final 5-force confirmation and refined candidate scores.
                    </div>
                  )}

                  {/* Low-force warning */}
                  {result.signal === 'NO_TRADE' && (
                    <div className="bg-[#ff8c42]/10 border border-[#ff8c42]/30 rounded-xl px-4 py-3 text-xs font-mono text-[#ff8c42] mb-4">
                      ⚠️ Only {result.forces?.count ?? 0}/5 forces aligned — below threshold for high-conviction trade. Review candidates carefully.
                    </div>
                  )}

                  {/* Signal header */}
                  <div className="text-center mb-5">
                    <div className="text-[10px] font-mono tracking-[3px] mb-1 text-[#6b6b85]">🚀 ZERO TO HERO — {index} · {expiry}</div>
                    <div className="mt-2 inline-flex items-center gap-3 px-4 py-2 rounded-full text-xs font-bold"
                      style={{ background: `${dirCol}1a`, color: dirCol, border: `1px solid ${dirCol}4d` }}>
                      {isPrimBull ? '📈 BULLISH' : '📉 BEARISH'} BIAS · {result.forces?.count ?? 0}/5 Forces
                    </div>
                    <div className="flex flex-wrap justify-center gap-1 mt-2">
                      {[
                        { label: 'Direction', ok: result.forces?.direction },
                        { label: 'OI', ok: result.forces?.oi },
                        { label: 'PCB', ok: result.forces?.pcb },
                        { label: 'MaxPain', ok: result.forces?.maxPain },
                        { label: 'VIX', ok: result.forces?.vix },
                      ].map(f => (
                        <span key={f.label} className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                          style={{ background: f.ok ? '#39d98a22' : '#ff4d6d11', color: f.ok ? '#39d98a' : '#6b6b85' }}>
                          {f.ok ? '✓' : '✗'} {f.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Direction toggle */}
                  <div className="flex gap-2 mb-3">
                    {(['PE', 'CE'] as const).map(dir => {
                      const isPrim = (dir === 'PE' && result.direction === 'BEARISH') || (dir === 'CE' && result.direction === 'BULLISH');
                      const col = dir === 'PE' ? '#ff4d6d' : '#39d98a';
                      const count = dir === 'PE' ? (result.peCandidates?.length ?? 0) : (result.ceCandidates?.length ?? 0);
                      return (
                        <button key={dir} onClick={() => setActiveDir(dir)}
                          className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all border ${
                            activeDir === dir ? 'text-black' : 'bg-[#111118] text-[#6b6b85]'
                          }`}
                          style={activeDir === dir
                            ? { background: col, borderColor: col }
                            : { borderColor: '#1e1e2e' }}>
                          {dir === 'PE' ? '📉 PE Candidates' : '📈 CE Candidates'}
                          <span className="ml-1.5 text-[9px] opacity-70">{count} found</span>
                          {isPrim && <span className="ml-1.5 text-[9px]">★ PRIMARY</span>}
                        </button>
                      );
                    })}
                  </div>

                  {/* Tier filter */}
                  <div className="flex gap-1.5 mb-4 flex-wrap">
                    {([
                      { tier: 0, label: 'All' },
                      { tier: 1, label: '🎰 ₹2–50' },
                      { tier: 2, label: '⚡ ₹50–150' },
                      { tier: 3, label: '🎯 ₹150–350' },
                    ] as const).map(({ tier, label }) => {
                      const tCol = tier === 0 ? '#6b6b85' : tier === 1 ? '#f0c040' : tier === 2 ? '#ff8c42' : '#a855f7';
                      const isActive = activeTier === tier;
                      return (
                        <button key={tier} onClick={() => setActiveTier(tier as 0|1|2|3)}
                          className="px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border"
                          style={isActive
                            ? { background: `${tCol}22`, color: tCol, borderColor: `${tCol}55` }
                            : { background: '#111118', color: '#6b6b85', borderColor: '#1e1e2e' }}>
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Tier sections or flat grid */}
                  {activeTier === 0 ? (
                    // Show tier headers when viewing all
                    ([1, 2, 3] as const).map(tier => {
                      const tm = TIER_META[tier];
                      const tierCands = candidates.filter((c: Z2HStrikeCandidate) => c.tier === tier);
                      if (tierCands.length === 0) return null;
                      return (
                        <div key={tier} className="mb-5">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: tm.color }}>{tm.label}</div>
                            <div className="flex-1 h-px" style={{ background: `${tm.color}30` }} />
                            <div className="text-[9px] font-mono text-[#6b6b85]">{tierCands.length} candidates</div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {tierCands.map(renderCard)}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    // Flat grid when tier is filtered
                    filtered.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
                        {filtered.map(renderCard)}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-xs font-mono text-[#6b6b85]">
                        No {activeDir} candidates in this tier. Try a different tier or direction.
                      </div>
                    )
                  )}

                  {candidates.length === 0 && (
                    <div className="text-center py-8 text-xs font-mono text-[#6b6b85]">
                      No OTM candidates found. Market data may be incomplete.
                    </div>
                  )}

                  {/* Skip conditions */}
                  {result.skipConditions?.length > 0 && (
                    <div className="bg-black/20 border border-[#ff4d6d]/20 rounded-xl p-4 mb-4">
                      <div className="text-xs font-mono text-[#ff4d6d] font-bold mb-2 uppercase tracking-widest">⚠️ Exit If Any of These Hit</div>
                      {result.skipConditions.map((c: string, i: number) => (
                        <div key={i} className="text-xs font-mono text-[#6b6b85] mb-1">→ {c}</div>
                      ))}
                    </div>
                  )}

                  {isAdmin && (
                    <div className="bg-black/20 border border-[#1e1e2e] rounded-xl p-4 mb-4">
                      <div className="text-xs font-mono text-[#f0c040] font-bold mb-2 uppercase tracking-widest">📊 Market Context</div>
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

                  <div className="text-center text-xs font-mono text-[#6b6b85]">
                    ⭐ Entry only between 1:15 PM – 2:00 PM · Not Financial Advice · God Particle ⚛
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}

