import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function Admin() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [creditUserId, setCreditUserId] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditMsg, setCreditMsg] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const { data: usersData } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      setUsers(usersData || []);

      const total = usersData?.length || 0;
      const basic = usersData?.filter((u: any) => u.role === 'basic').length || 0;
      const premium = usersData?.filter((u: any) => u.role === 'premium').length || 0;
      const free = usersData?.filter((u: any) => u.role === 'free').length || 0;

      const { data: analyses } = await supabase
        .from('analyses')
        .select('id', { count: 'exact' });

      setStats({ total, basic, premium, free, analyses: analyses?.length || 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function updateUserRole(userId: string, role: string) {
    await supabase
      .from('profiles')
      .update({ role })
      .eq('id', userId);
    await loadData();
  }

  async function toggleUserActive(userId: string, isActive: boolean) {
    await supabase
      .from('profiles')
      .update({ is_active: !isActive })
      .eq('id', userId);
    await loadData();
  }

  async function grantCredits() {
    if (!creditUserId || !creditAmount) return;
    const { error } = await supabase.rpc('add_credits', {
      p_user_id: creditUserId,
      p_credits: parseInt(creditAmount),
      p_type: 'admin_grant',
      p_description: `Admin granted ${creditAmount} credits`
    });
    if (error) {
      setCreditMsg(`Error: ${error.message}`);
    } else {
      setCreditMsg(`✓ ${creditAmount} credits added to user!`);
      setCreditUserId('');
      setCreditAmount('');
      await loadData();
    }
  }

  const filteredUsers = users.filter(u =>
    u.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.phone?.includes(searchTerm)
  );

  const roleColor = (role: string) => {
    if (role === 'admin') return 'text-[#ff4d6d] bg-[#ff4d6d]/15';
    if (role === 'premium') return 'text-[#39d98a] bg-[#39d98a]/15';
    if (role === 'basic') return 'text-[#f0c040] bg-[#f0c040]/15';
    return 'text-[#6b6b85] bg-[#6b6b85]/15';
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#1e1e2e]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#f0c040] rounded-xl flex items-center justify-center text-lg">⚛</div>
          <div>
            <div className="font-bold text-base">God Particle</div>
            <div className="text-[10px] font-mono text-[#ff4d6d] uppercase tracking-widest">Admin Panel</div>
          </div>
        </div>
        <Link to="/dashboard" className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040]">
          ← Dashboard
        </Link>
      </nav>

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-8">

        {/* Tabs */}
        <div className="flex gap-1 bg-[#111118] rounded-xl p-1 mb-8 overflow-x-auto w-fit">
          {['overview', 'users', 'credits'].map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${activeTab === t ? 'bg-[#16161f] text-[#f0c040] border border-[#1e1e2e]' : 'text-[#6b6b85]'}`}
            >
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-sm font-mono text-[#6b6b85]">Loading...</div>
        ) : (
          <>
            {/* OVERVIEW */}
            {activeTab === 'overview' && (
              <div>
                <h2 className="text-lg font-black mb-6 flex items-center gap-2">
                  <span className="w-1 h-4 bg-[#f0c040] rounded block" />
                  Platform Overview
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                  {[
                    { label: 'Total Users', value: stats.total, color: '#4d9fff' },
                    { label: 'Free Users', value: stats.free, color: '#6b6b85' },
                    { label: 'Basic Users', value: stats.basic, color: '#f0c040' },
                    { label: 'Premium Users', value: stats.premium, color: '#39d98a' },
                    { label: 'Total Analyses', value: stats.analyses, color: '#ff4d6d' },
                  ].map((s, i) => (
                    <div key={i} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
                      <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">{s.label}</div>
                      <div className="text-2xl font-black" style={{ color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-6">
                  <h3 className="text-sm font-black mb-4 text-[#f0c040]">Revenue Estimate</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-[#16161f] rounded-xl p-4">
                      <div className="text-xs font-mono text-[#6b6b85] mb-1">Basic Revenue</div>
                      <div className="text-xl font-black text-[#f0c040]">₹{stats.basic * 100}</div>
                      <div className="text-xs font-mono text-[#6b6b85]">{stats.basic} users × ₹100</div>
                    </div>
                    <div className="bg-[#16161f] rounded-xl p-4">
                      <div className="text-xs font-mono text-[#6b6b85] mb-1">Premium Revenue</div>
                      <div className="text-xl font-black text-[#39d98a]">₹{stats.premium * 300}</div>
                      <div className="text-xs font-mono text-[#6b6b85]">{stats.premium} users × ₹300</div>
                    </div>
                    <div className="bg-[#16161f] rounded-xl p-4">
                      <div className="text-xs font-mono text-[#6b6b85] mb-1">Total Monthly</div>
                      <div className="text-xl font-black text-[#4d9fff]">₹{(stats.basic * 100) + (stats.premium * 300)}</div>
                      <div className="text-xs font-mono text-[#6b6b85]">Estimated MRR</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* USERS */}
            {activeTab === 'users' && (
              <div>
                <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                  <h2 className="text-lg font-black flex items-center gap-2">
                    <span className="w-1 h-4 bg-[#f0c040] rounded block" />
                    User Management
                  </h2>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Search by username..."
                    className="bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-xs font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040] w-48"
                  />
                </div>
                <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-[#1e1e2e]">
                        {['Username', 'Role', 'Credits', 'Status', 'Joined', 'Actions'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[#6b6b85] uppercase tracking-widest font-normal">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u, i) => (
                        <tr key={i} className="border-b border-[#1e1e2e]/50 hover:bg-[#f0c040]/5">
                          <td className="px-4 py-3 font-bold">{u.username}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${roleColor(u.role)}`}>
                              {u.role.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[#f0c040] font-bold">
                            {u.role === 'premium' ? '∞' : u.credits}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${u.is_active ? 'text-[#39d98a] bg-[#39d98a]/15' : 'text-[#ff4d6d] bg-[#ff4d6d]/15'}`}>
                              {u.is_active ? 'ACTIVE' : 'BANNED'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[#6b6b85]">
                            {new Date(u.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {u.role !== 'admin' && (
                                <select
                                  value={u.role}
                                  onChange={e => updateUserRole(u.id, e.target.value)}
                                  className="bg-[#16161f] border border-[#1e1e2e] rounded px-2 py-1 text-xs font-mono text-[#e8e8f0] outline-none"
                                >
                                  <option value="free">Free</option>
                                  <option value="basic">Basic</option>
                                  <option value="premium">Premium</option>
                                </select>
                              )}
                              {u.role !== 'admin' && (
                                <button
                                  onClick={() => toggleUserActive(u.id, u.is_active)}
                                  className={`px-2 py-1 rounded text-xs font-bold transition-all ${u.is_active ? 'bg-[#ff4d6d]/15 text-[#ff4d6d] hover:bg-[#ff4d6d]/30' : 'bg-[#39d98a]/15 text-[#39d98a] hover:bg-[#39d98a]/30'}`}
                                >
                                  {u.is_active ? 'Ban' : 'Unban'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* CREDITS */}
            {activeTab === 'credits' && (
              <div>
                <h2 className="text-lg font-black mb-6 flex items-center gap-2">
                  <span className="w-1 h-4 bg-[#f0c040] rounded block" />
                  Grant Credits to User
                </h2>
                <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 max-w-md">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                        Select User
                      </label>
                      <select
                        value={creditUserId}
                        onChange={e => setCreditUserId(e.target.value)}
                        className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]"
                      >
                        <option value="">Select user...</option>
                        {users.filter(u => u.role !== 'admin').map(u => (
                          <option key={u.id} value={u.id}>
                            {u.username} ({u.credits} credits)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                        Credits to Grant
                      </label>
                      <input
                        type="number"
                        value={creditAmount}
                        onChange={e => setCreditAmount(e.target.value)}
                        placeholder="e.g. 50"
                        className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]"
                      />
                    </div>
                    <button
                      onClick={grantCredits}
                      className="w-full bg-[#f0c040] text-black font-black py-3 rounded-xl hover:bg-[#ffd060] transition-all"
                    >
                      ⚡ Grant Credits
                    </button>
                    {creditMsg && (
                      <div className={`text-xs font-mono px-4 py-2 rounded-lg ${creditMsg.startsWith('✓') ? 'bg-[#39d98a]/10 text-[#39d98a] border border-[#39d98a]/30' : 'bg-[#ff4d6d]/10 text-[#ff4d6d] border border-[#ff4d6d]/30'}`}>
                        {creditMsg}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}