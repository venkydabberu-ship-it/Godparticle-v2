import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { runDailyAutoFetch } from '../lib/autofetch';

export default function Admin() {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [users, setUsers] = useState<any[]>([]);
  const [queries, setQueries] = useState<any[]>([]);
  const [searchUser, setSearchUser] = useState('');
  const [grantUserId, setGrantUserId] = useState('');
  const [grantCredits, setGrantCredits] = useState('');
  const [grantMsg, setGrantMsg] = useState('');
  const [subscriberCount, setSubscriberCount] = useState('2600+');
  const [announcement, setAnnouncement] = useState('');
  const [settingsMsg, setSettingsMsg] = useState('');
  const [stats, setStats] = useState<any>({});
  const [queryFilter, setQueryFilter] = useState('All');
  const [uploadingAnswer, setUploadingAnswer] = useState<string | null>(null);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchResults, setFetchResults] = useState<any[]>([]);
  const [fetchDone, setFetchDone] = useState(false);

  useEffect(() => {
    if (profile?.role !== 'admin') return;
    loadAll();
  }, [profile]);

  async function loadAll() {
    const { data: usersData } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (usersData) setUsers(usersData);

    const { data: queriesData } = await supabase
      .from('customer_queries')
      .select('*')
      .order('created_at', { ascending: false });
    if (queriesData) setQueries(queriesData);

    const { data: settingsData } = await supabase
      .from('admin_settings')
      .select('*');
    if (settingsData) {
      settingsData.forEach(s => {
        if (s.key === 'subscriber_count') setSubscriberCount(s.value);
        if (s.key === 'announcement') setAnnouncement(s.value);
      });
    }

    const { data: analysesData } = await supabase
      .from('analyses')
      .select('id');
    setStats({
      totalUsers: usersData?.length ?? 0,
      freeUsers: usersData?.filter(u => u.role === 'free').length ?? 0,
      basicUsers: usersData?.filter(u => u.role === 'basic').length ?? 0,
      premiumUsers: usersData?.filter(u => u.role === 'premium').length ?? 0,
      proUsers: usersData?.filter(u => u.role === 'pro').length ?? 0,
      totalAnalyses: analysesData?.length ?? 0,
      pendingQueries: queriesData?.filter(q => q.status === 'Pending').length ?? 0,
    });
  }

  async function handleGrantCredits() {
    if (!grantUserId || !grantCredits) { setGrantMsg('Select user and enter credits!'); return; }
    const { error } = await supabase
      .from('profiles')
      .update({ credits: parseInt(grantCredits) })
      .eq('id', grantUserId);
    if (error) { setGrantMsg(`Error: ${error.message}`); return; }
    setGrantMsg(`✅ Credits updated!`);
    loadAll();
  }

  async function handleSaveSettings() {
    await supabase.from('admin_settings')
      .upsert({ key: 'subscriber_count', value: subscriberCount });
    await supabase.from('admin_settings')
      .upsert({ key: 'announcement', value: announcement });
    setSettingsMsg('✅ Settings saved!');
    setTimeout(() => setSettingsMsg(''), 3000);
  }

  async function handleDownloadQueries() {
    const filtered = queryFilter === 'All' ? queries : queries.filter(q => q.status === queryFilter);
    let content = 'GOD PARTICLE — CUSTOMER QUERIES REPORT\n';
    content += `Generated: ${new Date().toLocaleString('en-IN')}\n`;
    content += `Total Queries: ${filtered.length}\n`;
    content += '='.repeat(60) + '\n\n';
    filtered.forEach((q, i) => {
      content += `QUERY ${i + 1}\n`;
      content += `-`.repeat(40) + '\n';
      content += `Customer: ${q.username}\n`;
      content += `Plan: ${q.plan?.toUpperCase()}\n`;
      content += `Category: ${q.category}\n`;
      content += `Date: ${new Date(q.created_at).toLocaleString('en-IN')}\n`;
      content += `Status: ${q.status}\n`;
      content += `Query:\n${q.query_text}\n\n`;
    });
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `queries_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleUploadAnswer(queryId: string, file: File) {
    setUploadingAnswer(queryId);
    try {
      const fileName = `answers/${queryId}_${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('query-answers')
        .upload(fileName, file, { contentType: 'application/pdf' });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from('query-answers')
        .getPublicUrl(fileName);
      await supabase.from('customer_queries')
        .update({ status: 'Answered', answer_pdf_url: urlData.publicUrl })
        .eq('id', queryId);
      loadAll();
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploadingAnswer(null);
    }
  }

  async function handleAutoFetch() {
    if (!user) return;
    setFetchLoading(true);
    setFetchDone(false);
    setFetchResults([]);
    try {
      const res = await runDailyAutoFetch(user.id);
      setFetchResults(res);
      setFetchDone(true);
    } catch (err: any) {
      setFetchResults([{ status: 'error', error: err.message }]);
    } finally {
      setFetchLoading(false);
    }
  }

  if (profile?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-[#e8e8f0]">
        <div className="text-center">
          <div className="text-4xl mb-4">🚫</div>
          <div className="font-black text-xl mb-2">Access Denied</div>
          <Link to="/dashboard" className="text-[#f0c040] text-sm">← Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  const tabs = ['overview', 'users', 'queries', 'autofetch', 'settings'];
  const tabLabels = ['📊 Overview', '👥 Users', '💬 Queries', '🤖 Auto Fetch', '⚙️ Settings'];
  const filteredQueries = queryFilter === 'All' ? queries : queries.filter(q => q.status === queryFilter);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#1e1e2e]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#f0c040] rounded-xl flex items-center justify-center text-lg">⚛</div>
          <div>
            <div className="font-bold text-base">God Particle</div>
            <div className="text-[10px] font-mono text-[#f0c040]">ADMIN PANEL</div>
          </div>
        </div>
        <Link to="/dashboard" className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040]">← Dashboard</Link>
      </nav>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8">

        {/* Tabs */}
        <div className="flex gap-1 bg-[#111118] rounded-xl p-1 mb-6 overflow-x-auto">
          {tabs.map((t, i) => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${activeTab === t ? 'bg-[#16161f] text-[#e8e8f0] border border-[#1e1e2e]' : 'text-[#6b6b85]'}`}>
              {tabLabels[i]}
            </button>
          ))}
        </div>

        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div>
            <h2 className="text-base font-black mb-6 flex items-center gap-2">
              <span className="w-1 h-4 bg-[#f0c040] rounded block" />
              Platform Overview
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {[
                { label: 'Total Users', value: stats.totalUsers, color: '#f0c040' },
                { label: 'Free Users', value: stats.freeUsers, color: '#6b6b85' },
                { label: 'Basic Users', value: stats.basicUsers, color: '#f0c040' },
                { label: 'Premium Users', value: stats.premiumUsers, color: '#39d98a' },
                { label: 'Pro Users', value: stats.proUsers, color: '#4d9fff' },
                { label: 'Total Analyses', value: stats.totalAnalyses, color: '#ff4d6d' },
                { label: 'Pending Queries', value: stats.pendingQueries, color: '#f0c040' },
                { label: 'Revenue Est.', value: `₹${((stats.basicUsers ?? 0) * 100 + (stats.premiumUsers ?? 0) * 300 + (stats.proUsers ?? 0) * 2500).toLocaleString()}`, color: '#39d98a' },
              ].map((s, i) => (
                <div key={i} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
                  <div className="text-xs font-mono text-[#6b6b85] mb-1">{s.label}</div>
                  <div className="text-xl font-black" style={{ color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* USERS */}
        {activeTab === 'users' && (
          <div>
            <h2 className="text-base font-black mb-6 flex items-center gap-2">
              <span className="w-1 h-4 bg-[#f0c040] rounded block" />
              User Management
            </h2>
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 mb-6">
              <div className="text-sm font-black mb-4 text-[#f0c040]">⚡ Grant Credits to User</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <select value={grantUserId} onChange={e => setGrantUserId(e.target.value)}
                  className="bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none">
                  <option value="">Select user...</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.username} ({u.role})</option>
                  ))}
                </select>
                <input type="number" value={grantCredits} onChange={e => setGrantCredits(e.target.value)}
                  placeholder="Credits to grant"
                  className="bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none" />
                <button onClick={handleGrantCredits}
                  className="bg-[#f0c040] text-black font-black text-xs py-2.5 rounded-xl hover:bg-[#ffd060] transition-all">
                  ⚡ Grant Credits
                </button>
              </div>
              {grantMsg && <div className="mt-2 text-xs font-mono text-[#39d98a]">{grantMsg}</div>}
            </div>

            <input type="text" value={searchUser} onChange={e => setSearchUser(e.target.value)}
              placeholder="Search by username..."
              className="w-full bg-[#111118] border border-[#1e1e2e] rounded-xl px-4 py-3 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040] mb-4" />

            <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead><tr className="border-b border-[#1e1e2e]">
                  {['Username', 'Role', 'Credits', 'Status', 'Joined'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[#6b6b85] uppercase tracking-widest font-normal">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {users
                    .filter(u => !searchUser || u.username?.toLowerCase().includes(searchUser.toLowerCase()))
                    .map((u, i) => (
                      <tr key={i} className="border-b border-[#1e1e2e]/50 hover:bg-[#f0c040]/5">
                        <td className="px-4 py-3 font-bold">{u.username}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${u.role === 'admin' ? 'bg-[#ff4d6d]/15 text-[#ff4d6d]' : u.role === 'pro' ? 'bg-[#4d9fff]/15 text-[#4d9fff]' : u.role === 'premium' ? 'bg-[#39d98a]/15 text-[#39d98a]' : u.role === 'basic' ? 'bg-[#f0c040]/15 text-[#f0c040]' : 'bg-[#6b6b85]/15 text-[#6b6b85]'}`}>
                            {u.role?.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#f0c040] font-bold">{u.credits?.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${u.is_active ? 'bg-[#39d98a]/15 text-[#39d98a]' : 'bg-[#ff4d6d]/15 text-[#ff4d6d]'}`}>
                            {u.is_active ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#6b6b85]">
                          {new Date(u.created_at).toLocaleDateString('en-IN')}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* QUERIES */}
        {activeTab === 'queries' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-black flex items-center gap-2">
                <span className="w-1 h-4 bg-[#4d9fff] rounded block" />
                Customer Queries
                {stats.pendingQueries > 0 && (
                  <span className="text-[10px] font-black bg-[#ff4d6d] text-white px-2 py-0.5 rounded-full">
                    {stats.pendingQueries} pending
                  </span>
                )}
              </h2>
              <button onClick={handleDownloadQueries}
                className="bg-[#f0c040] text-black font-black text-xs px-4 py-2.5 rounded-xl hover:bg-[#ffd060] transition-all">
                📥 Download Queries
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              {['All', 'Pending', 'Answered'].map(f => (
                <button key={f} onClick={() => setQueryFilter(f)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${queryFilter === f ? 'bg-[#f0c040] text-black' : 'bg-[#111118] border border-[#1e1e2e] text-[#6b6b85]'}`}>
                  {f} ({f === 'All' ? queries.length : queries.filter(q => q.status === f).length})
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {filteredQueries.length === 0 ? (
                <div className="text-center py-8 text-xs font-mono text-[#6b6b85]">No queries found</div>
              ) : (
                filteredQueries.map((q, i) => (
                  <div key={i} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-[#e8e8f0]">{q.username}</span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded ${q.plan === 'pro' ? 'bg-[#4d9fff]/15 text-[#4d9fff]' : q.plan === 'premium' ? 'bg-[#39d98a]/15 text-[#39d98a]' : 'bg-[#f0c040]/15 text-[#f0c040]'}`}>
                          {q.plan?.toUpperCase()}
                        </span>
                        <span className="text-[10px] font-black bg-[#4d9fff]/15 text-[#4d9fff] px-2 py-0.5 rounded">{q.category}</span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded ${q.status === 'Answered' ? 'bg-[#39d98a]/15 text-[#39d98a]' : 'bg-[#f0c040]/15 text-[#f0c040]'}`}>
                          {q.status}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-[#6b6b85] shrink-0">
                        {new Date(q.created_at).toLocaleDateString('en-IN')}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-[#e8e8f0] mb-4 leading-relaxed bg-[#16161f] rounded-lg p-3">
                      {q.query_text}
                    </div>
                    <div className="flex items-center gap-3">
                      <label className={`cursor-pointer bg-[#39d98a] text-black font-black text-xs px-4 py-2 rounded-lg hover:opacity-90 transition-all ${uploadingAnswer === q.id ? 'opacity-50' : ''}`}>
                        <input type="file" accept=".pdf" className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) await handleUploadAnswer(q.id, file);
                          }}
                          disabled={uploadingAnswer === q.id} />
                        {uploadingAnswer === q.id ? '⏳ Uploading...' : '📤 Upload Answer PDF'}
                      </label>
                      {q.answer_pdf_url && (
                        <a href={q.answer_pdf_url} target="_blank" rel="noreferrer"
                          className="text-xs font-bold text-[#4d9fff] hover:underline">
                          📄 View Answer →
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* AUTO FETCH */}
        {activeTab === 'autofetch' && (
          <div>
            <h2 className="text-base font-black mb-2 flex items-center gap-2">
              <span className="w-1 h-4 bg-[#39d98a] rounded block" />
              🤖 Auto Fetch Market Data
            </h2>
            <p className="text-xs font-mono text-[#6b6b85] mb-6">
              Automatically fetches Nifty 50 + Sensex option chain data for next 4 expiries from NSE/BSE API.
              Run this daily after 3:30 PM market close.
            </p>

            {/* What gets fetched */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
                <div className="text-sm font-black text-[#f0c040] mb-3">📈 Nifty 50 (NSE)</div>
                <div className="space-y-2 text-xs font-mono text-[#6b6b85]">
                  <div>✅ Next 4 weekly expiries (Tuesday)</div>
                  <div>✅ All strikes — CE + PE data</div>
                  <div>✅ LTP, OI, Volume, Change OI</div>
                  <div>✅ Spot price + India VIX</div>
                  <div>✅ Max Pain calculation</div>
                  <div>✅ Auto Z2H snapshot on expiry day</div>
                </div>
              </div>
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
                <div className="text-sm font-black text-[#4d9fff] mb-3">📊 Sensex (BSE)</div>
                <div className="space-y-2 text-xs font-mono text-[#6b6b85]">
                  <div>✅ Next 4 weekly expiries (Thursday)</div>
                  <div>✅ All strikes — CE + PE data</div>
                  <div>✅ LTP, OI, Volume, Change OI</div>
                  <div>✅ Spot price</div>
                  <div>✅ Max Pain calculation</div>
                  <div>✅ Auto Z2H snapshot on expiry day</div>
                </div>
              </div>
            </div>

            {/* Schedule info */}
            <div className="bg-[#f0c040]/5 border border-[#f0c040]/20 rounded-xl p-4 mb-6">
              <div className="text-xs font-mono text-[#f0c040] font-bold mb-2">⏰ Recommended Schedule</div>
              <div className="text-xs font-mono text-[#6b6b85] space-y-1">
                <div>• Run daily after market close: 3:30 PM IST</div>
                <div>• On expiry days (Tue/Thu): also captures Z2H snapshots automatically</div>
                <div>• Duplicate data is automatically skipped</div>
              </div>
            </div>

            {/* Fetch button */}
            <button onClick={handleAutoFetch} disabled={fetchLoading}
              className="w-full bg-[#39d98a] text-black font-black text-sm py-4 rounded-xl hover:opacity-90 transition-all disabled:opacity-40 mb-4">
              {fetchLoading ? '⏳ Fetching data from NSE/BSE APIs...' : '🤖 Run Auto Fetch Now'}
            </button>

            {/* Results */}
            {fetchDone && fetchResults.length > 0 && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
                <div className="text-xs font-mono text-[#39d98a] font-bold mb-3">
                  ✅ Fetch complete! {fetchResults.filter(r => r.status === 'saved').length} new records saved.
                  {fetchResults.filter(r => r.status === 'duplicate').length > 0 &&
                    ` ${fetchResults.filter(r => r.status === 'duplicate').length} duplicates skipped.`
                  }
                </div>
                <div className="space-y-2">
                  {fetchResults.map((r, i) => (
                    <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono ${
                      r.status === 'saved' ? 'bg-[#39d98a]/10 text-[#39d98a]' :
                      r.status === 'duplicate' ? 'bg-[#f0c040]/10 text-[#f0c040]' :
                      'bg-[#ff4d6d]/10 text-[#ff4d6d]'
                    }`}>
                      <span>{r.index} | {r.expiry}</span>
                      <span>
                        {r.status === 'saved' ? `✅ Saved (${r.strikes} strikes)` :
 r.status === 'duplicate' ? '⚠️ Already exists' :
 r.status === 'empty' ? '⏸ Market closed' :
 r.status === 'fetched' ? '✅ Fetched' : `❌ ${r.error || 'Error'}`}

                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SETTINGS */}
        {activeTab === 'settings' && (
          <div>
            <h2 className="text-base font-black mb-6 flex items-center gap-2">
              <span className="w-1 h-4 bg-[#f0c040] rounded block" />
              Platform Settings
            </h2>
            <div className="space-y-4">
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
                <div className="text-sm font-black mb-4 text-[#f0c040]">🌐 Landing Page Settings</div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                      Subscriber Count (shown on landing page)
                    </label>
                    <input type="text" value={subscriberCount}
                      onChange={e => setSubscriberCount(e.target.value)}
                      placeholder="e.g. 2600+"
                      className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]" />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                      Announcement Banner
                    </label>
                    <input type="text" value={announcement}
                      onChange={e => setAnnouncement(e.target.value)}
                      placeholder="Leave empty to hide banner..."
                      className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]" />
                  </div>
                </div>
                {settingsMsg && <div className="mt-3 text-xs font-mono text-[#39d98a]">{settingsMsg}</div>}
                <button onClick={handleSaveSettings}
                  className="mt-4 bg-[#f0c040] text-black font-black text-xs px-6 py-2.5 rounded-xl hover:bg-[#ffd060] transition-all">
                  💾 Save Settings
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
