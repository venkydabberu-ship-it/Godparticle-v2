import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">

      {/* Grid background */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 border-b border-[#1e1e2e]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#f0c040] rounded-xl flex items-center justify-center text-xl shadow-[0_0_20px_rgba(240,192,64,0.3)]">
            ⚛
          </div>
          <div>
            <div className="font-bold text-lg tracking-tight">God Particle</div>
            <div className="text-[10px] text-[#6b6b85] font-mono tracking-widest">NIFTY INTELLIGENCE</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="px-4 py-2 text-sm font-bold text-[#e8e8f0] border border-[#1e1e2e] rounded-lg hover:border-[#f0c040] hover:text-[#f0c040] transition-all"
          >
            Login
          </Link>
          <Link
            to="/signup"
            className="px-4 py-2 text-sm font-bold bg-[#f0c040] text-black rounded-lg hover:bg-[#ffd060] transition-all shadow-[0_0_20px_rgba(240,192,64,0.2)]"
          >
            Get Started Free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="relative z-10 max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-[#111118] border border-[#1e1e2e] rounded-full px-4 py-2 text-xs font-mono text-[#f0c040] mb-8">
          <span className="w-2 h-2 bg-[#39d98a] rounded-full animate-pulse" />
          Live Options Intelligence Platform
        </div>

        <h1 className="text-5xl md:text-6xl font-black tracking-tight mb-6 leading-tight">
          Decode the
          <span className="text-[#f0c040]"> God Particle</span>
          <br />of Options Markets
        </h1>

        <p className="text-lg text-[#6b6b85] font-mono mb-10 max-w-2xl mx-auto leading-relaxed">
          The only platform that reveals the hidden PCB — Position Cost Basis —
          the true driving force behind Nifty 50 options market participant behavior.
        </p>

        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link
            to="/signup"
            className="px-8 py-4 bg-[#f0c040] text-black font-black rounded-xl hover:bg-[#ffd060] transition-all shadow-[0_0_30px_rgba(240,192,64,0.3)] text-lg"
          >
            ⚛ Start Free — 50 Credits
          </Link>
          <Link
            to="/login"
            className="px-8 py-4 border border-[#1e1e2e] text-[#e8e8f0] font-bold rounded-xl hover:border-[#f0c040] transition-all text-lg"
          >
            Login →
          </Link>
        </div>
      </div>

      {/* Features */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: '🔬',
              title: 'Volume Decomposition',
              desc: 'Separate new opens from square-offs. Know exactly who is entering and who is exiting.'
            },
            {
              icon: '⚛',
              title: 'God Particle (PCB)',
              desc: 'Position Cost Basis — the weighted average price of all new positions. The hidden magnet.'
            },
            {
              icon: '🎯',
              title: 'Next Day Scenarios',
              desc: 'Gap Up, Flat, Gap Down scenarios with precise entry, target and stop loss levels.'
            }
          ].map((f, i) => (
            <div key={i} className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 hover:border-[#f0c040] transition-all">
              <div className="text-3xl mb-4">{f.icon}</div>
              <div className="font-bold text-base mb-2">{f.title}</div>
              <div className="text-sm text-[#6b6b85] font-mono leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing Preview */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-black text-center mb-12">
          Simple <span className="text-[#f0c040]">Pricing</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              name: 'Free',
              price: '₹0',
              credits: '50 credits',
              color: '#6b6b85',
              features: ['50 free credits', '25 analyses', 'Nifty 50 analysis', 'God Particle framework']
            },
            {
              name: 'Basic',
              price: '₹100',
              credits: '100 credits/month',
              color: '#f0c040',
              features: ['100 credits/month', 'Nifty 50 + Sensex', 'Upload Sensex data', 'Priority support']
            },
            {
              name: 'Premium',
              price: '₹300',
              credits: 'Unlimited',
              color: '#39d98a',
              features: ['Unlimited credits', 'All indexes', 'BankNifty, FinNifty', 'MidCap Nifty']
            }
          ].map((p, i) => (
            <div key={i} className={`bg-[#111118] border rounded-2xl p-6 ${i === 1 ? 'border-[#f0c040] shadow-[0_0_30px_rgba(240,192,64,0.1)]' : 'border-[#1e1e2e]'}`}>
              <div className="font-black text-xl mb-1" style={{ color: p.color }}>{p.name}</div>
              <div className="text-3xl font-black mb-1">{p.price}</div>
              <div className="text-xs font-mono text-[#6b6b85] mb-6">{p.credits}</div>
              <ul className="space-y-2">
                {p.features.map((f, j) => (
                  <li key={j} className="text-sm font-mono text-[#6b6b85] flex items-center gap-2">
                    <span style={{ color: p.color }}>✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[#1e1e2e] px-6 py-8 text-center">
        <div className="text-sm font-mono text-[#6b6b85]">
          © 2026 God Particle — Pure Option Buyer Intelligence
        </div>
      </footer>

    </div>
  );
}