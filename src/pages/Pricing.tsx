import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function Pricing() {
  const { profile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Handle return from Cashfree subscription flow (?sub_id=xxx)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const subId  = params.get('sub_id');
    const orderId = params.get('order_id');

    if (subId) {
      setLoading('verifying');
      window.history.replaceState({}, '', window.location.pathname);
      supabase.functions
        .invoke('activate-plan', { body: { action: 'verify_subscription', subscription_id: subId } })
        .then(({ data, error: fnErr }) => {
          if (fnErr || !data?.success) {
            setError('Subscription pending. If you completed UPI setup, it activates within minutes. Sub ID: ' + subId);
          } else {
            setSuccess('Subscription activated! Welcome to God Particle ' + (profile?.subscription_plan ?? '') + '.');
            refreshProfile();
          }
          setLoading('');
        });
      return;
    }

    if (orderId) {
      const savedCredits = sessionStorage.getItem('cf_credits');
      setLoading('credits');
      window.history.replaceState({}, '', window.location.pathname);
      supabase.functions
        .invoke('activate-plan', { body: { action: 'verify_payment', order_id: orderId, credits: savedCredits ? parseInt(savedCredits) : 0 } })
        .then(({ data, error: fnErr }) => {
          sessionStorage.removeItem('cf_credits');
          if (fnErr || !data?.success) {
            setError('Payment received but activation failed. Order ID: ' + orderId + '. Contact support.');
          } else {
            setSuccess((savedCredits ?? '?') + ' credits added to your account!');
            refreshProfile();
          }
          setLoading('');
        });
    }
  }, []);

  // ── Subscribe to a plan (UPI AutoPay mandate) ──
  async function handleSubscribe(plan: string) {
    setLoading(plan);
    setError('');
    setSuccess('');
    try {
      const returnUrl = window.location.origin + '/pricing';
      const { data, error: fnErr } = await supabase.functions.invoke('activate-plan', {
        body: {
          action:     'create_subscription',
          plan,
          email:      profile?.username ?? '',
          phone:      (profile as any)?.phone ?? '9999999999',
          return_url: returnUrl,
        },
      });
      if (fnErr || !data?.subscribe_url) {
        throw new Error(fnErr?.message || data?.error || 'Could not create subscription');
      }
      // Redirect to Cashfree UPI mandate page
      window.location.href = data.subscribe_url;
    } catch (err: any) {
      setError(err.message || 'Subscription failed. Please try again.');
      setLoading('');
    }
  }

  // ── Cancel subscription ──
  async function handleCancel() {
    if (!confirm('Cancel your subscription? You will lose access at end of current period.')) return;
    setLoading('cancel');
    setError('');
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('activate-plan', {
        body: { action: 'cancel_subscription' },
      });
      if (fnErr || !data?.success) throw new Error(fnErr?.message || data?.error || 'Cancel failed');
      setSuccess('Subscription cancelled. Access continues until period end.');
      refreshProfile();
    } catch (err: any) {
      setError(err.message || 'Cancel failed. Please try again.');
    }
    setLoading('');
  }

  // ── Buy extra credits (one-time) ──
  async function handleBuyCredits(credits: number, price: number) {
    setLoading('credits');
    setError('');
    setSuccess('');
    try {
      const returnUrl = window.location.origin + '/pricing?order_id={order_id}';
      const { data: orderData, error: orderErr } = await supabase.functions.invoke('activate-plan', {
        body: {
          action:     'create_order',
          amount:     price,
          email:      profile?.username ?? '',
          phone:      (profile as any)?.phone ?? '9999999999',
          return_url: returnUrl,
        },
      });
      if (orderErr || !orderData?.payment_session_id) {
        throw new Error(orderErr?.message || orderData?.error || 'Could not create payment order');
      }

      sessionStorage.setItem('cf_credits', String(credits));

      const cashfree = (window as any).Cashfree({ mode: 'production' });
      const result = await cashfree.checkout({
        paymentSessionId: orderData.payment_session_id,
        redirectTarget:   '_modal',
      });

      if (result?.redirect) return; // UPI redirect → page reloads → useEffect handles verification

      if (result?.error) {
        sessionStorage.removeItem('cf_credits');
        throw new Error(result.error.message || 'Payment was cancelled');
      }

      // Inline verification (non-redirect flow)
      const { data: verifyData, error: verifyErr } = await supabase.functions.invoke('activate-plan', {
        body: { action: 'verify_payment', order_id: orderData.order_id, credits },
      });
      sessionStorage.removeItem('cf_credits');
      if (verifyErr || !verifyData?.success) {
        throw new Error('Payment received but activation failed. Order ID: ' + orderData.order_id);
      }
      setSuccess(credits + ' credits added to your account!');
      await refreshProfile();
    } catch (err: any) {
      setError(err.message || 'Payment failed. Please try again.');
    }
    setLoading('');
  }

  const isSubscribed = ['ACTIVE', 'INITIALIZED', 'ON_HOLD'].includes((profile as any)?.subscription_status ?? '');

  const plans = [
    {
      name: 'Free',
      price: '₹0',
      period: 'forever',
      credits: '50 credits on signup',
      color: '#6b6b85',
      badge: null,
      features: [
        '50 one-time credits on signup',
        'God Particle analysis (2 cr each)',
        'Nifty 50 only',
        'Scenario matrix',
        'Zero to Hero — locked 🔒',
        'Stock Intelligence — locked 🔒',
      ],
      current: profile?.role === 'free',
      planKey: 'free',
      amount: 0,
    },
    {
      name: 'Basic',
      price: '₹99',
      period: 'per month',
      credits: '100 credits / month',
      color: '#f0c040',
      badge: 'POPULAR',
      features: [
        '100 credits every month (auto-renewed)',
        'God Particle — 2 credits each',
        'All 7 indexes + Sensex',
        'Zero to Hero — morning FREE',
        'Zero to Hero — analysis 10 cr',
        'Credits carry forward forever',
        'Top-up anytime',
      ],
      current: profile?.role === 'basic',
      planKey: 'Basic',
      amount: 99,
    },
    {
      name: 'Premium',
      price: '₹299',
      period: 'per month',
      credits: 'Unlimited — no credits needed',
      color: '#39d98a',
      badge: 'BEST VALUE',
      features: [
        'Everything unlimited — no limits',
        'Zero to Hero — FREE always',
        'God Particle — FREE always',
        'Stock Intelligence — FREE',
        'All 7 indexes + all stocks',
        'Admin pre-loads data for you',
        'Priority support',
        'Early access to new features',
      ],
      current: profile?.role === 'premium' || profile?.role === 'pro',
      planKey: 'Premium',
      amount: 299,
    },
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
            Credits: <span className="text-[#f0c040] font-bold">{['premium','pro','admin'].includes(profile?.role ?? '') ? '∞' : profile?.credits ?? 0}</span>
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

        {loading === 'verifying' && (
          <div className="bg-[#f0c040]/10 border border-[#f0c040]/30 rounded-xl px-4 py-3 text-sm font-mono text-[#f0c040] mb-6 text-center">
            ⏳ Verifying subscription…
          </div>
        )}

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

        {/* Active subscription banner */}
        {isSubscribed && (
          <div className="bg-[#39d98a]/10 border border-[#39d98a]/30 rounded-2xl px-5 py-4 mb-8 flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-sm font-bold text-[#39d98a]">
                ✓ Active Subscription — {(profile as any)?.subscription_plan} Plan
              </div>
              <div className="text-xs font-mono text-[#6b6b85] mt-0.5">
                Status: {(profile as any)?.subscription_status}
                {(profile as any)?.subscription_next_billing
                  ? '  ·  Next billing: ' + new Date((profile as any).subscription_next_billing).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                  : ''}
              </div>
            </div>
            <button
              onClick={handleCancel}
              disabled={loading === 'cancel'}
              className="text-xs font-mono text-red-400 border border-red-500/30 rounded-lg px-3 py-1.5 hover:bg-red-500/10 transition-all disabled:opacity-40"
            >
              {loading === 'cancel' ? '⏳ Cancelling…' : 'Cancel Subscription'}
            </button>
          </div>
        )}

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {plans.map((plan, i) => (
            <div
              key={i}
              className={`bg-[#111118] border rounded-2xl p-6 flex flex-col relative ${
                plan.name === 'Premium'
                  ? 'border-[#39d98a] shadow-[0_0_30px_rgba(57,217,138,0.1)]'
                  : 'border-[#1e1e2e]'
              }`}
            >
              {plan.badge && (
                <div
                  className="absolute -top-3 left-1/2 transform -translate-x-1/2 text-xs font-black px-3 py-1 rounded-full text-black"
                  style={{ background: plan.color }}
                >
                  {plan.badge}
                </div>
              )}

              <div className="font-black text-xl mb-1" style={{ color: plan.color }}>{plan.name}</div>
              <div className="text-3xl font-black mb-1">{plan.price}</div>
              <div className="text-xs font-mono text-[#6b6b85] mb-2">{plan.period}</div>
              <div className="text-xs font-mono mb-6" style={{ color: plan.color }}>{plan.credits}</div>

              <ul className="space-y-2 mb-8 flex-1">
                {plan.features.map((f, j) => (
                  <li key={j} className="text-xs font-mono text-[#6b6b85] flex items-start gap-2">
                    <span style={{ color: plan.color }} className="mt-0.5 shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              {plan.current ? (
                <div className="w-full py-2.5 text-center text-xs font-bold border border-[#1e1e2e] rounded-xl text-[#6b6b85]">
                  ✓ Current Plan
                </div>
              ) : plan.planKey !== 'free' ? (
                <button
                  onClick={() => handleSubscribe(plan.planKey)}
                  disabled={loading === plan.planKey}
                  className="w-full py-2.5 text-xs font-black rounded-xl transition-all disabled:opacity-40 hover:opacity-90"
                  style={{ background: plan.color, color: '#000' }}
                >
                  {loading === plan.planKey ? '⏳ Processing…' : `Subscribe — ${plan.price}/mo`}
                </button>
              ) : null}

              {plan.planKey !== 'free' && (
                <div className="mt-2 text-[10px] font-mono text-[#6b6b85] text-center">
                  Auto-deducted monthly via UPI AutoPay
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Credit usage guide */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 mb-8">
          <h2 className="text-base font-black mb-6 flex items-center gap-2">
            <span className="w-1 h-4 bg-[#f0c040] rounded block" />
            Credit Usage Guide
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                action:  '⚛ God Particle Analysis',
                free:    '2 credits',
                basic:   '2 credits',
                premium: '✅ FREE (unlimited)',
              },
              {
                action:  '🚀 Z2H Morning Snapshot',
                free:    '❌ Not available',
                basic:   '✅ FREE always',
                premium: '✅ FREE always',
              },
              {
                action:  '📊 Z2H Analysis Snapshot',
                free:    '❌ Not available',
                basic:   '10 credits',
                premium: '✅ FREE (unlimited)',
              },
            ].map((item, i) => (
              <div key={i} className="bg-[#16161f] rounded-xl p-4">
                <div className="text-sm font-bold mb-3 text-[#f0c040]">{item.action}</div>
                <div className="space-y-2">
                  {[
                    { plan: 'Free',    value: item.free    },
                    { plan: 'Basic',   value: item.basic   },
                    { plan: 'Premium', value: item.premium },
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

        {/* Buy Extra Credits — Basic users only */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
          <h2 className="text-base font-black mb-2 flex items-center gap-2">
            <span className="w-1 h-4 bg-[#f0c040] rounded block" />
            Buy Extra Credits
          </h2>
          <p className="text-xs font-mono text-[#6b6b85] mb-6">
            For Basic plan users · Credits never expire · Use across all analyses
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { credits: 60,  price: 49,  bonus: '+10 free',  popular: false },
              { credits: 140, price: 99,  bonus: '+40 free',  popular: true  },
              { credits: 320, price: 199, bonus: '+120 free', popular: false },
            ].map((pack, i) => (
              <button
                key={i}
                onClick={() => handleBuyCredits(pack.credits, pack.price)}
                disabled={loading === 'credits'}
                className={`relative bg-[#16161f] border rounded-xl p-5 hover:border-[#f0c040] transition-all text-left disabled:opacity-40 ${pack.popular ? 'border-[#f0c040]' : 'border-[#1e1e2e]'}`}
              >
                {pack.popular && (
                  <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 text-[10px] font-black bg-[#f0c040] text-black px-2 py-0.5 rounded-full">
                    BEST VALUE
                  </div>
                )}
                <div className="text-2xl font-black text-[#f0c040] mb-0.5">{pack.credits} credits</div>
                <div className="text-xs font-mono text-[#39d98a] mb-3">{pack.bonus}</div>
                <div className="text-xl font-black">₹{pack.price}</div>
                <div className="text-[10px] font-mono text-[#6b6b85] mt-1">
                  = {Math.floor(pack.credits / 10)} Z2H analyses or {Math.floor(pack.credits / 2)} God Particle analyses
                </div>
              </button>
            ))}
          </div>
          <div className="mt-4 text-[10px] font-mono text-[#6b6b85] text-center">
            💡 Upgrade to Premium (₹299/mo) for unlimited access — no credits needed ever
          </div>
        </div>

        {/* Policy footer — required for Cashfree compliance */}
        <div className="mt-10 pt-6 border-t border-[#1e1e2e] text-center space-y-3">
          <div className="text-[10px] font-mono text-[#3a3a4a]">
            Payments processed securely by Cashfree Payments · UPI AutoPay / eNACH
          </div>
          <div className="flex flex-wrap justify-center gap-4 text-[10px] font-mono text-[#3a3a4a]">
            <Link to="/terms" className="hover:text-[#6b6b85] transition-all">Terms &amp; Conditions</Link>
            <Link to="/privacy" className="hover:text-[#6b6b85] transition-all">Privacy Policy</Link>
            <Link to="/refund" className="hover:text-[#6b6b85] transition-all">Refund &amp; Cancellation Policy</Link>
          </div>
          <div className="text-[10px] font-mono text-[#3a3a4a]">
            © 2026 God Particle Intelligence · <a href="mailto:supportgodparticle.app@gmail.com" className="hover:text-[#6b6b85] transition-all">supportgodparticle.app@gmail.com</a>
          </div>
        </div>

      </div>
    </div>
  );
}
