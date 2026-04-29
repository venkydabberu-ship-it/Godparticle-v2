import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { signOut } from '../lib/auth';

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

  useEffect(() => {
    if (!user) return;
    refreshProfile();
    loadDashboard();
  }, [user]);

  async function loadDashboard() {
    const { data: analysesData } = await supabase
      .from('analyses')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false })
      .limit(5);
    if (analysesData) setAnalyses(analysesData);

    const { data: z2hData } = await supabase
      .from('z2h_signals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);
    if (z2hData?.[0]) setZ2hSignal(z2hData[0]);

    const { data: announcementData } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'announcement')
      .single();
    if (announcementData?.value) setAnnouncement(announcementData.value);

    const { data: queriesData } = await supabase
      .from('customer_queries')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });
    if (queriesData) setMyQueries(queriesData);
  }

  async function handleSignOut() {
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

          <Link to="/pricing"
            className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 hover:border-[#39d98a] transition-all">
            <div className="text-2xl mb-2">💳</div>
            <div className="font-black text-sm text-[#39d98a] mb-1">Upgrade Plan</div>
            <div className="text-xs font-mono text-[#6b6b85]">Basic ₹99 / 28 days · Premium ₹299 / 28 days</div>
          </Link>
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
