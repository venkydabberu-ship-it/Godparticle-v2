import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signUp } from '../lib/auth';

export default function Signup() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match!');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters!');
      return;
    }
    if (username.length < 3) {
      setError('Username must be at least 3 characters!');
      return;
    }
    setLoading(true);
    try {
      await signUp(email, password, username);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
        <div className="relative z-10 w-full max-w-md text-center">
          <div className="w-14 h-14 bg-[#39d98a] rounded-2xl flex items-center justify-center text-2xl mx-auto mb-6">
            ✓
          </div>
          <h2 className="text-2xl font-black mb-3">Account Created!</h2>
          <p className="text-sm font-mono text-[#6b6b85] mb-6">
            Check your email to confirm your account. Then login to get your 50 free credits!
          </p>
          <Link
            to="/login"
            className="inline-block bg-[#f0c040] text-black font-black px-8 py-3 rounded-xl hover:bg-[#ffd060] transition-all"
          >
            Go to Login →
          </Link>
        </div>
      </div>
    );
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
          <h1 className="text-2xl font-black tracking-tight">Create Account</h1>
          <p className="text-sm text-[#6b6b85] font-mono mt-1">
            Get 50 free credits instantly
          </p>
        </div>

        {/* Form */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-8">

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm font-mono text-red-400 mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-5">
            <div>
              <label className="block text-xs font-mono text-[#6b6b85] tracking-widest uppercase mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="yourname"
                required
                className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-4 py-3 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040] transition-colors"
              />
            </div>

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
                placeholder="min 6 characters"
                required
                className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-4 py-3 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-[#6b6b85] tracking-widest uppercase mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
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
              {loading ? '⏳ Creating account...' : '⚛ Create Account — 50 Free Credits'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm font-mono text-[#6b6b85]">
            Already have an account?{' '}
            <Link to="/login" className="text-[#f0c040] hover:underline">
              Sign in
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}