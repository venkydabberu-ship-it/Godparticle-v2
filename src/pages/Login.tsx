import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signIn } from '../lib/auth';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await signIn(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">

      {/* Grid background */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-[#f0c040] rounded-2xl flex items-center justify-center text-2xl shadow-[0_0_30px_rgba(240,192,64,0.3)] mx-auto mb-4">
            ⚛
          </div>
          <h1 className="text-2xl font-black tracking-tight">Welcome Back</h1>
          <p className="text-sm text-[#6b6b85] font-mono mt-1">Sign in to God Particle</p>
        </div>

        {/* Form */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-8">

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm font-mono text-red-400 mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-mono text-[#6b6b85] tracking-widest uppercase mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-4 py-3 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-[#6b6b85] tracking-widest uppercase mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-4 py-3 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040] transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#f0c040] text-black font-black py-3 rounded-lg hover:bg-[#ffd060] transition-all shadow-[0_0_20px_rgba(240,192,64,0.2)] disabled:opacity-40 disabled:cursor-not-allowed text-sm"
            >
              {loading ? '⏳ Signing in...' : '⚛ Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm font-mono text-[#6b6b85]">
            Don't have an account?{' '}
            <Link to="/signup" className="text-[#f0c040] hover:underline">
              Sign up free
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}