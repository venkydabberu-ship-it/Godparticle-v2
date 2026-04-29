import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function Pricing() {
  const { user, profile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Handle return from Cashfree payment (?order_id=xxx)
  useEffect(() => {
    const params  = new URLSearchParams(window.location.search);
    const orderId = params.get('order_id');
    if (!orderId) return;

    const savedPlan    = localStorage.getItem('cf_plan')    || sessionStorage.getItem('cf_plan');
    const savedCredits = localStorage.getItem('cf_credits') || sessionStorage.getItem('cf_credits');

    setLoading('verifying');
    window.history.replaceState({}, '', window.location.pathname);

    const verifyBody: any = { action: 'verify_payment', order_id: orderId };
    if (savedPlan)    verifyBody.plan    = savedPlan;
    if (savedCredits) verifyBody.credits = parseInt(savedCredits);

    supabase.functions
      .invoke('activate-plan', { body: verifyBody })
      .then(({ data, error: fnErr }) => {
        localStorage.removeItem('cf_plan');    sessionStorage.removeItem('cf_plan');
        localStorage.removeItem('cf_credits'); sessionStorage.removeItem('cf_credits');
        if (fnErr || !data?.success) {
          setError('Payment received but activation failed. Order: ' + orderId + '. Contact support.');
        } else if (savedPlan) {
          setSuccess(savedPlan + ' plan activated! Valid for 28 days. Welcome to God Particle!');
          refreshProfile();
        } else {
          setSuccess((savedCredits ?? '?') + ' credits added to your account!');
          refreshProfile();
        }
        setLoading('');
      });
  }, []);

  // ── Buy a plan (one-time, 28 days) ──
  async function handleBuyPlan(planKey: string, amount: number) {
    setLoading(planKey);
    setError('');
    setSuccess('');
    try {
      const returnUrl = window.location.origin + '/pricing?order_id={order_id}';
      const { data: orderData, error: orderErr } = await supabase.functions.invoke('activate-plan', {
        body: {
          action:     'create_order',
          amount,
          email:      profile?.username ?? '',
          phone:      (profile as any)?.phone ?? '9999999999',
          return_url: returnUrl,
        },
      });
      if (orderErr || !orderData?.payment_session_id) {
        throw new Error(orderErr?.message || orderData?.error || 'Could not create payment order');
      }

      localStorage.setItem('cf_plan', planKey);
      sessionStorage.setItem('cf_plan', planKey);

      const cashfree = (window as any).Cashfree({ mode: 'production' });
      const result = await cashfree.checkout({
        paymentSessionId: orderData.payment_session_id,
        redirectTarget:   '_modal',
      });

      if (result?.redirect) return;

      if (result?.error) {
        localStorage.removeItem('cf_plan'); sessionStorage.removeItem('cf_plan');
        throw new Error(result.error.message || 'Payment was cancelled');
      }

      // Inline verification
      const { data: verifyData, error: verifyErr } = await supabase.functions.invoke('activate-plan', {
        body: { action: 'verify_payment', order_id: orderData.order_id, plan: planKey },
      });
      localStorage.removeItem('cf_plan'); sessionStorage.removeItem('cf_plan');
      if (verifyErr || !verifyData?.success) {
        throw new Error('Payment received but activation failed. Order: ' + orderData.order_id);
      }
      setSuccess(planKey + ' plan activated! Valid for 28 days.');
      await refreshProfile();
      // Send payment confirmation email (fire-and-forget)
      const PLAN_AMOUNTS: Record<string, number> = { Basic: 99, Premium: 299 };
      supabase.functions.invoke('send-email', {
        body: {
          template: 'payment_success',
          to: user?.email,
          data: {
            plan: planKey + ' Plan',
            amount: PLAN_AMOUNTS[planKey] ?? '',
            expires: verifyData?.expires_at ? new Date(verifyData.expires_at).toLocaleDateString('en-IN') : '28 days',
          },
        },
      }).catch(() => {});
    } catch (err: any) {
      setError(err.message || 'Payment failed. Please try again.');
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

      localStorage.setItem('cf_credits', String(credits));
      sessionStorage.setItem('cf_credits', String(credits));

      const cashfree = (window as any).Cashfree({ mode: 'production' });
      const result = await cashfree.checkout({
        paymentSessionId: orderData.payment_session_id,
        redirectTarget:   '_modal',
      });

      if (result?.redirect) return;

      if (result?.error) {
        localStorage.removeItem('cf_credits'); sessionStorage.removeItem('cf_credits');
        throw new Error(result.error.message || 'Payment was cancelled');
      }

      const { data: verifyData, error: verifyErr } = await supabase.functions.invoke('activate-plan', {
        body: { action: 'verify_payment', order_id: orderData.order_id, credits },
      });
      localStorage.removeItem('cf_credits'); sessionStorage.removeItem('cf_credits');
      if (verifyErr || !verifyData?.success) {
        throw new Error('Payment received but activation failed. Order: ' + orderData.order_id);
      }
      setSuccess(credits + ' credits added to your account!');
      await refreshProfile();
    } catch (err: any) {
      setError(err.message || 'Payment failed. Please try again.');
    }
    setLoading('');
  }

  const planExpiresAt = (profile as any)?.credits_reset_at
    ? new Date((profile as any).credits_reset_at)
    : null;
  const planActive = planExpiresAt && planExpiresAt > new Date();
  const daysLeft = planActive
    ? Math.ceil((planExpiresAt!.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;

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
        'Intraday Pivot (5 cr each)',
        'Nifty 50 index only',
        'Scenario matrix included',
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
      period: '28 days',
      credits: '150 credits on activation',
      color: '#f0c040',
      badge: 'POPULAR',
      features: [
        '150 credits valid for 28 days',
        'God Particle — 2 credits each',
        'All 7 indexes + Sensex',
        'Intraday Pivot — 5 credits each',
        'Zero to Hero — morning FREE',
        'Zero to Hero — analysis 10 cr',
        'Buy more credits anytime',
        'One-time payment — no autopay',
      ],
      current: profile?.role === 'basic' && planActive,
      planKey: 'Basic',
      amount: 99,
    },
    {
      name: 'Premium',
      price: '₹299',
      period: '28 days',
      credits: 'Unlimited — no credits needed',
      color: '#39d98a',
      badge: 'BEST VALUE',
      features: [
        'Everything unlimited for 28 days',
        'Zero to Hero — FREE always',
        'God Particle — FREE always',
        'Stock Intelligence — FREE',
        'Intraday Pivot — FREE always',
        'All 7 indexes + all stocks',
        'One-time payment — no autopay',
        'Priority support',
      ],
      current: (profile?.role === 'premium' || profile?.role === 'pro') && planActive,
      planKey: 'Premium',
      amount: 299,
    },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

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
          <Link to="/dashboard" className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040]">← Dashboard</Link>
        </div>
      </nav>

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-10">

        <div className="text-center mb-10">
          <h1 className="text-4xl font-black tracking-tight mb-3">
            Choose Your <span className="text-[#f0c040]">Plan</span>
          </h1>
          <p className="text-sm font-mono text-[#6b6b85] max-w-xl mx-auto">
            Like a mobile recharge — pay once, use for 28 days. No autopay. No surprises.
          </p>
        </div>

        {loading === 'verifying' && (
          <div className="bg-[#f0c040]/10 border border-[#f0c040]/30 rounded-xl px-4 py-3 text-sm font-mono text-[#f0c040] mb-6 text-center">
            ⏳ Verifying payment…
          </div>
        )}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm font-mono text-red-400 mb-6 text-center">{error}</div>
        )}
        {success && (
          <div className="bg-[#39d98a]/10 border border-[#39d98a]/30 rounded-xl px-4 py-3 text-sm font-mono text-[#39d98a] mb-6 text-center">{success}</div>
        )}

        {/* Active plan banner */}
        {planActive && profile?.role !== 'free' && (
          <div className="bg-[#39d98a]/10 border border-[#39d98a]/30 rounded-2xl px-5 py-4 mb-8 flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-sm font-bold text-[#39d98a]">
                ✓ Active — {profile?.role?.charAt(0).toUpperCase()}{profile?.role?.slice(1)} Plan
              </div>
              <div className="text-xs font-mono text-[#6b6b85] mt-0.5">
                {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining · Expires {planExpiresAt!.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </div>
            <div className="text-xs font-mono text-[#6b6b85] border border-[#1e1e2e] rounded-lg px-3 py-1.5">
              Renew below when it expires
            </div>
          </div>
        )}

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {plans.map((plan, i) => (
            <div
              key={i}
              className={`bg-[#111118] border rounded-2xl p-6 flex flex-col relative ${
                plan.name === 'Premium' ? 'border-[#39d98a] shadow-[0_0_30px_rgba(57,217,138,0.1)]' : 'border-[#1e1e2e]'
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 text-xs font-black px-3 py-1 rounded-full text-black"
                  style={{ background: plan.color }}>
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
                  ✓ Current Plan ({daysLeft}d left)
                </div>
              ) : plan.planKey !== 'free' ? (
                <button
                  onClick={() => handleBuyPlan(plan.planKey, plan.amount)}
                  disabled={!!loading}
                  className="w-full py-3 text-xs font-black rounded-xl transition-all disabled:opacity-40 hover:opacity-90"
                  style={{ background: plan.color, color: '#000' }}
                >
                  {loading === plan.planKey ? '⏳ Processing…' : `Buy ${plan.name} — ${plan.price} / 28 days`}
                </button>
              ) : null}

              {plan.planKey !== 'free' && (
                <div className="mt-2 text-[10px] font-mono text-[#6b6b85] text-center">
                  Pay via Google Pay / UPI / Card · No autopay
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
              { action: '⚛ God Particle Analysis', free: '2 credits', basic: '2 credits', premium: '✅ FREE' },
              { action: '⚡ Intraday Pivot Points',  free: '5 credits', basic: '5 credits', premium: '✅ FREE' },
              { action: '🚀 Z2H Trade',             free: '5 credits', basic: '5 credits', premium: '✅ FREE' },
              { action: '📈 Stock Intelligence',    free: '5 credits', basic: '5 credits', premium: '✅ FREE' },
              { action: '🔥 Trending Stocks',       free: '1 credit',  basic: '1 credit',  premium: '✅ FREE' },
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

        {/* Buy Extra Credits */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
          <h2 className="text-base font-black mb-2 flex items-center gap-2">
            <span className="w-1 h-4 bg-[#f0c040] rounded block" />
            Buy Extra Credits
          </h2>
          <p className="text-xs font-mono text-[#6b6b85] mb-6">
            For Free &amp; Basic users · Credits never expire · Use across all analyses
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
                disabled={!!loading}
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
                  {Math.floor(pack.credits / 5)} Z2H trades or {Math.floor(pack.credits / 2)} God Particle analyses
                </div>
              </button>
            ))}
          </div>
          <div className="mt-4 text-[10px] font-mono text-[#6b6b85] text-center">
            💡 Upgrade to Premium (₹299/28 days) for unlimited access — no credits needed
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-[#1e1e2e] text-center space-y-3">
          <div className="text-[10px] font-mono text-[#3a3a4a]">
            Payments processed securely by Cashfree Payments · UPI / Google Pay / Card
          </div>
          <div className="flex flex-wrap justify-center gap-4 text-[10px] font-mono text-[#3a3a4a]">
            <Link to="/terms" className="hover:text-[#6b6b85] transition-all">Terms &amp; Conditions</Link>
            <Link to="/privacy" className="hover:text-[#6b6b85] transition-all">Privacy Policy</Link>
            <Link to="/refund" className="hover:text-[#6b6b85] transition-all">Refund &amp; Cancellation Policy</Link>
          </div>
          <div className="text-[10px] font-mono text-[#3a3a4a]">
            © 2026 God Particle Intelligence · <a href="mailto:support@godparticle.life" className="hover:text-[#6b6b85] transition-all">support@godparticle.life</a>
          </div>
        </div>

      </div>
    </div>
  );
}
