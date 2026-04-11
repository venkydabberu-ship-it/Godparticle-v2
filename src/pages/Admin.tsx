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
  const [changeRoleUserId, setChangeRoleUserId] = useState('');
  const [changeRole, setChangeRole] = useState('');
  const [roleMsg, setRoleMsg] = useState('');
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
      .from('profiles').select('*').order('created_at', { ascending: false });
    if (usersData) setUsers(usersData);

    const { data: queriesData } = await supabase
      .from('customer_queries').select('*').order('created_at', { ascending: false });
    if (queriesData) setQueries(queriesData);

    const { data: settingsData } = await supabase.from('admin_settings').select('*');
    if (settingsData) {
      settingsData.forEach(s => {
        if (s.key === 'subscriber_count') setSubscriberCount(s.value);
        if (s.key === 'announcement') setAnnouncement(s.value);
      });
    }

    const { data: analysesData } = await supabase.from('analyses').select('id');
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
    const { error } = await supabase.from('profiles')
      .update({ credits: parseInt(grantCredits) }).eq('id', grantUserId);
    if (error) { setGrantMsg(`Error: ${error.message}`); return; }
    setGrantMsg('✅ Credits updated!');
    loadAll();
  }

  // ── CHANGE USER ROLE ──
  async function handleChangeRole() {
    if (!changeRoleUserId || !changeRole) { setRoleMsg('Select user and role!'); return; }
    const { error } = await supabase.from('profiles')
      .update({ role: changeRole }).eq('id', changeRoleUserId);
    if (error) { setRoleMsg(`Error: ${error.message}`); return; }
    setRoleMsg(`✅ Role updated to ${changeRole.toUpperCase()}!`);
    setTimeout(() => setRoleMsg(''), 3000);
    loadAll();
  }

  async function handleSaveSettings() {
    await supabase.from('admin_settings').upsert({ key: 'subscriber_count', value: subscriberCount });
    await supabase.from('admin_settings').upsert({ key: 'announcement', value: announcement });
    setSettingsMsg('✅ Settings saved!');
    setTimeout(() => setSettingsMsg(''), 3000);
  }

  // ── DOWNLOAD ALL QUERIES AS SINGLE PDF-READY TEXT ──
  async function handleDownloadQueries() {
    const filtered = queryFilter === 'All' ? queries : queries.filter(q => q.status === queryFilter);

    let content = '═'.repeat(70) + '\n';
    content += '          GOD PARTICLE — CUSTOMER QUERIES REPORT\n';
    content += '═'.repeat(70) + '\n';
    content += `Generated: ${new Date().toLocaleString('en-IN')}\n`;
    content += `Total Queries: ${filtered.length} | Filter: ${queryFilter}\n`;
    content += `Pending: ${filtered.filter(q => q.status === 'Pending').length} | Answered: ${filtered.filter(q => q.status === 'Answered').length}\n`;
    content += '═'.repeat(70) + '\n\n';

    filtered.forEach((q, i) => {
      content += `┌${'─'.repeat(68)}┐\n`;
      content += `│  QUERY #${String(i + 1).padStart(3, '0')} — ${q.status?.toUpperCase()?.padEnd(55)}│\n`;
      content += `└${'─'.repeat(68)}┘\n`;
      content += `👤 Customer : ${q.username}\n`;
      content += `💳 Plan     : ${q.plan?.toUpperCase()}\n`;
      content += `🏷️  Category : ${q.category}\n`;
      content += `📅 Date     : ${new Date(q.created_at).toLocaleString('en-IN')}\n`;
      content += `📌 Status   : ${q.status}\n`;
      content += `\n📝 QUERY:\n`;
      content += `${q.query_text}\n`;
      if (q.answer_pdf_url) {
        content += `\n✅ ANSWER PDF: ${q.answer_pdf_url}\n`;
      } else {
        content += `\n📌 ANSWER: [PENDING — Please add your answer below]\n`;
        content += `\n[YOUR ANSWER HERE]\n\n`;
      }
      content += '\n' + '─'.repeat(70) + '\n\n';
    });

    content += '═'.repeat(70) + '\n';
    content += `END OF REPORT — ${filtered.length} queries total\n`;
    content += '═'.repeat(70) + '\n';

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GodParticle_Queries_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── UPLOAD BULK ANSWER PDF ──
  async function handleUploadBulkAnswer(file: File) {
    try {
      const fileName = `bulk_answers/queries_answered_${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('query-answers').upload(fileName, file, { contentType: 'application/pdf' });
      if (uploadError) throw uploadError;
      alert('✅ Bulk answer PDF uploaded!');
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    }
  }

  async function handleUploadAnswer(queryId: string, file: File) {
    setUploadingAnswer(queryId);
    try {
      const fileName = `answers/${queryId}_${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('query-answers').upload(fileName, file, { contentType: 'application/pdf' });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('query-answers').getPublicUrl(fileName);
      await supabase.from('customer_queries')
        .update({ status: 'Answered', answer_pdf_url: urlData.publicUrl }).eq('id', queryId);
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
      setFetchDone(true);
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
  const roleColors: Record<string, string> = {
    admin: 'bg-[#ff4d6d]/15 text-[#ff4d6d]',
    pro: 'bg-[#4d9fff]/15 text-[#4d9fff]',
    premium: 'bg-[#39d98a]/15 text-[#39d98a]',
    basic: 'bg-[#f0c040]/15 text-[#f0c040]',
    free: 'bg-[#6b6b85]/15 text-[#6b6b85]'
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

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
              <span className="w-1 h-4 bg-[#f0c040] rounded block" />Platform Overview
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
              <span className="w-1 h-4 bg-[#f0c040] rounded block" />User Management
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">

              {/* Grant Credits */}
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
                <div className="text-sm font-black mb-4 text-[#f0c040]">⚡ Grant Credits</div>
                <div className="space-y-3">
                  <select value={grantUserId} onChange={e => setGrantUserId(e.target.value)}
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none">
                    <option value="">Select user...</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.username} ({u.role})</option>
                    ))}
                  </select>
                  <input type="number" value={grantCredits} onChange={e => setGrantCredits(e.target.value)}
                    placeholder="Credits to grant"
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none" />
                  <button onClick={handleGrantCredits}
                    className="w-full bg-[#f0c040] text-black font-black text-xs py-2.5 rounded-xl hover:bg-[#ffd060] transition-all">
                    ⚡ Grant Credits
                  </button>
                  {grantMsg && <div className="text-xs font-mono text-[#39d98a]">{grantMsg}</div>}
                </div>
              </div>

              {/* Change Role */}
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
                <div className="text-sm font-black mb-4 text-[#4d9fff]">👑 Change Role</div>
                <div className="space-y-3">
                  <select value={changeRoleUserId} onChange={e => setChangeRoleUserId(e.target.value)}
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none">
                    <option value="">Select user...</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.username} ({u.role})</option>
                    ))}
                  </select>
                  <select value={changeRole} onChange={e => setChangeRole(e.target.value)}
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none">
                    <option value="">Select new role...</option>
                    <option value="free">Free</option>
                    <option value="basic">Basic — ₹100/month</option>
                    <option value="premium">Premium — ₹300/month</option>
                    <option value="pro">Pro — ₹2500/month</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button onClick={handleChangeRole}
                    className="w-full bg-[#4d9fff] text-black font-black text-xs py-2.5 rounded-xl hover:opacity-90 transition-all">
                    👑 Change Role
                  </button>
                  {roleMsg && <div className="text-xs font-mono text-[#39d98a]">{roleMsg}</div>}
                </div>
              </div>
            </div>

            {/* Search */}
            <input type="text" value={searchUser} onChange={e => setSearchUser(e.target.value)}
              placeholder="Search by username..."
              className="w-full bg-[#111118] border border-[#1e1e2e] rounded-xl px-4 py-3 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040] mb-4" />

            {/* Users Table */}
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead><tr className="border-b border-[#1e1e2e]">
                  {['Username', 'Role', 'Credits', 'Status', 'Joined', 'Action'].map(h => (
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
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${roleColors[u.role] || roleColors.free}`}>
                            {u.role?.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#f0c040] font-bold">{u.credits?.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${u.is_active ? 'bg-[#39d98a]/15 text-[#39d98a]' : 'bg-[#ff4d6d]/15 text-[#ff4d6d]'}`}>
                            {u.is_active ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#6b6b85]">{new Date(u.created_at).toLocaleDateString('en-IN')}</td>
                        <td className="px-4 py-3">
                          <select
                            defaultValue=""
                            onChange={async (e) => {
                              if (!e.target.value) return;
                              const newRole = e.target.value;
                              const { error } = await supabase.from('profiles')
                                .update({ role: newRole }).eq('id', u.id);
                              if (!error) {
                                loadAll();
                                e.target.value = '';
                              }
                            }}
                            className="bg-[#16161f] border border-[#1e1e2e] rounded px-2 py-1 text-xs font-mono text-[#e8e8f0] outline-none cursor-pointer">
                            <option value="">Change role...</option>
                            <option value="free">Free</option>
                            <option value="basic">Basic</option>
                            <option value="premium">Premium</option>
                            <option value="pro">Pro</option>
                            <option value="admin">Admin</option>
                          </select>
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
              <div className="flex gap-2">
                <button onClick={handleDownloadQueries}
                  className="bg-[#f0c040] text-black font-black text-xs px-4 py-2.5 rounded-xl hover:bg-[#ffd060] transition-all">
                  📥 Download All Queries
                </button>
                <label className="cursor-pointer bg-[#4d9fff] text-black font-black text-xs px-4 py-2.5 rounded-xl hover:opacity-90 transition-all">
                  <input type="file" accept=".pdf" className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) await handleUploadBulkAnswer(file);
                    }} />
                  📤 Upload Bulk Answer PDF
                </label>
              </div>
            </div>

            {/* Info box */}
            <div className="bg-[#4d9fff]/5 border border-[#4d9fff]/20 rounded-xl p-4 mb-4 text-xs font-mono text-[#4d9fff]">
              📋 Workflow: Download all queries → Answer them → Upload one PDF back → Assign to each user below
            </div>

            {/* Filter */}
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
                        <span className="text-xs font-black">{q.username}</span>
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
                    <div className="flex items-center gap-3 flex-wrap">
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
              One tap fetches ALL indices + stocks data. Run daily after 3:30 PM market close.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
                <div className="text-sm font-black text-[#f0c040] mb-3">📈 Weekly Indices (NSE/BSE)</div>
                <div className="space-y-1.5 text-xs font-mono text-[#6b6b85]">
                  <div>✅ Nifty 50 → 4 weekly + 4 monthly expiries</div>
                  <div>✅ Sensex → 4 weekly + 4 monthly expiries</div>
                  <div>✅ All strikes — CE + PE data</div>
                  <div>✅ Auto Z2H snapshot on expiry day</div>
                </div>
              </div>
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
                <div className="text-sm font-black text-[#4d9fff] mb-3">📊 Monthly Indices</div>
                <div className="space-y-1.5 text-xs font-mono text-[#6b6b85]">
                  <div>✅ Bank Nifty → 4 monthly expiries</div>
                  <div>✅ Fin Nifty → 4 monthly expiries</div>
                  <div>✅ Midcap Nifty → 4 monthly expiries</div>
                  <div>✅ Nifty Next 50 → 4 monthly expiries</div>
                </div>
              </div>
            </div>

            <div className="bg-[#f0c040]/5 border border-[#f0c040]/20 rounded-xl p-4 mb-6 text-xs font-mono text-[#f0c040]">
              ⏰ Run daily after 3:30 PM · Duplicates auto-skipped · Z2H snapshots auto-saved on expiry days
            </div>

            <button onClick={handleAutoFetch} disabled={fetchLoading}
              className="w-full bg-[#39d98a] text-black font-black text-sm py-4 rounded-xl hover:opacity-90 transition-all disabled:opacity-40 mb-4">
              {fetchLoading ? '⏳ Fetching all market data...' : '🤖 Run Auto Fetch Now'}
            </button>

            {fetchDone && fetchResults.length > 0 && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
                <div className="text-xs font-mono font-bold mb-3">
                  <span className="text-[#39d98a]">✅ {fetchResults.filter(r => r.status === 'saved').length} saved</span>
                  <span className="text-[#f0c040] ml-3">⚠️ {fetchResults.filter(r => r.status === 'duplicate').length} duplicates</span>
                  <span className="text-[#6b6b85] ml-3">⏸ {fetchResults.filter(r => r.status === 'empty').length} empty</span>
                  <span className="text-[#ff4d6d] ml-3">❌ {fetchResults.filter(r => r.status === 'error').length} errors</span>
                </div>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {fetchResults.map((r, i) => (
                    <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono ${
                      r.status === 'saved' ? 'bg-[#39d98a]/10 text-[#39d98a]' :
                      r.status === 'duplicate' ? 'bg-[#f0c040]/10 text-[#f0c040]' :
                      r.status === 'empty' ? 'bg-[#6b6b85]/10 text-[#6b6b85]' :
                      'bg-[#ff4d6d]/10 text-[#ff4d6d]'
                    }`}>
                      <span className="font-bold">{r.index} {r.expiry ? `| ${r.expiry}` : ''}</span>
                      <span>
                        {r.status === 'saved' ? `✅ Saved${r.strikes ? ` (${r.strikes} strikes)` : ''}` :
                         r.status === 'duplicate' ? '⚠️ Already exists' :
                         r.status === 'empty' ? '⏸ Market closed' :
                         `❌ ${r.error || 'Error'}`}
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
              <span className="w-1 h-4 bg-[#f0c040] rounded block" />Platform Settings
            </h2>
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
              <div className="text-sm font-black mb-4 text-[#f0c040]">🌐 Landing Page Settings</div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Subscriber Count</label>
                  <input type="text" value={subscriberCount} onChange={e => setSubscriberCount(e.target.value)}
                    placeholder="e.g. 2600+"
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Announcement Banner</label>
                  <input type="text" value={announcement} onChange={e => setAnnouncement(e.target.value)}
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
        )}
      </div>
    </div>
  );
}
