import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Pricing() {
  const { profile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handlePayment(plan: string, amount: number, credits: number) {
    setLoading(plan);
    setError('');
    try {
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: amount * 100,
        currency: 'INR',
        name: 'God Particle',
        description: `${plan} Plan — ${credits} credits/month`,
        handler: async function(response: any) {
          setSuccess(`Payment successful! Your ${plan} plan is now active. Payment ID: ${response.razorpay_payment_id}`);
          await refreshProfile();
        },
        prefill: { email: profile?.username ?? '' },
        theme: { color: '#f0c040' }
      };
      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      setError(err.message || 'Payment failed!');
    } finally {
      setLoading('');
    }
  }

  async function handleBuyCredits(credits: number) {
    const amount = credits * 2;
    setLoading('credits');
    setError('');
    try {
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: amount * 100,
        currency: 'INR',
        name: 'God Particle',
        description: `${credits} Credits Purchase`,
        handler: async function(response: any) {
          setSuccess(`${credits} credits will be added shortly! Payment ID: ${response.razorpay_payment_id}`);
          await refreshProfile();
        },
        theme: { color: '#f0c040' }
      };
      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      setError(err.message || 'Payment failed!');
    } finally {
      setLoading('');
    }
  }

  const plans = [
    {
      name: 'Free',
      price: '₹0',
      period: 'forever',
      credits: '50 credits (signup only)',
      color: '#6b6b85',
      badge: null,
      features: [
        '50 free credits on signup',
        '25 analyses total',
        'Nifty 50 analysis only',
        'Daily timeframe only',
        'God Particle framework',
        'Scenario matrix',
        'Instagram captions'
      ],
      current: profile?.role === 'free',
      action: null,
      amount: 0,
      planKey: 'free',
      monthlyCredits: 0
    },
    {
      name: 'Basic',
      price: '₹100',
      period: 'per month',
      credits: '50 credits/month',
      color: '#f0c040',
      badge: 'POPULAR',
      features: [
        '50 credits every month',
        '25 analyses per month',
        'Nifty 50 + Sensex',
        'Use our Nifty 50 data',
        'Daily timeframe',
        'God Particle framework',
        'Full scenario matrix',
        'Instagram captions'
      ],
      current: profile?.role === 'basic',
      action: () => handlePayment('Basic', 100, 50),
      amount: 100,
      planKey: 'basic',
      monthlyCredits: 50
    },
    {
      name: 'Premium',
      price: '₹300',
      period: 'per month',
      credits: '200 credits/month',
      color: '#39d98a',
      badge: 'BEST VALUE',
      features: [
        '200 credits every month',
        '100 analyses per month',
        'All indices + your own stocks',
        'Upload your own CSV data',
        'Buy data from bank (5 credits)',
        'Daily + Weekly + Monthly',
        'BankNifty, FinNifty, MidCap',
        'Priority support'
      ],
      current: profile?.role === 'premium',
      action: () => handlePayment('Premium', 300, 200),
      amount: 300,
      planKey: 'premium',
      monthlyCredits: 200
    },
    {
      name: 'Pro',
      price: '₹2500',
      period: 'per month',
      credits: '3000 credits/month',
      color: '#4d9fff',
      badge: 'PRO',
      features: [
        '3000 credits every month',
        'Unlimited analyses',
        'All indices + all stocks',
        'Upload any data',
        'Data bank access FREE',
        'Daily + Weekly + Monthly + Yearly',
        'We provide data if available',
        'Dedicated support',
        'Early access to new features'
      ],
      current: profile?.role === 'pro',
      action: () => handlePayment('Pro', 2500, 3000),
      amount: 2500,
      planKey: 'pro',
      monthlyCredits: 3000
    }
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#1e1e2e]">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#f0c040] rounded-xl flex items-center justify-center text-lg">⚛</div>
          <div className="font-bold text-base">God Particle</div>
        </Link>
        <div className="flex items-center gap-3">
          <div className="text-xs font-mono text-[#6b6b85]">
            Plan: <span className="text-[#f0c040] font-bold uppercase">{profile?.role}</span>
            &nbsp;·&nbsp;
            Credits: <span className="text-[#f0c040] font-bold">{profile?.role === 'pro' ? '∞' : profile?.credits ?? 0}</span>
          </div>
          <Link to="/dashboard" className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040]">
            ← Dashboard
          </Link>
        </div>
      </nav>

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-black tracking-tight mb-3">
            Choose Your <span className="text-[#f0c040]">Plan</span>
          </h1>
          <p className="text-sm font-mono text-[#6b6b85] max-w-xl mx-auto">
            Start free with 50 credits. Upgrade anytime for more power, more data and more analyses.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm font-mono text-red-400 mb-6 text-center">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-[#39d98a]/10 border border-[#39d98a]/30 rounded-xl px-4 py-3 text-sm font-mono text-[#39d98a] mb-6 text-center">
            {success}
          </div>
        )}

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {plans.map((plan, i) => (
            <div
              key={i}
              className={`bg-[#111118] border rounded-2xl p-6 flex flex-col relative ${
                plan.name === 'Premium'
                  ? 'border-[#39d98a] shadow-[0_0_30px_rgba(57,217,138,0.1)]'
                  : plan.name === 'Pro'
                  ? 'border-[#4d9fff] shadow-[0_0_30px_rgba(77,159,255,0.1)]'
                  : 'border-[#1e1e2e]'
              }`}
            >
              {/* Badge */}
              {plan.badge && (
                <div
                  className="absolute -top-3 left-1/2 transform -translate-x-1/2 text-xs font-black px-3 py-1 rounded-full text-black"
                  style={{ background: plan.color }}
                >
                  {plan.badge}
                </div>
              )}

              {/* Plan name */}
              <div className="font-black text-xl mb-1" style={{ color: plan.color }}>
                {plan.name}
              </div>
              <div className="text-3xl font-black mb-1">{plan.price}</div>
              <div className="text-xs font-mono text-[#6b6b85] mb-2">{plan.period}</div>
              <div className="text-xs font-mono mb-6" style={{ color: plan.color }}>
                {plan.credits}
              </div>

              {/* Features */}
              <ul className="space-y-2 mb-8 flex-1">
                {plan.features.map((f, j) => (
                  <li key={j} className="text-xs font-mono text-[#6b6b85] flex items-start gap-2">
                    <span style={{ color: plan.color }} className="mt-0.5 shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              {/* Action button */}
              {plan.current ? (
                <div className="w-full py-2.5 text-center text-xs font-bold border border-[#1e1e2e] rounded-xl text-[#6b6b85]">
                  ✓ Current Plan
                </div>
              ) : plan.action ? (
                <button
                  onClick={plan.action}
                  disabled={loading === plan.planKey}
                  className="w-full py-2.5 text-xs font-black rounded-xl transition-all disabled:opacity-40 hover:opacity-90"
                  style={{ background: plan.color, color: '#000' }}
                >
                  {loading === plan.planKey ? '⏳ Processing...' : `Subscribe — ${plan.price}/mo`}
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {/* Credit costs info */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 mb-8">
          <h2 className="text-base font-black mb-6 flex items-center gap-2">
            <span className="w-1 h-4 bg-[#f0c040] rounded block" />
            Credit Usage Guide
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                action: '⚛ Analyse a Strike',
                free: '2 credits',
                basic: '2 credits',
                premium: '2 credits',
                pro: '2 credits'
              },
              {
                action: '📊 Buy Data from Bank',
                free: '❌ Not available',
                basic: '❌ Not available',
                premium: '5 credits',
                pro: '0 credits (FREE)'
              },
              {
                action: '📤 Upload Own Data',
                free: '❌ Not available',
                basic: '❌ Not available',
                premium: '✅ Free',
                pro: '✅ Free'
              }
            ].map((item, i) => (
              <div key={i} className="bg-[#16161f] rounded-xl p-4">
                <div className="text-sm font-bold mb-3 text-[#f0c040]">{item.action}</div>
                <div className="space-y-2">
                  {[
                    { plan: 'Free', value: item.free },
                    { plan: 'Basic', value: item.basic },
                    { plan: 'Premium', value: item.premium },
                    { plan: 'Pro', value: item.pro }
                  ].map((row, j) => (
                    <div key={j} className="flex items-center justify-between text-xs font-mono">
                      <span className="text-[#6b6b85]">{row.plan}</span>
                      <span className={row.value.includes('❌') ? 'text-[#ff4d6d]' : row.value.includes('FREE') ? 'text-[#39d98a]' : 'text-[#e8e8f0]'}>
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Buy Extra Credits */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
          <h2 className="text-base font-black mb-2 flex items-center gap-2">
            <span className="w-1 h-4 bg-[#f0c040] rounded block" />
            Buy Extra Credits
          </h2>
          <p className="text-xs font-mono text-[#6b6b85] mb-6">
            ₹2 per credit · Minimum 25 credits · Never expire
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { credits: 25, price: 50, popular: false },
              { credits: 50, price: 100, popular: true },
              { credits: 100, price: 200, popular: false },
              { credits: 250, price: 500, popular: false }
            ].map((pack, i) => (
              <button
                key={i}
                onClick={() => handleBuyCredits(pack.credits)}
                disabled={loading === 'credits'}
                className={`relative bg-[#16161f] border rounded-xl p-4 hover:border-[#f0c040] transition-all text-left disabled:opacity-40 ${pack.popular ? 'border-[#f0c040]' : 'border-[#1e1e2e]'}`}
              >
                {pack.popular && (
                  <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 text-[10px] font-black bg-[#f0c040] text-black px-2 py-0.5 rounded-full">
                    POPULAR
                  </div>
                )}
                <div className="text-xl font-black text-[#f0c040] mb-1">{pack.credits}</div>
                <div className="text-xs font-mono text-[#6b6b85]">credits</div>
                <div className="text-base font-black mt-3">₹{pack.price}</div>
                <div className="text-[10px] font-mono text-[#6b6b85]">₹2/credit</div>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
