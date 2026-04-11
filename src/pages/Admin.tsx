import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

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

  useEffect(() => {
    if (profile?.role !== 'admin') return;
    loadAll();
  }, [profile]);

  async function loadAll() {
    // Load users
    const { data: usersData } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (usersData) setUsers(usersData);

    // Load queries
    const { data: queriesData } = await supabase
      .from('customer_queries')
      .select('*')
      .order('created_at', { ascending: false });
    if (queriesData) setQueries(queriesData);

    // Load settings
    const { data: settingsData } = await supabase
      .from('admin_settings')
      .select('*');
    if (settingsData) {
      settingsData.forEach(s => {
        if (s.key === 'subscriber_count') setSubscriberCount(s.value);
        if (s.key === 'announcement') setAnnouncement(s.value);
      });
    }

    // Stats
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

  // Download queries as PDF-ready text
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

    // Create downloadable file
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `queries_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Upload answer PDF for a query
  async function handleUploadAnswer(queryId: string, file: File) {
    setUploadingAnswer(queryId);
    try {
      // Upload to Supabase storage
      const fileName = `answers/${queryId}_${Date.now()}.pdf`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('query-answers')
        .upload(fileName, file, { contentType: 'application/pdf' });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('query-answers')
        .getPublicUrl(fileName);

      // Update query with answer URL and mark as answered
      await supabase.from('customer_queries')
        .update({
          status: 'Answered',
          answer_pdf_url: urlData.publicUrl
        })
        .eq('id', queryId);

      loadAll();
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploadingAnswer(null);
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

  const tabs = ['overview', 'users', 'queries', 'settings'];
  const tabLabels = ['📊 Overview', '👥 Users', '💬 Queries', '⚙️ Settings'];

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

            {/* Grant Credits */}
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
              {grantMsg && (
                <div className="mt-2 text-xs font-mono text-[#39d98a]">{grantMsg}</div>
              )}
            </div>

            {/* Search */}
            <input type="text" value={searchUser} onChange={e => setSearchUser(e.target.value)}
              placeholder="Search by username..."
              className="w-full bg-[#111118] border border-[#1e1e2e] rounded-xl px-4 py-3 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040] mb-4" />

            {/* Users table */}
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

            {/* Filter */}
            <div className="flex gap-2 mb-4">
              {['All', 'Pending', 'Answered'].map(f => (
                <button key={f} onClick={() => setQueryFilter(f)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${queryFilter === f ? 'bg-[#f0c040] text-black' : 'bg-[#111118] border border-[#1e1e2e] text-[#6b6b85]'}`}>
                  {f} ({f === 'All' ? queries.length : queries.filter(q => q.status === f).length})
                </button>
              ))}
            </div>

            {/* Queries list */}
            <div className="space-y-3">
              {filteredQueries.length === 0 ? (
                <div className="text-center py-8 text-xs font-mono text-[#6b6b85]">
                  No queries found
                </div>
              ) : (
                filteredQueries.map((q, i) => (
                  <div key={i} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-[#e8e8f0]">{q.username}</span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded ${q.plan === 'pro' ? 'bg-[#4d9fff]/15 text-[#4d9fff]' : q.plan === 'premium' ? 'bg-[#39d98a]/15 text-[#39d98a]' : 'bg-[#f0c040]/15 text-[#f0c040]'}`}>
                          {q.plan?.toUpperCase()}
                        </span>
                        <span className="text-[10px] font-black bg-[#4d9fff]/15 text-[#4d9fff] px-2 py-0.5 rounded">
                          {q.category}
                        </span>
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
                      {/* Upload Answer PDF */}
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
                    <div className="text-[10px] font-mono text-[#6b6b85] mt-1">
                      This number is shown publicly on the landing page
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                      Announcement Banner (shown on dashboard)
                    </label>
                    <input type="text" value={announcement}
                      onChange={e => setAnnouncement(e.target.value)}
                      placeholder="Leave empty to hide banner..."
                      className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]" />
                    <div className="text-[10px] font-mono text-[#6b6b85] mt-1">
                      Shown to all users on their dashboard. Leave empty to hide.
                    </div>
                  </div>
                </div>

                {settingsMsg && (
                  <div className="mt-3 text-xs font-mono text-[#39d98a]">{settingsMsg}</div>
                )}

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
