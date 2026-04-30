import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signUp, verifySignupOTP, resendSignupOTP } from '../lib/auth';

export default function Signup() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');
  const [resendMsg, setResendMsg] = useState('');

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match!'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters!'); return; }
    if (username.length < 3) { setError('Username must be at least 3 characters!'); return; }
    setLoading(true);
    try {
      await signUp(email, password, username);
      setStep('otp');
    } catch (err: any) {
      setError(err.message || 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (otp.length < 6) { setError('Please enter the 6-digit code from your email.'); return; }
    setLoading(true);
    try {
      await verifySignupOTP(email, otp.trim());
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Invalid or expired code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    setResendMsg('');
    setError('');
    setResending(true);
    try {
      await resendSignupOTP(email);
      setResendMsg('New code sent! Check your inbox (and spam folder).');
      setCooldown(60);
    } catch (err: any) {
      setError(err.message || 'Could not resend code.');
    } finally {
      setResending(false);
    }
  }

  if (step === 'otp') {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
        <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

        <div className="relative z-10 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-[#f0c040] rounded-2xl flex items-center justify-center text-2xl shadow-[0_0_30px_rgba(240,192,64,0.3)] mx-auto mb-4">
              ✉
            </div>
            <h1 className="text-2xl font-black tracking-tight">Check Your Email</h1>
            <p className="text-sm text-[#6b6b85] font-mono mt-1">
              We sent a 6-digit code to <span className="text-[#f0c040]">{email}</span>
            </p>
          </div>

          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-8">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm font-mono text-red-400 mb-6">
                {error}
              </div>
            )}
            {resendMsg && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 text-sm font-mono text-green-400 mb-6">
                {resendMsg}
              </div>
            )}

            <form onSubmit={handleVerifyOTP} className="space-y-5">
              <div>
                <label className="block text-xs font-mono text-[#6b6b85] tracking-widest uppercase mb-2">
                  Verification Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  required
                  autoFocus
                  className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-4 py-3 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040] transition-colors text-center text-xl tracking-[0.5em]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#f0c040] text-black font-black py-3 rounded-lg hover:bg-[#ffd060] transition-all shadow-[0_0_20px_rgba(240,192,64,0.2)] disabled:opacity-40 disabled:cursor-not-allowed text-sm"
              >
                {loading ? '⏳ Verifying...' : '⚛ Verify & Activate Account'}
              </button>
            </form>

            <div className="mt-6 text-center text-sm font-mono text-[#6b6b85]">
              Didn't receive the code?{' '}
              <button
                onClick={handleResend}
                disabled={resending || cooldown > 0}
                className="text-[#f0c040] hover:underline disabled:opacity-40"
              >
                {resending ? 'Sending...' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>
            </div>

            <div className="mt-3 text-center text-sm font-mono text-[#6b6b85]">
              <button
                onClick={() => { setStep('form'); setError(''); setOtp(''); }}
                className="text-[#6b6b85] hover:text-[#e8e8f0] underline"
              >
                Back to sign up
              </button>
            </div>
          </div>
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
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="min 6 characters"
                  required
                  className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-4 py-3 pr-11 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040] transition-colors"
                />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b6b85] hover:text-[#e8e8f0] transition-colors">
                  {showPassword
                    ? <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-[#6b6b85] tracking-widest uppercase mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-4 py-3 pr-11 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040] transition-colors"
                />
                <button type="button" onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b6b85] hover:text-[#e8e8f0] transition-colors">
                  {showConfirm
                    ? <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
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
