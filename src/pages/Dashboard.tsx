import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { signOut } from '../lib/auth';
import { getStale, setCached } from '../lib/cache';
import {
  getAvailableExpiries, generateIndexForecast,
  formatExpiryDisplay, getDTE, type IndexForecast, useCredits,
} from '../lib/market';

export default function Dashboard() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [z2hSignal, setZ2hSignal] = useState<any>(null);
  const [queryCategory, setQueryCategory] = useState('');
  const [queryText, setQueryText] = useState('');
  const [querySubmitting, setQuerySubmitting] = useState(false);
  const [queryMsg, setQueryMsg] = useState('');
  const [myQueries, setMyQueries] = useState<any[]>([]);
  const [showQueries, setShowQueries] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const role = profile?.role ?? 'free';
  const isAdmin = role === 'admin';

  const INDEX_KEYS = new Set(['NIFTY50', 'SENSEX', 'BANKNIFTY', 'FINNIFTY', 'MIDCAPNIFTY', 'NIFTYNEXT50', 'BANKEX']);

  // ── FORECAST STATE ──
  const FORECAST_INDICES = [
    { key: 'NIFTY50', label: 'Nifty 50' },
    { key: 'SENSEX', label: 'Sensex' },
    { key: 'BANKNIFTY', label: 'Bank Nifty' },
    { key: 'FINNIFTY', label: 'Fin Nifty' },
    { key: 'MIDCAPNIFTY', label: 'Midcap Nifty' },
    { key: 'BANKEX', label: 'Bankex' },
  ];
  const [fcastIndex, setFcastIndex] = useState('NIFTY50');
  const [fcastExpiry, setFcastExpiry] = useState('');
  const [fcastExpiries, setFcastExpiries] = useState<string[]>([]);
  const [fcastOpen, setFcastOpen] = useState('');
  const [fcastLoading, setFcastLoading] = useState(false);
  const [fcastForecast, setFcastForecast] = useState<IndexForecast | null>(null);
  const [fcastSpotClose, setFcastSpotClose] = useState(0);
  const [fcastChainData, setFcastChainData] = useState<Record<string, any>>({});
  const [fcastVix, setFcastVix] = useState(0);
  const [fcastError, setFcastError] = useState('');
  const [fcastFiiDate, setFcastFiiDate] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDone, setRefreshDone] = useState(false);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshDone(false);
    // Clear localStorage so stale paint doesn't fire on next hard reload
    const uid = user?.id;
    if (uid) localStorage.removeItem(`dashboard_v1_${uid}`);
    // Clear current data so user sees loading state, not stale data
    setAnalyses([]);
    setAnnouncement('');
    setMyQueries([]);
    await loadDashboard();
    setRefreshing(false);
    setRefreshDone(true);
    setTimeout(() => setRefreshDone(false), 2500);
  }

  function handleRevisit(a: any) {
    const isIndex = INDEX_KEYS.has(a.index_name);
    if (isIndex) {
      navigate('/analysis', { state: { replay: a } });
    } else {
      navigate('/stock-analysis', { state: { replay: a } });
    }
  }

  const today = new Date();
  const dayOfWeek = today.getDay();
  const isTuesday = dayOfWeek === 2;
  const isThursday = dayOfWeek === 4;
  const isExpiryDay = isTuesday || isThursday;
  const expiryIndex = isTuesday ? 'NIFTY 50' : 'SENSEX';

  // Paint stale cached data IMMEDIATELY on mount — before auth session even confirms.
  // This eliminates the blank screen when reopening the browser after auth token refresh.
  useEffect(() => {
    const lastUid = localStorage.getItem('gp_last_uid');
    if (!lastUid) return;
    const stale = getStale<{ analyses: any[]; announcement: string; queries: any[] }>(`dashboard_v1_${lastUid}`);
    if (stale) {
      setAnalyses(stale.analyses);
      setAnnouncement(stale.announcement);
      setMyQueries(stale.queries);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshProfile();
    loadDashboard();
  }, [user]);

  async function loadDashboard() {
    const uid = user?.id;
    if (!uid) return;
    const cacheKey = `dashboard_v1_${uid}`;

    // Remember this user so the mount effect can paint stale data on next visit
    localStorage.setItem('gp_last_uid', uid);

    // Fetch all 4 queries in parallel — no sequential waterfall
    const [analysesRes, z2hRes, announcementRes, queriesRes] = await Promise.all([
      supabase.from('analyses').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(5),
      supabase.from('z2h_signals').select('*').order('created_at', { ascending: false }).limit(1),
      supabase.from('admin_settings').select('value').eq('key', 'announcement').single(),
      supabase.from('customer_queries').select('id,category,status,created_at,query_text').eq('user_id', uid).order('created_at', { ascending: false }),
    ]);

    const analyses  = analysesRes.data || [];
    const announcement = announcementRes.data?.value || '';
    const queries   = queriesRes.data || [];

    setAnalyses(analyses);
    if (z2hRes.data?.[0]) setZ2hSignal(z2hRes.data[0]);
    setAnnouncement(announcement);
    setMyQueries(queries);

    // Persist fresh data for next visit
    setCached(cacheKey, { analyses, announcement, queries });
  }

  async function handleSignOut() {
    localStorage.removeItem('gp_last_uid');
    await signOut();
    navigate('/');
  }

  async function handleQuerySubmit() {
    if (!queryCategory) { setQueryMsg('Please select a category!'); return; }
    if (!queryText.trim()) { setQueryMsg('Please enter your query!'); return; }
    setQuerySubmitting(true);
    setQueryMsg('');
    try {
      await supabase.from('customer_queries').insert({
        user_id: user?.id,
        username: profile?.username,
        plan: role,
        category: queryCategory,
        query_text: queryText.trim(),
        status: 'Pending'
      });
      setQueryMsg('✅ Query submitted! We will respond within 24 hours.');
      setQueryText('');
      setQueryCategory('');
      loadDashboard();
    } catch (err: any) {
      setQueryMsg(`Error: ${err.message}`);
    } finally {
      setQuerySubmitting(false);
    }
  }

  // Load nearest expiry automatically when index changes
  useEffect(() => {
    setFcastExpiry('');
    setFcastForecast(null);
    getAvailableExpiries(fcastIndex).then(expiries => {
      if (!expiries.length) return;
      // Pick nearest future expiry by date string comparison (getDTE clamps to 0 so can't be used for filtering)
      const today = new Date().toISOString().split('T')[0];
      const nearest = expiries
        .filter(e => e >= today)
        .sort((a, b) => a.localeCompare(b))[0]
        ?? expiries[expiries.length - 1];
      setFcastExpiry(nearest);
    }).catch(() => {});
  }, [fcastIndex]);

  async function handleGenerateForecast() {
    const open = parseFloat(fcastOpen);
    if (!open || open <= 0) return;
    const isPaidUser = ['admin', 'pro'].includes(role);
    if (!isPaidUser && (profile?.credits ?? 0) < 2) {
      setFcastError('Not enough credits! You need 2 credits to generate a forecast. Buy more credits or upgrade your plan.');
      return;
    }
    setFcastLoading(true);
    setFcastError('');
    setFcastForecast(null);
    try {
      const expiries = await getAvailableExpiries(fcastIndex);
      if (!expiries.length) { setFcastError('No option chain data uploaded for this index yet.'); return; }
      if (!isPaidUser) {
        await useCredits(user!.id, 2);
        await refreshProfile();
      }
      const { forecast, fiiDate, usedExpiry, spotClose } = await generateIndexForecast(fcastIndex, open);
      setFcastExpiry(usedExpiry);
      setFcastSpotClose(spotClose);
      setFcastFiiDate(fiiDate);
      setFcastForecast(forecast);
    } catch (e: any) {
      setFcastError(e.message ?? 'Failed to load data');
    } finally {
      setFcastLoading(false);
    }
  }

  const getNextExpiry = () => {
    const now = new Date();
    const day = now.getDay();
    let daysUntil = 0;
    let expiryName = '';
    if (day < 2) { daysUntil = 2 - day; expiryName = 'Nifty 50 (Tuesday)'; }
    else if (day === 2) { daysUntil = 0; expiryName = 'Nifty 50 (Today!)'; }
    else if (day < 4) { daysUntil = 4 - day; expiryName = 'Sensex (Thursday)'; }
    else if (day === 4) { daysUntil = 0; expiryName = 'Sensex (Today!)'; }
    else { daysUntil = 9 - day; expiryName = 'Nifty 50 (Tuesday)'; }
    return { daysUntil, expiryName };
  };

  const nextExpiry = getNextExpiry();

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#1e1e2e]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#f0c040] rounded-xl flex items-center justify-center text-lg">⚛</div>
          <div className="font-bold text-base">God Particle</div>
          {isAdmin && (
            <span className="text-[10px] font-black bg-[#f0c040] text-black px-2 py-0.5 rounded-full">ADMIN</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link to="/admin" className="bg-[#f0c040] text-black text-xs font-black px-4 py-2 rounded-lg hover:bg-[#ffd060] transition-all">
              Admin Panel
            </Link>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Fetch fresh data from server"
            className={`flex items-center gap-1.5 text-xs font-black rounded-lg px-3 py-2 transition-all active:scale-95 disabled:opacity-70 ${refreshDone ? 'bg-[#39d98a] text-black' : 'bg-[#f0c040] hover:bg-[#ffd060] text-[#0a0a0f]'}`}
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
              className={refreshing ? 'animate-spin' : ''}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {refreshDone ? '✓ Updated' : refreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
          <button onClick={handleSignOut} className="text-xs font-mono text-[#6b6b85] hover:text-[#ff4d6d] transition-all">
            Sign Out
          </button>
        </div>
      </nav>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Announcement */}
        {announcement && (
          <div className="bg-[#f0c040]/10 border border-[#f0c040]/30 rounded-xl px-4 py-3 text-xs font-mono text-[#f0c040]">
            📢 {announcement}
          </div>
        )}

        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-black mb-1">
            Welcome back, <span className="text-[#f0c040]">{profile?.username}</span> 👋
          </h1>
          <p className="text-xs font-mono text-[#6b6b85]">Ready to find the God Particle today?</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Credits', value: ['admin','pro'].includes(role) ? '∞' : profile?.credits ?? 0, color: '#f0c040' },

            { label: 'Plan', value: role.toUpperCase(), color: '#f0c040' },
            { label: 'Analyses Done', value: analyses.length, color: '#4d9fff' },
            { label: 'Cost Per Analysis', value: '2 credits', color: '#39d98a' }
          ].map((stat, i) => (
            <div key={i} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
              <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-1">{stat.label}</div>
              <div className="text-xl font-black" style={{ color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Low credits warning */}
        {!['admin','pro'].includes(role) && (profile?.credits ?? 0) < 20 && (
          <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-xl px-4 py-3 flex items-center justify-between">
            <div className="text-xs font-mono text-[#ff4d6d]">
              ⚠️ Low credits! You have {profile?.credits} credits left ({Math.floor((profile?.credits ?? 0) / 2)} analyses remaining)
            </div>
            <Link to="/pricing" className="bg-[#f0c040] text-black text-xs font-black px-3 py-1.5 rounded-lg">
              Buy Credits
            </Link>
          </div>
        )}

        {/* FOMO banner — free users on expiry day */}
        {isExpiryDay && role === 'free' && (
          <div className="bg-gradient-to-r from-[#39d98a]/10 to-[#f0c040]/10 border border-[#39d98a]/30 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="text-sm font-black text-[#39d98a] mb-1 flex items-center gap-2">
                <span className="w-2 h-2 bg-[#39d98a] rounded-full animate-pulse inline-block" />
                ⏰ TODAY IS {expiryIndex.toUpperCase()} EXPIRY DAY!
              </div>
              <div className="text-xs font-mono text-[#6b6b85]">
                Zero to Hero signal is LIVE right now. Thousands of traders are using it. Don't miss it.
              </div>
            </div>
            <Link to="/pricing"
              className="shrink-0 bg-[#39d98a] text-black font-black text-xs px-5 py-2.5 rounded-xl hover:opacity-90 transition-all whitespace-nowrap">
              Upgrade for ₹99 →
            </Link>
          </div>
        )}

        {/* ZERO TO HERO */}
        <div className={`rounded-2xl p-6 border ${isExpiryDay ? 'border-[#39d98a]/30 bg-[#39d98a]/5' : 'border-[#1e1e2e] bg-[#111118]'}`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">🎯</span>
                <span className="font-black text-sm">Zero To Hero</span>
                {isExpiryDay && (
                  <span className="text-[10px] font-black bg-[#39d98a] text-black px-2 py-0.5 rounded-full animate-pulse">
                    LIVE TODAY
                  </span>
                )}
              </div>
              <div className="text-xs font-mono text-[#6b6b85]">
                {isExpiryDay
                  ? `${expiryIndex} expiry day — Signal analysis running`
                  : `Next expiry: ${nextExpiry.expiryName} — ${nextExpiry.daysUntil === 0 ? 'Today!' : `${nextExpiry.daysUntil} day(s) away`}`
                }
              </div>
            </div>
            {user ? (
              <Link to="/zero-to-hero"
                className="bg-[#39d98a] text-black text-xs font-black px-4 py-2 rounded-lg hover:opacity-90 transition-all">
                View Signal →
              </Link>
            ) : (
              <Link to="/pricing"
                className="border border-[#39d98a]/30 text-[#39d98a] text-xs font-bold px-4 py-2 rounded-lg hover:bg-[#39d98a]/10 transition-all">
                Upgrade ₹99 🔒
              </Link>
            )}
          </div>

          {/* Signal preview */}
          {isExpiryDay && z2hSignal && !!user && (
            <div className="bg-[#0a0a0f] rounded-xl p-4 border border-[#39d98a]/20">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-xs font-mono text-[#6b6b85] mb-1">Strike</div>
                  <div className="text-lg font-black text-[#39d98a]">{z2hSignal.selected_strike} {z2hSignal.option_type}</div>
                </div>
                <div>
                  <div className="text-xs font-mono text-[#6b6b85] mb-1">Direction</div>
                  <div className="text-lg font-black text-[#f0c040]">{z2hSignal.direction}</div>
                </div>
                <div>
                  <div className="text-xs font-mono text-[#6b6b85] mb-1">Forces</div>
                  <div className="text-lg font-black text-[#4d9fff]">{z2hSignal.forces_aligned}/5</div>
                </div>
              </div>
            </div>
          )}

          {/* Locked preview */}
          {isExpiryDay && !user && (
            <div className="bg-[#0a0a0f] rounded-xl p-4 border border-[#1e1e2e] relative overflow-hidden">
              <div className="absolute inset-0 backdrop-blur-sm bg-[#0a0a0f]/80 flex items-center justify-center z-10">
                <div className="text-center">
                  <div className="text-2xl mb-2">🔒</div>
                  <div className="text-xs font-bold text-[#39d98a]">Upgrade to Premium</div>
                  <div className="text-[10px] font-mono text-[#6b6b85]">to see today's signal</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center opacity-20">
                <div><div className="text-lg font-black">???? PE</div></div>
                <div><div className="text-lg font-black">BEARISH</div></div>
                <div><div className="text-lg font-black">5/5</div></div>
              </div>
            </div>
          )}
        </div>

        {/* QUICK ACTIONS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Link to="/analysis"
            className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 hover:border-[#f0c040] transition-all">
            <div className="text-2xl mb-2">⚛</div>
            <div className="font-black text-sm text-[#f0c040] mb-1">God Particle Analysis</div>
            <div className="text-xs font-mono text-[#6b6b85]">Analyse any option strike — 2 credits per analysis</div>
          </Link>

          <Link to="/stock-analysis"
            className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 hover:border-[#4d9fff] transition-all">
            <div className="text-2xl mb-2">📊</div>
            <div className="font-black text-sm text-[#4d9fff] mb-1">Stock Intelligence</div>
            <div className="text-xs font-mono text-[#6b6b85]">Gravitational crash levels for any large-cap stock</div>
          </Link>

          <Link to="/trending"
            className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 hover:border-[#ff8c42] transition-all">
            <div className="text-2xl mb-2">🔥</div>
            <div className="font-black text-sm text-[#ff8c42] mb-1">Trending Stocks</div>
            <div className="text-xs font-mono text-[#6b6b85]">Top movers in your budget · Near breakout · Pre-market</div>
          </Link>

          <Link to="/sector-rotation"
            className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 hover:border-[#3b82f6] transition-all">
            <div className="text-2xl mb-2">🔄</div>
            <div className="font-black text-sm text-[#3b82f6] mb-1">Sector Rotation</div>
            <div className="text-xs font-mono text-[#6b6b85]">RRG chart — which sectors are Leading, Improving, Lagging</div>
          </Link>

          <Link to="/pricing"
            className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 hover:border-[#39d98a] transition-all">
            <div className="text-2xl mb-2">💳</div>
            <div className="font-black text-sm text-[#39d98a] mb-1">Upgrade Plan</div>
            <div className="text-xs font-mono text-[#6b6b85]">Basic ₹99 / 28 days · Premium ₹299 / 28 days</div>
          </Link>
        </div>

        {/* ── INDEX INTRADAY FORECAST ── */}
        {(() => {
          // SVG chart constants (reused from Analysis.tsx forecast tab)
          const SVG_W = 700, SVG_H = 380;
          const PAD_L = 80, PAD_R = 20, PAD_T = 30, PAD_B = 40;
          const chartW = SVG_W - PAD_L - PAD_R;
          const chartH = SVG_H - PAD_T - PAD_B;
          const TOTAL_MIN = 375;
          const xOf = (min: number) => PAD_L + (min / TOTAL_MIN) * chartW;

          let svgContent: JSX.Element | null = null;
          if (fcastForecast) {
            const fc = fcastForecast;
            // Y-axis zoomed to forecast path only — prevents Gamma Walls / Prev Close squishing the line
            const pathPrices = [...fc.points.map(p => p.high), ...fc.points.map(p => p.low)];
            const pad = Math.max(fc.dailyRange * 0.15, 30);
            const priceMin = Math.min(...pathPrices) - pad;
            const priceMax = Math.max(...pathPrices) + pad;
            const priceRange = priceMax - priceMin || 1;
            const yOf = (p: number) => PAD_T + ((priceMax - p) / priceRange) * chartH;
            const pts = fc.points;
            const topPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.minuteOffset).toFixed(1)},${yOf(p.high).toFixed(1)}`).join(' ');
            const botPath = [...pts].reverse().map(p => `L${xOf(p.minuteOffset).toFixed(1)},${yOf(p.low).toFixed(1)}`).join(' ');
            const bandPath = `${topPath} ${botPath} Z`;
            const centralPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.minuteOffset).toFixed(1)},${yOf(p.central).toFixed(1)}`).join(' ');
            const biasCol = fc.bias === 'BEARISH' ? '#ff4d6d' : fc.bias === 'BULLISH' ? '#39d98a' : '#f0c040';

            svgContent = (
              <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full" style={{ maxHeight: 380 }}>
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
                {fc.levels.map(lv => {
                  const y = yOf(lv.price);
                  if (y < PAD_T || y > PAD_T + chartH) return null;
                  return (
                    <g key={lv.label}>
                      <line x1={PAD_L} y1={y} x2={SVG_W - PAD_R} y2={y} stroke={lv.color} strokeWidth="1.5" strokeDasharray={lv.type === 'open' ? '4,3' : '6,3'} opacity="0.8" />
                      <text x={SVG_W - PAD_R + 2} y={y + 4} fontSize="8" fill={lv.color} opacity="0.9">{lv.price.toLocaleString('en-IN')}</text>
                    </g>
                  );
                })}
                <path d={bandPath} fill={biasCol} fillOpacity="0.08" />
                <path d={centralPath} fill="none" stroke={biasCol} strokeWidth="2.5" strokeLinejoin="round" />
                {pts.map(p => {
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
                <line x1={PAD_L} y1={PAD_T + chartH} x2={SVG_W - PAD_R} y2={PAD_T + chartH} stroke="#1e1e2e" strokeWidth="1" />
              </svg>
            );
          }

          return (
            <div className="bg-[#111118] border border-[#a855f7]/30 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-1 h-5 bg-[#a855f7] rounded block" />
                <span className="text-sm font-black text-[#a855f7]">🔮 Intraday Index Forecast</span>
                <span className="text-[10px] font-mono text-[#6b6b85] ml-1">Max Pain + Gamma Wall</span>
              </div>

              {/* Controls — just index + open price */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-[10px] font-mono text-[#6b6b85] uppercase tracking-widest mb-1">Index</label>
                  <select
                    value={fcastIndex}
                    onChange={e => { setFcastIndex(e.target.value); setFcastForecast(null); setFcastOpen(''); }}
                    className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#a855f7]"
                  >
                    {FORECAST_INDICES.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-[#6b6b85] uppercase tracking-widest mb-1">Today's Open Price</label>
                  <input
                    type="number"
                    value={fcastOpen}
                    onChange={e => { setFcastOpen(e.target.value); setFcastForecast(null); }}
                    placeholder={fcastSpotClose > 0 ? `e.g. ${Math.round(fcastSpotClose)}` : 'e.g. 23500'}
                    className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#a855f7]"
                  />
                </div>
              </div>

              {!['admin', 'pro'].includes(role) && (profile?.credits ?? 0) < 2 && (
                <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-xl px-4 py-3 flex items-center justify-between gap-3 mb-4">
                  <div className="text-xs font-mono text-[#ff4d6d]">
                    ⚠️ Need 2 credits to generate forecast. You have {profile?.credits ?? 0}.
                  </div>
                  <Link to="/pricing" className="shrink-0 bg-[#f0c040] text-black text-xs font-black px-3 py-1.5 rounded-lg whitespace-nowrap">
                    Get Credits →
                  </Link>
                </div>
              )}

              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <button
                  onClick={handleGenerateForecast}
                  disabled={fcastLoading || !fcastOpen}
                  className="px-5 py-2 rounded-lg text-sm font-black bg-[#a855f7] text-white disabled:opacity-40 hover:bg-[#9333ea] transition-all"
                >
                  {fcastLoading ? '⏳ Loading...' : `🔮 Generate Forecast${!['admin','pro'].includes(role) ? ' — 2 Credits' : ''}`}
                </button>
                <Link
                  to="/backtest"
                  className="px-4 py-2 rounded-lg text-sm font-black border border-[#f0c040]/40 text-[#f0c040] hover:bg-[#f0c040]/10 transition-all flex items-center gap-1.5"
                >
                  ⏪ Back Test
                </Link>
                {fcastSpotClose > 0 && (
                  <span className="text-[10px] font-mono text-[#6b6b85]">
                    Prev close: <span className="text-[#f0c040]">{fcastSpotClose.toLocaleString('en-IN')}</span>
                    {fcastOpen && ` · Gap: ${parseFloat(fcastOpen) > fcastSpotClose ? '+' : ''}${Math.round(parseFloat(fcastOpen) - fcastSpotClose)} pts`}
                  </span>
                )}
                {fcastExpiry && (
                  <span className="text-[10px] font-mono text-[#6b6b85]">
                    Using nearest expiry: <span className="text-[#a855f7]">{formatExpiryDisplay(fcastExpiry)}</span>
                  </span>
                )}
              </div>

              {fcastError && (
                <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-xl px-4 py-3 text-xs font-mono text-[#ff4d6d] mb-4">
                  {fcastError}
                </div>
              )}

              {fcastForecast && (() => {
                const fc = fcastForecast;
                return (
                  <>
                    {/* Bias banner */}
                    <div className={`rounded-xl px-4 py-3 mb-4 text-xs font-mono font-bold ${
                      fc.bias === 'BEARISH' ? 'bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 text-[#ff4d6d]'
                      : fc.bias === 'BULLISH' ? 'bg-[#39d98a]/10 border border-[#39d98a]/30 text-[#39d98a]'
                      : 'bg-[#f0c040]/10 border border-[#f0c040]/30 text-[#f0c040]'
                    }`}>
                      <div className="text-sm mb-1">
                        {fc.bias === 'BEARISH' ? '📉 BEARISH BIAS' : fc.bias === 'BULLISH' ? '📈 BULLISH BIAS' : '↔️ NEUTRAL — Range Bound'}
                      </div>
                      <div className="font-normal opacity-80">{fc.summary}</div>
                      <div className="mt-1 text-[10px] opacity-70">
                        Conviction: <strong>{fc.convictionScore > 0 ? '+' : ''}{fc.convictionScore}</strong>
                        {fc.oiVelocitySignal !== 0 && <span> · OI Flow: <strong style={{ color: fc.oiVelocitySignal > 0 ? '#39d98a' : '#ff4d6d' }}>{fc.oiVelocitySignal > 0 ? '+' : ''}{fc.oiVelocitySignal} {fc.oiVelocitySignal > 5 ? '🟢 puts' : '🔴 calls'}</strong></span>}
                        {fc.fiiSignal !== 0 && <span> · FII{fcastFiiDate ? <span className="opacity-60"> ({fcastFiiDate.slice(5).replace('-', '/')})</span> : ''}: <strong style={{ color: fc.fiiSignal > 0 ? '#39d98a' : '#ff4d6d' }}>{fc.fiiSignal > 0 ? '+' : ''}{fc.fiiSignal} {fc.fiiSignal > 5 ? '🐂' : '🐻'}</strong></span>}
                        {fc.fiiSignal === 0 && <span className="opacity-60"> · FII: no data</span>}
                        {fc.gapSignal !== 0 && <span> · Gap: <strong style={{ color: fc.gapSignal > 0 ? '#39d98a' : '#ff4d6d' }}>{fc.gapSignal > 0 ? '+' : ''}{fc.gapSignal} {fc.gapPts > 0 ? '⬆' : '⬇'}{Math.abs(fc.gapPts)}pts</strong></span>}
                        {fc.sectorSignal !== 0 && <span> · Sector: <strong style={{ color: fc.sectorSignal > 0 ? '#39d98a' : '#ff4d6d' }}>{fc.sectorSignal > 0 ? '+' : ''}{fc.sectorSignal}</strong></span>}
                        {' '}· Max Pain gravity: <strong>{Math.round(fc.mpGravity * 100)}%</strong> · DTE: {fc.dte}d
                      </div>
                    </div>

                    {/* IV Crush warning */}
                    {fc.ivCrushWarning && (
                      <div className="bg-[#f0c040]/10 border border-[#f0c040]/30 rounded-xl px-4 py-3 mb-4 text-xs font-mono text-[#f0c040]">
                        {fc.ivCrushWarning}
                      </div>
                    )}

                    {/* SVG Chart */}
                    <div className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl p-3 mb-4 overflow-x-auto">
                      {svgContent}
                    </div>

                    {/* Legend */}
                    <div className="flex flex-wrap gap-3 mb-4 px-1">
                      {fc.levels.map(lv => (
                        <div key={lv.label} className="flex items-center gap-1.5 text-[10px] font-mono">
                          <div className="w-4 h-0.5" style={{ background: lv.color }} />
                          <span style={{ color: lv.color }}>{lv.label}</span>
                        </div>
                      ))}
                    </div>

                    {/* Checkpoint table */}
                    <div className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl overflow-hidden mb-4">
                      <table className="w-full text-xs font-mono">
                        <thead>
                          <tr className="border-b border-[#1e1e2e]">
                            {['Time', 'Predicted Level', 'Range', 'What to Watch'].map(h => (
                              <th key={h} className="text-left px-3 py-2.5 text-[#6b6b85] uppercase tracking-widest font-normal text-[10px]">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {fc.points.map((p, i) => (
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

                    {/* Key levels */}
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'CE Gamma Wall', val: fc.ceWall, sub: 'Resistance', color: '#ff4d6d' },
                        { label: 'Max Pain', val: fc.maxPain, sub: 'EOD gravity target', color: '#f0c040' },
                        { label: 'PE Gamma Wall', val: fc.peWall, sub: 'Support', color: '#39d98a' },
                      ].map(({ label, val, sub, color }) => (
                        <div key={label} className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl p-3 text-center">
                          <div className="text-[9px] font-mono text-[#6b6b85] uppercase mb-1">{label}</div>
                          <div className="text-lg font-black font-mono" style={{ color }}>{val.toLocaleString('en-IN')}</div>
                          <div className="text-[9px] font-mono text-[#6b6b85] mt-0.5">{sub}</div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 text-[10px] font-mono text-[#6b6b85]">
                      ⚠ Forecast based on Max Pain gravity + Gamma Wall theory. Not financial advice.
                    </div>
                  </>
                );
              })()}
            </div>
          );
        })()}

        {/* ADVANCED FEATURES */}
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-[#6b6b85] mb-3 flex items-center gap-2">
            <span className="w-1 h-4 bg-[#4d9fff] rounded block" />
            Advanced Intelligence
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Link to="/oi-heatmap"
              className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 hover:border-[#f0c040] transition-all">
              <div className="text-2xl mb-2">🌡</div>
              <div className="font-black text-sm text-[#f0c040] mb-1">OI Heatmap + Max Pain</div>
              <div className="text-xs font-mono text-[#6b6b85]">See where market makers are positioned — max pain strike for any expiry</div>
            </Link>

            <Link to="/gamma-trap"
              className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 hover:border-[#ff4d6d] transition-all">
              <div className="text-2xl mb-2">⚡</div>
              <div className="font-black text-sm text-[#ff4d6d] mb-1">Gamma Trap</div>
              <div className="text-xs font-mono text-[#6b6b85]">Expiry day gamma walls — find the pin zone and acceleration levels</div>
            </Link>

            <Link to="/multi-gct"
              className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 hover:border-[#ff8c42] transition-all">
              <div className="text-2xl mb-2">🔭</div>
              <div className="font-black text-sm text-[#ff8c42] mb-1">Multi-Timeframe GCT</div>
              <div className="text-xs font-mono text-[#6b6b85]">Monthly + Weekly + Daily GCT confluence zones — triple alignment signals</div>
            </Link>

            <Link to="/scanner"
              className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 hover:border-[#4d9fff] transition-all">
              <div className="text-2xl mb-2">🔍</div>
              <div className="font-black text-sm text-[#4d9fff] mb-1">Options Scanner</div>
              <div className="text-xs font-mono text-[#6b6b85]">Detect unusual OI buildup — spot institutional activity before the move</div>
            </Link>

            <Link to="/trade-journal"
              className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 hover:border-[#39d98a] transition-all">
              <div className="text-2xl mb-2">📓</div>
              <div className="font-black text-sm text-[#39d98a] mb-1">Trade Journal</div>
              <div className="text-xs font-mono text-[#6b6b85]">Log trades, track P&amp;L, win rate — get AI pattern feedback on your entries</div>
            </Link>

            <Link to="/alerts"
              className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 hover:border-[#ff8c42] transition-all">
              <div className="text-2xl mb-2">🔔</div>
              <div className="font-black text-sm text-[#ff8c42] mb-1">Price Alerts</div>
              <div className="text-xs font-mono text-[#6b6b85]">Set alerts on GCT levels — get notified when price hits your target zones</div>
            </Link>

            <Link to="/focus"
              className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 hover:border-[#f0c040] transition-all md:col-span-2">
              <div className="text-2xl mb-2">🎯</div>
              <div className="font-black text-sm text-[#f0c040] mb-1">Strike Focus — Today's Strikes</div>
              <div className="text-xs font-mono text-[#6b6b85]">One PE + one CE strike per index to focus on today — max pain walls, support & resistance levels, and exact trade plan</div>
            </Link>
          </div>
        </div>

        {/* RECENT ANALYSES */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
          <h2 className="text-sm font-black uppercase tracking-widest text-[#6b6b85] mb-4 flex items-center gap-2">
            <span className="w-1 h-4 bg-[#f0c040] rounded block" />
            Recent Analyses
          </h2>
          {analyses.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-3xl mb-3">🔬</div>
              <div className="text-sm font-mono text-[#6b6b85] mb-3">No analyses yet. Run your first God Particle analysis!</div>
              <Link to="/analysis" className="bg-[#f0c040] text-black text-xs font-black px-6 py-2.5 rounded-xl">
                Start Analysing →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {analyses.map((a, i) => (
                <button
                  key={i}
                  onClick={() => handleRevisit(a)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-[#16161f] rounded-xl hover:border hover:border-[#f0c040]/30 transition-all text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-black px-2 py-0.5 rounded ${
                      a.option_type === 'CE' ? 'bg-[#39d98a]/15 text-[#39d98a]'
                      : a.option_type === 'PE' ? 'bg-[#ff4d6d]/15 text-[#ff4d6d]'
                      : 'bg-[#f0c040]/15 text-[#f0c040]'
                    }`}>
                      {a.option_type === 'STOCK_GCT' ? 'GCT' : a.option_type}
                    </span>
                    <div>
                      <div className="text-xs font-bold">
                        {a.index_name}{a.strike > 0 ? ` ${a.strike}` : ''}
                      </div>
                      <div className="text-[10px] font-mono text-[#6b6b85]">
                        {INDEX_KEYS.has(a.index_name) ? 'Index Analysis' : 'Stock Analysis'}
                        {a.expiry ? ` · ${a.expiry}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-[10px] font-mono text-[#6b6b85]">
                      {new Date(a.created_at).toLocaleDateString('en-IN')}
                    </div>
                    <span className="text-[10px] text-[#f0c040] font-mono">→</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* QUERY SECTION */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
          <h2 className="text-sm font-black uppercase tracking-widest text-[#6b6b85] mb-4 flex items-center gap-2">
            <span className="w-1 h-4 bg-[#4d9fff] rounded block" />
            Ask a Question / Submit Feedback
          </h2>

          <div className="space-y-3 mb-4">
            <div>
              <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Category</label>
              <select value={queryCategory} onChange={e => setQueryCategory(e.target.value)}
                className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#4d9fff]">
                <option value="">Select category...</option>
                <option value="Technical Issue">🔧 Technical Issue</option>
                <option value="Analysis Query">🔬 Analysis Query</option>
                <option value="Suggestion">💡 Suggestion</option>
                <option value="Feedback">⭐ Feedback</option>
                <option value="Other">💬 Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Your Message</label>
              <textarea value={queryText} onChange={e => setQueryText(e.target.value)}
                placeholder="Type your question or feedback here..."
                rows={3}
                className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#4d9fff] resize-none" />
            </div>
          </div>

          {queryMsg && (
            <div className={`mb-3 text-xs font-mono px-4 py-2 rounded-lg ${queryMsg.startsWith('✅') ? 'bg-[#39d98a]/10 text-[#39d98a] border border-[#39d98a]/30' : 'bg-[#ff4d6d]/10 text-[#ff4d6d] border border-[#ff4d6d]/30'}`}>
              {queryMsg}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button onClick={handleQuerySubmit} disabled={querySubmitting}
              className="bg-[#4d9fff] text-black font-black text-xs px-6 py-2.5 rounded-xl hover:opacity-90 transition-all disabled:opacity-40">
              {querySubmitting ? '⏳ Submitting...' : '📤 Submit Query'}
            </button>
            {myQueries.length > 0 && (
              <button onClick={() => setShowQueries(!showQueries)}
                className="border border-[#1e1e2e] text-xs font-bold px-4 py-2.5 rounded-xl hover:border-[#4d9fff] transition-all text-[#6b6b85]">
                {showQueries ? 'Hide' : 'View'} My Queries ({myQueries.length})
              </button>
            )}
          </div>

          {showQueries && myQueries.length > 0 && (
            <div className="mt-4 space-y-2">
              {myQueries.map((q, i) => (
                <div key={i} className="bg-[#16161f] rounded-xl p-4 border border-[#1e1e2e]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black bg-[#4d9fff]/15 text-[#4d9fff] px-2 py-0.5 rounded">{q.category}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded ${q.status === 'Answered' ? 'bg-[#39d98a]/15 text-[#39d98a]' : 'bg-[#f0c040]/15 text-[#f0c040]'}`}>
                        {q.status}
                      </span>
                      <span className="text-[10px] font-mono text-[#6b6b85]">
                        {new Date(q.created_at).toLocaleDateString('en-IN')}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs font-mono text-[#e8e8f0] mb-2">{q.query_text}</div>
                  {q.answer_pdf_url && (
                    <a href={q.answer_pdf_url} target="_blank" rel="noreferrer"
                      className="text-xs font-bold text-[#39d98a] hover:underline">
                      📄 Download Answer PDF →
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
