import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { signOut } from '../lib/auth';
import { getUserAnalyses } from '../lib/market';

export default function Dashboard() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      getUserAnalyses(user.id)
        .then(setAnalyses)
        .catch(console.error)
        .finally(() => setLoading(false));
      refreshProfile();
    }
  }, [user]);

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  const creditsColor = (credits: number) => {
    if (credits > 20) return 'text-[#39d98a]';
    if (credits > 10) return 'text-[#f0c040]';
    return 'text-[#ff4d6d]';
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">

      {/* Grid background */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#1e1e2e]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#f0c040] rounded-xl flex items-center justify-center text-lg shadow-[0_0_20px_rgba(240,192,64,0.3)]">
            ⚛
          </div>
          <div className="font-bold text-base tracking-tight">God Particle</div>
        </div>
        <div className="flex items-center gap-3">
          {profile?.role === 'admin' && (
            <Link
              to="/admin"
              className="px-3 py-1.5 text-xs font-bold bg-[#f0c040] text-black rounded-lg"
            >
              Admin Panel
            </Link>
          )}
          <button
            onClick={handleSignOut}
            className="px-3 py-1.5 text-xs font-bold border border-[#1e1e2e] rounded-lg hover:border-[#ff4d6d] hover:text-[#ff4d6d] transition-all"
          >
            Sign Out
          </button>
        </div>
      </nav>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8">

        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-black tracking-tight">
            Welcome back, <span className="text-[#f0c040]">{profile?.username}</span> 👋
          </h1>
          <p className="text-sm font-mono text-[#6b6b85] mt-1">
            Ready to find the God Particle today?
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            {
              label: 'Credits',
              value: profile?.role === 'premium' ? '∞' : profile?.credits ?? 0,
              color: creditsColor(profile?.credits ?? 0),
              icon: '⚡'
            },
            {
              label: 'Plan',
              value: profile?.role?.toUpperCase() ?? 'FREE',
              color: profile?.role === 'premium' ? '#39d98a' : profile?.role === 'basic' ? '#f0c040' : '#6b6b85',
              icon: '👑'
            },
            {
              label: 'Analyses Done',
              value: analyses.length,
              color: '#4d9fff',
              icon: '🔬'
            },
            {
              label: 'Cost per Analysis',
              value: '2 credits',
              color: '#6b6b85',
              icon: '💰'
            }
          ].map((stat, i) => (
            <div key={i} className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
              <div className="text-lg mb-1">{stat.icon}</div>
              <div className="text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-1">
                {stat.label}
              </div>
              <div className="text-xl font-black" style={{ color: stat.color }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* Low credits warning */}
        {profile?.role !== 'premium' && (profile?.credits ?? 0) <= 10 && (
          <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-xl p-4 mb-6 flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm font-mono text-[#ff4d6d]">
              ⚠️ Low credits! You have {profile?.credits} credits left ({Math.floor((profile?.credits ?? 0) / 2)} analyses remaining)
            </div>
            <Link
              to="/pricing"
              className="px-4 py-2 bg-[#f0c040] text-black text-xs font-black rounded-lg"
            >
              Buy Credits
            </Link>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <Link
            to="/analysis"
            className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-6 hover:border-[#f0c040] transition-all group"
          >
            <div className="text-2xl mb-3">⚛</div>
            <div className="font-black text-base mb-1 group-hover:text-[#f0c040] transition-colors">
              Run God Particle Analysis
            </div>
            <div className="text-xs font-mono text-[#6b6b85]">
              Analyse any strike price — 2 credits per analysis
            </div>
          </Link>

          <Link
            to="/pricing"
            className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-6 hover:border-[#f0c040] transition-all group"
          >
            <div className="text-2xl mb-3">💳</div>
            <div className="font-black text-base mb-1 group-hover:text-[#f0c040] transition-colors">
              Upgrade Plan
            </div>
            <div className="text-xs font-mono text-[#6b6b85]">
              Basic ₹100/month · Premium ₹300/month
            </div>
          </Link>
        </div>

        {/* Recent Analyses */}
        <div>
          <h2 className="text-base font-black mb-4 flex items-center gap-2">
            <span className="w-1 h-4 bg-[#f0c040] rounded block" />
            Recent Analyses
          </h2>

          {loading ? (
            <div className="text-sm font-mono text-[#6b6b85]">Loading...</div>
          ) : analyses.length === 0 ? (
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-8 text-center">
              <div className="text-2xl mb-3">🔬</div>
              <div className="text-sm font-mono text-[#6b6b85]">
                No analyses yet. Run your first God Particle analysis!
              </div>
              <Link
                to="/analysis"
                className="inline-block mt-4 px-6 py-2 bg-[#f0c040] text-black text-sm font-black rounded-lg"
              >
                Start Analysing →
              </Link>
            </div>
          ) : (
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#1e1e2e]">
                    <th className="text-left px-4 py-3 text-[#6b6b85] uppercase tracking-widest font-normal">Date</th>
                    <th className="text-left px-4 py-3 text-[#6b6b85] uppercase tracking-widest font-normal">Strike</th>
                    <th className="text-left px-4 py-3 text-[#6b6b85] uppercase tracking-widest font-normal">Type</th>
                    <th className="text-left px-4 py-3 text-[#6b6b85] uppercase tracking-widest font-normal">Expiry</th>
                    <th className="text-left px-4 py-3 text-[#6b6b85] uppercase tracking-widest font-normal">PCB</th>
                  </tr>
                </thead>
                <tbody>
                  {analyses.map((a, i) => (
                    <tr key={i} className="border-b border-[#1e1e2e]/50 hover:bg-[#f0c040]/5">
                      <td className="px-4 py-3">{new Date(a.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 font-bold text-[#f0c040]">{a.strike}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${a.option_type === 'CE' ? 'bg-[#39d98a]/15 text-[#39d98a]' : 'bg-[#ff4d6d]/15 text-[#ff4d6d]'}`}>
                          {a.option_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#6b6b85]">{a.expiry}</td>
                      <td className="px-4 py-3 font-bold text-[#f0c040]">
                        ₹{a.result?.pcb?.toFixed(1) ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}