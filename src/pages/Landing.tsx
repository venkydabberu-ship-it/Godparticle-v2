import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Landing() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [subscriberCount, setSubscriberCount] = useState('2600+');

  // Fetch subscriber count from admin settings
  useEffect(() => {
    supabase.from('admin_settings')
      .select('value')
      .eq('key', 'subscriber_count')
      .single()
      .then(({ data }) => {
        if (data?.value) setSubscriberCount(data.value);
      });
  }, []);

  // Floating particles animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: any[] = [];
    const connections: any[] = [];

    // Create particles
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.5 + 0.2
      });
    }

    let animId: number;

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(240,192,64,${0.15 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw particles
      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(240,192,64,${p.opacity})`;
        ctx.fill();

        // Move
        p.x += p.vx;
        p.y += p.vy;

        // Bounce
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      });

      animId = requestAnimationFrame(draw);
    }

    draw();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0] overflow-x-hidden">

      {/* Particle Canvas */}
      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />

      {/* Grid overlay */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.02)_1px,transparent_1px)] bg-[size:60px_60px] pointer-events-none z-0" />

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5 border-b border-[#1e1e2e]/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#f0c040] rounded-xl flex items-center justify-center text-lg font-black">⚛</div>
          <div className="font-black text-lg tracking-tight">God Particle</div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040] transition-all px-4 py-2">
            Sign In
          </Link>
          <Link to="/signup" className="bg-[#f0c040] text-black text-xs font-black px-5 py-2.5 rounded-xl hover:bg-[#ffd060] transition-all">
            Start Free →
          </Link>
        </div>
      </nav>

      {/* SECTION 1 — MAIN */}
      <section className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 text-center py-20">

        {/* Subscriber badge */}
        <div className="inline-flex items-center gap-2 bg-[#f0c040]/10 border border-[#f0c040]/20 rounded-full px-4 py-2 text-xs font-mono text-[#f0c040] mb-8">
          <div className="w-1.5 h-1.5 bg-[#39d98a] rounded-full animate-pulse" />
          {subscriberCount} traders already inside
        </div>

        {/* Main tagline */}
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight mb-6 max-w-4xl leading-tight">
          The Algorithm
          <br />
          <span className="text-[#f0c040]">The Market Doesn't</span>
          <br />
          Want You To Have
        </h1>

        <p className="text-sm md:text-base font-mono text-[#6b6b85] max-w-xl mb-4 leading-relaxed">
          Discovered through advanced AI research and validated across millions of institutional data points.
          What took decades to understand — decoded into a single equation.
        </p>

        <p className="text-xs font-mono text-[#f0c040]/60 mb-10 tracking-widest uppercase">
          ⚛ Proprietary · Classified · Not Available Anywhere Else
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mb-16">
          <Link to="/signup" className="bg-[#f0c040] text-black font-black px-8 py-4 rounded-xl hover:bg-[#ffd060] transition-all text-sm">
            Access God Particle — Free →
          </Link>
          <a href="#analysis-types" className="bg-[#111118] border border-[#1e1e2e] text-[#e8e8f0] font-bold px-8 py-4 rounded-xl hover:border-[#f0c040] transition-all text-sm">
            See What's Inside
          </a>
        </div>

        {/* 3 Mystery Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl w-full">
          {[
            {
              icon: '⚛',
              name: 'God Particle',
              tagline: 'The God Particle of Options',
              desc: 'A proprietary metric discovered through deep AI research that reveals where institutional money is truly anchored. Not available in any trading platform.',
              badge: 'All Plans',
              color: '#f0c040'
            },
            {
              icon: '🎯',
              name: 'Zero To Hero',
              tagline: 'Expiry Day Intelligence',
              desc: 'Fully automated signal engine that runs on expiry days. 5 forces align to identify explosive OTM options before they move. Zero human intervention.',
              badge: 'Premium+',
              color: '#39d98a'
            },
            {
              icon: '📊',
              name: 'Stock Intelligence',
              tagline: 'Gravitational Cost Theory',
              desc: 'Identifies the exact price levels where institutional gravity is strongest in any large-cap stock. Know WHERE to buy before the crowd does.',
              badge: 'Premium+',
              color: '#4d9fff'
            }
          ].map((item, i) => (
            <div key={i} className="bg-[#111118]/80 backdrop-blur border border-[#1e1e2e] rounded-2xl p-6 text-left hover:border-[#f0c040]/30 transition-all group">
              <div className="flex items-center justify-between mb-4">
                <div className="text-2xl">{item.icon}</div>
                <div className="text-[10px] font-black px-2 py-1 rounded-full"
                  style={{ background: `${item.color}20`, color: item.color }}>
                  {item.badge}
                </div>
              </div>
              <div className="font-black text-sm mb-1" style={{ color: item.color }}>{item.name}</div>
              <div className="text-xs font-mono text-[#e8e8f0] mb-3 font-bold">{item.tagline}</div>
              <div className="text-xs font-mono text-[#6b6b85] leading-relaxed">{item.desc}</div>
            </div>
          ))}
        </div>

        {/* Scroll indicator */}
        <div className="mt-16 flex flex-col items-center gap-2 text-[#6b6b85]">
          <div className="text-xs font-mono">Scroll to explore</div>
          <div className="w-px h-8 bg-gradient-to-b from-[#6b6b85] to-transparent" />
        </div>
      </section>

      {/* SECTION 2 — ANALYSIS TYPES */}
      <section id="analysis-types" className="relative z-10 px-6 md:px-12 py-20 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="text-xs font-mono text-[#f0c040] tracking-widest uppercase mb-3">
            ⚛ Proprietary Research
          </div>
          <h2 className="text-3xl md:text-4xl font-black mb-4">
            Three Layers of
            <span className="text-[#f0c040]"> Market Intelligence</span>
          </h2>
          <p className="text-sm font-mono text-[#6b6b85] max-w-xl mx-auto">
            Each layer uses a different proprietary algorithm. The formula is classified.
            The results speak for themselves.
          </p>
        </div>

        <div className="space-y-6">
          {[
            {
              icon: '⚛',
              name: 'God Particle Analysis',
              subtitle: 'Position Cost Basis Intelligence',
              points: [
                'Reveals the true cost basis of institutional option writers',
                'Identifies the exact price level that acts as gravitational center',
                'Works on any option strike — indices or stocks',
                'Generates scenario-based entry matrix for next trading session'
              ],
              color: '#f0c040',
              access: 'Available on all plans'
            },
            {
              icon: '🎯',
              name: 'Zero To Hero',
              subtitle: 'Expiry Day Explosive Signal Engine',
              points: [
                'Fully automated — runs every Tuesday (Nifty) and Thursday (Sensex)',
                '5 proprietary forces analysed simultaneously at 11:30 AM',
                'Identifies deeply OTM options with explosive potential',
                'Email alert sent automatically when signal fires'
              ],
              color: '#39d98a',
              access: 'Premium and Pro plans only'
            },
            {
              icon: '📊',
              name: 'Stock Intelligence (GCT)',
              subtitle: 'Gravitational Cost Theory',
              points: [
                'Calculates the Monthly Gravitational Core of any large-cap stock',
                'Identifies 5 crash buying levels with allocation percentages',
                'Combines technical gravity with fundamental safety score',
                'Auto-fetches company fundamentals — no manual entry needed'
              ],
              color: '#4d9fff',
              access: 'Premium and Pro plans only'
            }
          ].map((item, i) => (
            <div key={i} className="bg-[#111118]/80 backdrop-blur border border-[#1e1e2e] rounded-2xl p-8 flex flex-col md:flex-row gap-8 hover:border-opacity-50 transition-all"
              style={{ borderColor: `${item.color}20` }}>
              <div className="md:w-64 shrink-0">
                <div className="text-4xl mb-3">{item.icon}</div>
                <div className="font-black text-lg mb-1" style={{ color: item.color }}>{item.name}</div>
                <div className="text-xs font-mono text-[#6b6b85] mb-4">{item.subtitle}</div>
                <div className="text-[10px] font-mono px-3 py-1.5 rounded-full inline-block"
                  style={{ background: `${item.color}15`, color: item.color }}>
                  {item.access}
                </div>
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {item.points.map((point, j) => (
                  <div key={j} className="flex items-start gap-2 text-xs font-mono text-[#6b6b85]">
                    <span style={{ color: item.color }} className="shrink-0 mt-0.5">▸</span>
                    {point}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 3 — PRICING */}
      <section className="relative z-10 px-6 md:px-12 py-20">
        <div className="text-center mb-16">
          <div className="text-xs font-mono text-[#f0c040] tracking-widest uppercase mb-3">
            Simple Pricing
          </div>
          <h2 className="text-3xl md:text-4xl font-black mb-4">
            Choose Your Level of
            <span className="text-[#f0c040]"> Intelligence</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
          {[
            {
              name: 'Free',
              price: '₹0',
              period: 'forever',
              credits: '50 credits',
              color: '#6b6b85',
              features: ['God Particle Analysis', 'Nifty 50 only', '50 one-time credits'],
              cta: 'Start Free',
              highlight: false
            },
            {
              name: 'Basic',
              price: '₹100',
              period: '/month',
              credits: '50 credits/month',
              color: '#f0c040',
              features: ['God Particle Analysis', 'Nifty 50 + Sensex', '50 credits monthly'],
              cta: 'Get Basic',
              highlight: false
            },
            {
              name: 'Premium',
              price: '₹300',
              period: '/month',
              credits: '200 credits/month',
              color: '#39d98a',
              features: ['God Particle Analysis', 'Zero To Hero signals', 'Stock Intelligence', 'All indices + stocks', '200 credits monthly'],
              cta: 'Get Premium',
              highlight: true
            },
            {
              name: 'Pro',
              price: '₹2500',
              period: '/month',
              credits: '3000 credits/month',
              color: '#4d9fff',
              features: ['Everything in Premium', 'Auto stock data fetch', 'Priority support', 'Research PDF access', '3000 credits monthly'],
              cta: 'Get Pro',
              highlight: false
            }
          ].map((plan, i) => (
            <div key={i} className={`bg-[#111118] rounded-2xl p-6 flex flex-col relative ${plan.highlight ? 'border-2' : 'border border-[#1e1e2e]'}`}
              style={{ borderColor: plan.highlight ? plan.color : undefined }}>
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 text-[10px] font-black px-3 py-1 rounded-full text-black"
                  style={{ background: plan.color }}>
                  BEST VALUE
                </div>
              )}
              <div className="font-black text-lg mb-1" style={{ color: plan.color }}>{plan.name}</div>
              <div className="text-3xl font-black mb-0.5">{plan.price}</div>
              <div className="text-xs font-mono text-[#6b6b85] mb-1">{plan.period}</div>
              <div className="text-xs font-mono mb-6" style={{ color: plan.color }}>{plan.credits}</div>
              <ul className="space-y-2 mb-8 flex-1">
                {plan.features.map((f, j) => (
                  <li key={j} className="text-xs font-mono text-[#6b6b85] flex items-start gap-2">
                    <span style={{ color: plan.color }} className="shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link to="/signup"
                className="w-full py-2.5 text-xs font-black rounded-xl text-center transition-all hover:opacity-90"
                style={{ background: plan.color, color: plan.highlight ? '#000' : '#000' }}>
                {plan.cta} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 4 — SUBSCRIBER COUNT */}
      <section className="relative z-10 px-6 md:px-12 py-20">
        <div className="max-w-4xl mx-auto bg-[#111118]/80 backdrop-blur border border-[#f0c040]/20 rounded-3xl p-12 text-center">
          <div className="text-6xl md:text-8xl font-black text-[#f0c040] mb-3">
            {subscriberCount}
          </div>
          <div className="text-lg font-black mb-2">Traders Already Inside</div>
          <div className="text-sm font-mono text-[#6b6b85] mb-8">
            Join the community trading smarter with proprietary AI-powered analysis
          </div>
          <div className="flex items-center justify-center gap-8 mb-8">
            {['NSE', 'BSE', 'NIFTY 50', 'SENSEX'].map((exchange, i) => (
              <div key={i} className="text-xs font-black text-[#6b6b85] tracking-widest">{exchange}</div>
            ))}
          </div>
          <Link to="/signup"
            className="inline-block bg-[#f0c040] text-black font-black px-10 py-4 rounded-xl hover:bg-[#ffd060] transition-all text-sm">
            Join Now — It's Free →
          </Link>
        </div>
      </section>

      {/* SECTION 5 — FAQ */}
      <section className="relative z-10 px-6 md:px-12 py-20 max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-black mb-4">
            Frequently Asked
            <span className="text-[#f0c040]"> Questions</span>
          </h2>
        </div>
        <div className="space-y-3">
          {[
            {
              q: 'What is the God Particle?',
              a: 'God Particle is a proprietary metric developed through advanced AI research and institutional data analysis. It identifies the true cost basis of market participants at any option strike. The exact formula is classified and not disclosed.'
            },
            {
              q: 'How is this different from regular options analysis?',
              a: 'Standard tools show you price and OI. God Particle Intelligence reveals WHERE institutional money is anchored, WHEN positions are being built, and WHICH strikes have explosive potential. This is not available on any other platform.'
            },
            {
              q: 'What is Zero To Hero?',
              a: 'Zero To Hero is a fully automated signal engine that runs on every Nifty and Sensex expiry day. It analyses 5 proprietary forces simultaneously and identifies deeply OTM options with explosive potential. It runs without any human intervention.'
            },
            {
              q: 'Is this financial advice?',
              a: 'No. God Particle Intelligence is a research and analysis tool. All analysis is for educational purposes only. Please read the full disclaimer in the Terms section below.'
            },
            {
              q: 'Can I try it for free?',
              a: 'Yes. Free plan gives you 50 credits and access to God Particle Analysis for Nifty 50. No credit card required.'
            }
          ].map((faq, i) => (
            <FAQItem key={i} q={faq.q} a={faq.a} />
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-[#1e1e2e] px-6 md:px-12 py-10">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-start justify-between gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 bg-[#f0c040] rounded-lg flex items-center justify-center text-sm">⚛</div>
                <div className="font-black">God Particle</div>
              </div>
              <div className="text-xs font-mono text-[#6b6b85] max-w-xs">
                Proprietary AI-powered options analysis platform.
                Advanced research. Institutional intelligence. Classified methodology.
              </div>
            </div>
            <div className="grid grid-cols-2 gap-8">
              <div>
                <div className="text-xs font-black text-[#e8e8f0] uppercase tracking-widest mb-3">Platform</div>
                <div className="space-y-2">
                  {['God Particle', 'Zero To Hero', 'Stock Intelligence', 'Pricing'].map((item, i) => (
                    <div key={i} className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040] cursor-pointer transition-all">{item}</div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-black text-[#e8e8f0] uppercase tracking-widest mb-3">Account</div>
                <div className="space-y-2">
                  {[
                    { label: 'Sign In', to: '/login' },
                    { label: 'Sign Up Free', to: '/signup' },
                    { label: 'Dashboard', to: '/dashboard' }
                  ].map((item, i) => (
                    <Link key={i} to={item.to} className="block text-xs font-mono text-[#6b6b85] hover:text-[#f0c040] transition-all">{item.label}</Link>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* DISCLAIMER — Terms section (small, easy to miss) */}
          <div className="border-t border-[#1e1e2e] pt-6">
            <TermsSection />
          </div>

          <div className="mt-4 flex flex-col md:flex-row items-center justify-between gap-2">
            <div className="text-[10px] font-mono text-[#3a3a4a]">
              © 2026 God Particle Intelligence. All rights reserved.
            </div>
            <div className="text-[10px] font-mono text-[#3a3a4a]">
              NSE · BSE · SEBI regulated markets
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// FAQ Accordion Item
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left">
        <span className="text-sm font-bold">{q}</span>
        <span className="text-[#f0c040] text-lg ml-4 shrink-0">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="px-5 pb-4 text-xs font-mono text-[#6b6b85] leading-relaxed border-t border-[#1e1e2e] pt-3">
          {a}
        </div>
      )}
    </div>
  );
}

// Terms Section — disclaimer hidden in plain sight
function TermsSection() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-[10px] font-mono text-[#3a3a4a] hover:text-[#6b6b85] transition-all">
        <span>Terms & Disclaimer</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 text-[10px] font-mono text-[#3a3a4a] leading-relaxed max-w-4xl">
          IMPORTANT DISCLAIMER: God Particle Intelligence is a financial research and educational platform. All analysis, signals, trade setups, scenarios, and content provided on this platform are strictly for educational and informational purposes only. Nothing on this platform constitutes financial advice, investment advice, trading advice, or any other form of advice. God Particle Intelligence is NOT a SEBI-registered investment advisor. The God Particle metric, Zero To Hero signals, Stock Intelligence levels, and all other proprietary analyses are mathematical calculations based on publicly available market data. They do not guarantee any returns and should not be used as the sole basis for any trading or investment decision. Options trading involves substantial risk of loss and is not appropriate for all investors. The Zero To Hero strategy specifically involves buying deeply OTM options that have a very high probability of expiring worthless. Past performance of any analysis or signal does not guarantee future results. Users are solely responsible for their own trading decisions. By using this platform, you acknowledge that you have read, understood, and agreed to these terms. Always consult a SEBI-registered investment advisor before making any trading decisions. The subscriber count displayed is indicative and may include free trial users. All proprietary methodologies, formulas, and algorithms used in this platform are classified and are the intellectual property of God Particle Intelligence.
        </div>
      )}
    </div>
  );
}
