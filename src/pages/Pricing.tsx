import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Pricing() {
  const { profile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handlePayment(plan: string, amount: number) {
    setLoading(plan);
    setError('');
    try {
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: amount * 100,
        currency: 'INR',
        name: 'God Particle',
        description: `${plan} Plan Subscription`,
        image: '',
        handler: async function(response: any) {
          setSuccess(`Payment successful! Payment ID: ${response.razorpay_payment_id}. Your plan will be upgraded shortly.`);
          await refreshProfile();
        },
        prefill: {
          email: profile?.username ?? '',
        },
        theme: {
          color: '#f0c040'
        }
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
          setSuccess(`Payment successful! ${credits} credits will be added to your account shortly. Payment ID: ${response.razorpay_payment_id}`);
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

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#1e1e2e]">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#f0c040] rounded-xl flex items-center justify-center text-lg">⚛</div>
          <div className="font-bold text-base">God Particle</div>
        </Link>
        <Link to="/dashboard" className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040]">
          ← Dashboard
        </Link>
      </nav>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-10">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-black tracking-tight mb-3">
            Choose Your <span className="text-[#f0c040]">Plan</span>
          </h1>
          <p className="text-sm font-mono text-[#6b6b85]">
            Current plan: <span className="text-[#f0c040] font-bold uppercase">{profile?.role}</span>
            &nbsp;·&nbsp;
            Credits: <span className="text-[#f0c040] font-bold">
              {profile?.role === 'premium' ? '∞' : profile?.credits ?? 0}
            </span>
          </p>
        </div>

        {error && (
          <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-xl px-4 py-3 text-sm font-mono text-[#ff4d6d] mb-6 text-center">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-[#39d98a]/10 border border-[#39d98a]/30 rounded-xl px-4 py-3 text-sm font-mono text-[#39d98a] mb-6 text-center">
            {success}
          </div>
        )}

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {[
            {
              name: 'Free',
              price: '₹0',
              period: 'forever',
              credits: '50 credits',
              color: '#6b6b85',
              features: [
                '50 free credits on signup',
                '25 analyses total',
                'Nifty 50 analysis only',
                'Full God Particle framework',
                'Scenario matrix',
                'Instagram captions'
              ],
              current: profile?.role === 'free',
              action: null
            },
            {
              name: 'Basic',
              price: '₹100',
              period: 'per month',
              credits: '100 credits/month',
              color: '#f0c040',
              features: [
                '100 credits every month',
                '50 analyses per month',
                'Nifty 50 + Sensex',
                'Upload Sensex CSV data',
                'Full God Particle framework',
                'Priority support'
              ],
              current: profile?.role === 'basic',
              action: () => handlePayment('basic', 100)
            },
            {
              name: 'Premium',
              price: '₹300',
              period: 'per month',
              credits: 'Unlimited',
              color: '#39d98a',
              features: [
                'Unlimited credits',
                'Unlimited analyses',
                'All indexes',
                'BankNifty, FinNifty',
                'MidCap Nifty',
                'Upload all index data',
                'Priority support'
              ],
              current: profile?.role === 'premium',
              action: () => handlePayment('premium', 300)
            }
          ].map((plan, i) => (
            <div
              key={i}
              className={`bg-[#111118] border rounded-2xl p-6 flex flex-col ${
                i === 1
                  ? 'border-[#f0c040] shadow-[0_0_30px_rgba(240,192,64,0.1)]'
                  : 'border-[#1e1e2e]'
              }`}
            >
              {i === 1 && (
                <div className="text-xs font-mono text-black bg-[#f0c040] rounded-full px-3 py-1 w-fit mb-4 font-bold">
                  MOST POPULAR
                </div>
              )}
              <div className="font-black text-xl mb-1" style={{ color: plan.color }}>
                {plan.name}
              </div>
              <div className="text-3xl font-black mb-1">{plan.price}</div>
              <div className="text-xs font-mono text-[#6b6b85] mb-2">{plan.period}</div>
              <div className="text-xs font-mono mb-6" style={{ color: plan.color }}>
                {plan.credits}
              </div>
              <ul className="space-y-2 mb-8 flex-1">
                {plan.features.map((f, j) => (
                  <li key={j} className="text-xs font-mono text-[#6b6b85] flex items-start gap-2">
                    <span style={{ color: plan.color }} className="mt-0.5">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              {plan.current ? (
                <div className="w-full py-2.5 text-center text-xs font-bold border border-[#1e1e2e] rounded-xl text-[#6b6b85]">
                  Current Plan
                </div>
              ) : plan.action ? (
                <button
                  onClick={plan.action}
                  disabled={loading === plan.name.toLowerCase()}
                  className="w-full py-2.5 text-xs font-black rounded-xl transition-all disabled:opacity-40"
                  style={{
                    background: plan.color,
                    color: '#000'
                  }}
                >
                  {loading === plan.name.toLowerCase() ? '⏳ Processing...' : `Subscribe — ${plan.price}/month`}
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {/* Buy Extra Credits */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6">
          <h2 className="text-base font-black mb-2 flex items-center gap-2">
            <span className="w-1 h-4 bg-[#f0c040] rounded block" />
            Buy Extra Credits
          </h2>
          <p className="text-xs font-mono text-[#6b6b85] mb-6">
            ₹2 per credit · Minimum 25 credits · Use anytime
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { credits: 25, price: 50 },
              { credits: 50, price: 100 },
              { credits: 100, price: 200 },
              { credits: 250, price: 500 }
            ].map((pack, i) => (
              <button
                key={i}
                onClick={() => handleBuyCredits(pack.credits)}
                disabled={loading === 'credits'}
                className="bg-[#16161f] border border-[#1e1e2e] rounded-xl p-4 hover:border-[#f0c040] transition-all text-left disabled:opacity-40"
              >
                <div className="text-lg font-black text-[#f0c040] mb-1">
                  {pack.credits}
                </div>
                <div className="text-xs font-mono text-[#6b6b85]">credits</div>
                <div className="text-sm font-black mt-2">₹{pack.price}</div>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}