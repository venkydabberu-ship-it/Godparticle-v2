import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function ZeroToHero() {
  const { user, profile, refreshProfile } = useAuth();
  const role = profile?.role ?? 'free';
  const isAdmin = role === 'admin';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);
  const [index, setIndex] = useState('NIFTY');
  const [expiry, setExpiry] = useState('');
  const [paying, setPaying] = useState(false);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [expiryDates, setExpiryDates] = useState<string[]>([]);

  const canAccess = () => {
    if (['admin', 'premium', 'pro'].includes(role)) return true;
    return false;
  };

  const needsToPay = () => role === 'basic';
  const credits = profile?.credits ?? 0;

  useEffect(() => {
    // Generate next 4 weekly expiry dates
    const dates = getNext4Expiries(index);
    setExpiryDates(dates);
    if (dates.length > 0) setExpiry(dates[0]);
  }, [index]);

  useEffect(() => {
    if (expiry) loadSnapshots();
  }, [expiry, index]);

  function getNext4Expiries(idx: string): string[] {
    const dates: string[] = [];
    const now = new Date();
    // Nifty = Tuesday, Sensex = Thursday
    const targetDay = idx === 'SENSEX' ? 4 : 2;
    let d = new Date(now);
    let count = 0;
    for (let i = 0; i <= 35 && count < 4; i++) {
      d = new Date(now);
      d.setDate(now.getDate() + i);
      if (d.getDay() === targetDay) {
        dates.push(d.toISOString().split('T')[0]);
        count++;
      }
    }
    return dates;
  }

  async function loadSnapshots() {
    try {
      const { data } = await supabase
        .from('z2h_snapshots')
        .select('*')
        .eq('index_name', index)
        .eq('expiry_date', expiry)
        .order('snapshot_type', { ascending: true });
      setSnapshots(data || []);
    } catch (e) {
      console.error(e);
    }
  }

  async function runAnalysis() {
    if (!user || !profile) return;
    setError('');

    // Check access
    if (!canAccess() && !needsToPay()) {
      setError('⚠️ Upgrade to Premium plan to access Zero to Hero analysis!');
      return;
    }

    // Basic users pay 5 credits
    if (needsToPay()) {
      if (credits < 5) {
        setError('You need 5 credits to view this analysis. Buy more credits!');
        return;
      }
      setPaying(true);
      try {
        await supabase.rpc('use_credits', { p_user_id: user.id, p_credits: 5 });
        await refreshProfile();
      } catch (e) {
        setError('Credit deduction failed!');
        setPaying(false);
        return;
      }
      setPaying(false);
    }

    setLoading(true);
    try {
      // Get latest snapshots
      const { data: snaps } = await supabase
        .from('z2h_snapshots')
        .select('*')
        .eq('index_name', index)
        .eq('expiry_date', expiry)
        .order('created_at', { ascending: false });

      if (!snaps || snaps.length < 2) {
        setError('Not enough data yet. Analysis runs automatically on expiry day. Check back closer to expiry!');
        setLoading(false);
        return;
      }

      // Get latest analysis result
      const { data: analysis } = await supabase
        .from('z2h_signals')
        .select('*')
        .eq('index_name', index)
        .eq('expiry_date', expiry)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (analysis) {
        setResult(analysis);
      } else {
        // Run analysis from snapshots
        const computed = computeZ2H(snaps, index);
        setResult(computed);
      }
    } catch (err: any) {
      setError(err.message || 'Analysis failed!');
    } finally {
      setLoading(false);
    }
  }

  function computeZ2H(snaps: any[], indexName: string) {
    const snap1 = snaps.find(s => s.snapshot_type === 'DAY_BEFORE');
    const snap2 = snaps.find(s => s.snapshot_type === 'EXPIRY_930');
    const snap3 = snaps.find(s => s.snapshot_type === 'EXPIRY_1130');
    const snap4 = snaps.find(s => s.snapshot_type === 'EXPIRY_115');

    if (!snap3) return null;

    const spotMove = snap3.spot_price - (snap2?.spot_price ?? snap3.spot_price);
    const direction = spotMove < -200 ? 'BEARISH' :
      spotMove > 200 ? 'BULLISH' : 'UNCLEAR';

    if (direction === 'UNCLEAR') {
      return {
        signal: 'NO_TRADE',
        reason: 'Direction unclear at 11:30 AM. Market moved less than 200 points.',
        index: indexName,
        expiry_date: expiry,
        forces_aligned: 0,
        direction: 'UNCLEAR'
      };
    }

    const optionType = direction === 'BEARISH' ? 'PE' : 'CE';
    const mpGap = snap3.spot_price - snap3.max_pain;
    const vixOk = snap3.vix > 18;
    const vixRising = snap3.vix > (snap2?.vix ?? snap3.vix);

    // Count forces
    let forces = 0;
    if (direction !== 'UNCLEAR') forces++;
    if (Math.abs(mpGap) < 500) forces++;
    if (snap3.oi_accumulation) forces++;
    if (snap3.pcb_signal) forces++;
    if (vixOk) forces++;

    if (forces < 3) {
      return {
        signal: 'NO_TRADE',
        reason: `Only ${forces}/5 forces aligned. Need at least 3 for a trade.`,
        index: indexName,
        expiry_date: expiry,
        forces_aligned: forces,
        direction
      };
    }

    // Strike selection
    const strikeInterval = indexName === 'SENSEX' ? 100 : 50;
    let candidateStrike = snap3.max_pain - (2 * strikeInterval);
    if (direction === 'BULLISH') {
      candidateStrike = snap3.max_pain + (2 * strikeInterval);
    }

    const entryLTP = snap4?.entry_ltp ?? snap3.candidate_ltp ?? 65;
    const stopLoss = Math.round(entryLTP * 0.5);
    const target1 = Math.round(entryLTP * 3);
    const target2 = Math.round(entryLTP * 5);
    const heroTarget = Math.round(entryLTP * 10);

    return {
      signal: 'TRADE',
      direction,
      index: indexName,
      expiry_date: expiry,
      selected_strike: candidateStrike,
      option_type: optionType,
      entry_time: '1:15 PM',
      entry_ltp: entryLTP,
      stop_loss: stopLoss,
      target_1: target1,
      target_2: target2,
      hero_target: heroTarget,
      forces_aligned: forces,
      spot: snap3.spot_price,
      max_pain: snap3.max_pain,
      vix: snap3.vix,
      direction_confirmed: direction !== 'UNCLEAR',
      max_pain_confirmed: Math.abs(mpGap) < 500,
      oi_confirmed: snap3.oi_accumulation ?? false,
      pcb_confirmed: snap3.pcb_signal ?? false,
      vix_confirmed: vixOk
    };
  }

  const forceColor = (confirmed: boolean) =>
    confirmed ? 'text-[#39d98a]' : 'text-[#ff4d6d]';

  const forceIcon = (confirmed: boolean) =>
    confirmed ? '✅' : '❌';

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
            Credits: <span className="text-[#f0c040] font-bold">
              {['premium', 'admin', 'pro'].includes(role) ? '∞' : credits}
            </span>
          </div>
          <Link to="/dashboard" className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040]">← Dashboard</Link>
        </div>
      </nav>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="text-2xl">🚀</div>
            <h1 className="text-2xl font-black">Zero to Hero</h1>
            <span className="text-xs font-bold px-2 py-1 rounded-full bg-[#f0c040]/10 text-[#f0c040] border border-[#f0c040]/20">
              EXPIRY DAY ONLY
            </span>
          </div>
          <p className="text-xs font-mono text-[#6b6b85]">
            Identifies deeply OTM options on expiry day with 3x-10x potential.
            Analysis runs automatically at 11:30 AM on expiry day.
          </p>
        </div>

        {/* Access Check */}
        {role === 'free' && (
          <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-2xl p-6 mb-6 text-center">
            <div className="text-3xl mb-3">🔒</div>
            <div className="text-sm font-bold mb-2">Premium Feature</div>
            <div className="text-xs font-mono text-[#6b6b85] mb-4">
              Zero to Hero analysis is available for Premium and above customers.
              Basic customers can access for 5 credits per view.
            </div>
            <Link to="/pricing" className="inline-block bg-[#f0c040] text-black font-black px-6 py-2.5 rounded-xl text-sm">
              Upgrade Now →
            </Link>
          </div>
        )}

        {/* Basic users — pay 5 credits */}
        {role === 'basic' && (
          <div className="bg-[#f0c040]/10 border border-[#f0c040]/30 rounded-2xl p-4 mb-6">
            <div className="text-xs font-mono text-[#f0c040]">
              ⚡ Basic Plan · This analysis costs 5 credits per view ·
              You have {credits} credits ·
              <Link to="/pricing" className="underline ml-1">Upgrade to Premium for free access →</Link>
            </div>
          </div>
        )}

        {/* Controls */}
        {(canAccess() || needsToPay()) && (
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Index</label>
                <div className="flex gap-2">
                  {['NIFTY', 'SENSEX'].map(idx => (
                    <button key={idx} onClick={() => setIndex(idx)}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-black transition-all ${index === idx ? 'bg-[#f0c040] text-black' : 'bg-[#16161f] text-[#6b6b85] border border-[#1e1e2e]'}`}>
                      {idx === 'NIFTY' ? '📈 Nifty 50' : '📊 Sensex'}
                    </button>
                  ))}
                </div>
                <div className="mt-2 text-xs font-mono text-[#6b6b85]">
                  {index === 'NIFTY' ? '⏰ Expiry: Every Tuesday' : '⏰ Expiry: Every Thursday'}
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Expiry Date</label>
                <select value={expiry} onChange={e => setExpiry(e.target.value)}
                  className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]">
                  {expiryDates.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-lg px-4 py-2 text-xs font-mono text-[#ff4d6d] mb-4">
                {error}
              </div>
            )}

            <button onClick={runAnalysis} disabled={loading || paying}
              className="w-full bg-[#f0c040] text-black font-black py-3 rounded-xl text-sm hover:bg-[#ffd060] transition-all disabled:opacity-40">
              {paying ? '⏳ Deducting 5 credits...' :
                loading ? '⏳ Running Analysis...' :
                  needsToPay() ? '🚀 View Zero to Hero — 5 Credits' :
                    '🚀 Run Zero to Hero Analysis'}
            </button>
          </div>
        )}

        {/* Snapshot Status — Admin only */}
        {isAdmin && snapshots.length > 0 && (
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 mb-6">
            <div className="text-sm font-black mb-4 text-[#f0c040]">📊 Data Snapshots</div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { key: 'DAY_BEFORE', label: 'Day Before\n3:30 PM' },
                { key: 'EXPIRY_930', label: 'Expiry Day\n9:30 AM' },
                { key: 'EXPIRY_1130', label: 'Expiry Day\n11:30 AM ⭐' },
                { key: 'EXPIRY_115', label: 'Entry\n1:15 PM' },
                { key: 'EXPIRY_315', label: 'Result\n3:15 PM' },
              ].map(s => {
                const snap = snapshots.find(x => x.snapshot_type === s.key);
                return (
                  <div key={s.key} className={`rounded-xl p-3 text-center border ${snap ? 'border-[#39d98a]/30 bg-[#39d98a]/5' : 'border-[#1e1e2e] bg-[#16161f]'}`}>
                    <div className={`text-lg mb-1 ${snap ? '✅' : '⏳'}`}>{snap ? '✅' : '⏳'}</div>
                    <div className="text-[10px] font-mono text-[#6b6b85] whitespace-pre-line">{s.label}</div>
                    {snap && <div className="text-[10px] font-mono text-[#39d98a] mt-1">
                      Spot: {snap.spot_price}
                    </div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* RESULT */}
        {result && (
          <div>
            {result.signal === 'NO_TRADE' ? (
              <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-2xl p-8 text-center">
                <div className="text-4xl mb-4">🚫</div>
                <div className="text-xl font-black mb-2 text-[#ff4d6d]">NO TRADE TODAY</div>
                <div className="text-sm font-mono text-[#6b6b85] mb-4">{result.reason}</div>
                <div className="text-xs font-mono text-[#6b6b85]">
                  Forces aligned: {result.forces_aligned}/5 · Direction: {result.direction}
                </div>
                <div className="mt-4 text-xs font-mono text-[#f0c040]">
                  ⭐ Patience is the edge. Wait for next expiry with 4+ forces.
                </div>
              </div>
            ) : (
              <div>
                {/* Trade Card */}
                <div className="relative rounded-2xl overflow-hidden p-8 mb-6"
                  style={{
                    background: result.direction === 'BULLISH'
                      ? 'linear-gradient(135deg, #0a0a0f 0%, #0a1a0a 50%, #0a0a0f 100%)'
                      : 'linear-gradient(135deg, #0a0a0f 0%, #1a0a0a 50%, #0a0a0f 100%)',
                    border: result.direction === 'BULLISH'
                      ? '1px solid rgba(57,217,138,0.3)'
                      : '1px solid rgba(255,77,109,0.3)',
                    boxShadow: result.direction === 'BULLISH'
                      ? '0 0 60px rgba(57,217,138,0.08)'
                      : '0 0 60px rgba(255,77,109,0.08)'
                  }}>

                  {/* Watermark */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                    <div className="text-[180px] font-black opacity-[0.03]"
                      style={{ color: result.direction === 'BULLISH' ? '#39d98a' : '#ff4d6d' }}>
                      🚀
                    </div>
                  </div>

                  <div className="relative z-10">
                    {/* Header */}
                    <div className="text-center mb-8">
                      <div className="text-xs font-mono tracking-[3px] mb-2"
                        style={{ color: result.direction === 'BULLISH' ? '#39d98a' : '#ff4d6d' }}>
                        🚀 ZERO TO HERO SIGNAL
                      </div>
                      <div className="text-3xl font-black mb-1">
                        <span style={{ color: result.direction === 'BULLISH' ? '#39d98a' : '#ff4d6d' }}>
                          {result.selected_strike} {result.option_type}
                        </span>
                      </div>
                      <div className="text-sm font-mono text-[#6b6b85]">
                        {result.index} · Expiry: {result.expiry_date}
                      </div>
                      <div className="mt-2 inline-block px-4 py-1 rounded-full text-xs font-bold"
                        style={{
                          background: result.direction === 'BULLISH' ? 'rgba(57,217,138,0.1)' : 'rgba(255,77,109,0.1)',
                          color: result.direction === 'BULLISH' ? '#39d98a' : '#ff4d6d',
                          border: result.direction === 'BULLISH' ? '1px solid rgba(57,217,138,0.3)' : '1px solid rgba(255,77,109,0.3)'
                        }}>
                        {result.direction === 'BULLISH' ? '📈 BULLISH' : '📉 BEARISH'} · {result.forces_aligned}/5 Forces
                      </div>
                    </div>

                    {/* Entry Info */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="bg-black/20 rounded-xl p-4 text-center">
                        <div className="text-xs font-mono text-[#6b6b85] mb-1 uppercase tracking-widest">⏰ Entry Time</div>
                        <div className="text-2xl font-black text-[#f0c040]">1:15 PM</div>
                        <div className="text-xs font-mono text-[#6b6b85] mt-1">Gamma window opens</div>
                      </div>
                      <div className="bg-black/20 rounded-xl p-4 text-center">
                        <div className="text-xs font-mono text-[#6b6b85] mb-1 uppercase tracking-widest">💰 Entry Zone</div>
                        <div className="text-2xl font-black"
                          style={{ color: result.direction === 'BULLISH' ? '#39d98a' : '#ff4d6d' }}>
                          ₹{result.entry_ltp}
                        </div>
                        <div className="text-xs font-mono text-[#6b6b85] mt-1">LTP at 1:15 PM</div>
                      </div>
                    </div>

                    {/* Targets Table */}
                    <div className="rounded-xl overflow-hidden mb-6"
                      style={{
                        border: result.direction === 'BULLISH'
                          ? '1px solid rgba(57,217,138,0.2)'
                          : '1px solid rgba(255,77,109,0.2)'
                      }}>
                      <table className="w-full font-mono text-sm">
                        <thead>
                          <tr style={{
                            borderBottom: result.direction === 'BULLISH'
                              ? '1px solid rgba(57,217,138,0.2)'
                              : '1px solid rgba(255,77,109,0.2)',
                            background: 'rgba(0,0,0,0.3)'
                          }}>
                            {['LEVEL', 'PRICE', 'RETURN', 'ACTION'].map(h => (
                              <th key={h} className="text-left px-4 py-3 text-xs tracking-widest font-bold text-[#6b6b85]">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { level: '🛑 Stop Loss', price: result.stop_loss, ret: '-50%', action: 'EXIT ALL', color: '#ff4d6d' },
                            { level: '🎯 Target 1', price: result.target_1, ret: '3x', action: 'Exit 50%', color: '#f0c040' },
                            { level: '🎯 Target 2', price: result.target_2, ret: '5x', action: 'Exit 30%', color: '#39d98a' },
                            { level: '💎 Hero Target', price: result.hero_target, ret: '10x', action: 'Let 20% ride', color: '#4d9fff' },
                          ].map((row, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <td className="px-4 py-3 font-bold text-xs" style={{ color: row.color }}>{row.level}</td>
                              <td className="px-4 py-3 font-black text-sm" style={{ color: row.color }}>₹{row.price}</td>
                              <td className="px-4 py-3 text-xs font-mono" style={{ color: row.color }}>{row.ret}</td>
                              <td className="px-4 py-3 text-xs font-mono text-[#6b6b85]">{row.action}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Forces — Admin only */}
                    {isAdmin && (
                      <div className="bg-black/20 rounded-xl p-4 mb-6">
                        <div className="text-xs font-mono text-[#f0c040] font-bold mb-3 uppercase tracking-widest">
                          🔬 5-Force Analysis
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          {[
                            { label: 'Force 1: Direction (200pt move)', confirmed: result.direction_confirmed },
                            { label: 'Force 2: Max Pain Gravity', confirmed: result.max_pain_confirmed },
                            { label: 'Force 3: OI Accumulation', confirmed: result.oi_confirmed },
                            { label: 'Force 4: PCB God Particle', confirmed: result.pcb_confirmed },
                            { label: 'Force 5: VIX + Gamma Window', confirmed: result.vix_confirmed },
                          ].map((f, i) => (
                            <div key={i} className="flex items-center justify-between text-xs font-mono">
                              <span className="text-[#6b6b85]">{f.label}</span>
                              <span className={forceColor(f.confirmed)}>{forceIcon(f.confirmed)} {f.confirmed ? 'CONFIRMED' : 'NOT MET'}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 pt-3 border-t border-[#1e1e2e] flex items-center justify-between">
                          <span className="text-xs font-mono text-[#6b6b85]">Forces Aligned</span>
                          <span className={`text-sm font-black ${result.forces_aligned >= 4 ? 'text-[#39d98a]' : result.forces_aligned >= 3 ? 'text-[#f0c040]' : 'text-[#ff4d6d]'}`}>
                            {result.forces_aligned}/5
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Market Context — Admin only */}
                    {isAdmin && (
                      <div className="bg-black/20 rounded-xl p-4 mb-6">
                        <div className="text-xs font-mono text-[#f0c040] font-bold mb-3 uppercase tracking-widest">
                          📊 Market Context
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-xs font-mono">
                          <div>
                            <div className="text-[#6b6b85] mb-1">Spot at 11:30</div>
                            <div className="font-bold">{result.spot?.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-[#6b6b85] mb-1">Max Pain</div>
                            <div className="font-bold">{result.max_pain?.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-[#6b6b85] mb-1">VIX</div>
                            <div className={`font-bold ${result.vix > 18 ? 'text-[#39d98a]' : 'text-[#ff4d6d]'}`}>{result.vix}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Footer */}
                    <div className="text-center space-y-2">
                      <div className="text-xs font-mono text-[#6b6b85]">
                        ⭐ Entry only between 1:15 PM – 2:00 PM · Not Financial Advice
                      </div>
                      <div className="text-[10px] font-mono tracking-widest"
                        style={{ color: result.direction === 'BULLISH' ? 'rgba(57,217,138,0.4)' : 'rgba(255,77,109,0.4)' }}>
                        PREDICTED BY PURE MATHEMATICAL CALCULATIONS,
                        OPTION GREEKS, DEEP PSYCHOLOGICAL RESEARCH.
                      </div>
                      <div className="text-xs font-black tracking-widest"
                        style={{ color: result.direction === 'BULLISH' ? '#39d98a' : '#ff4d6d' }}>
                        DEVELOPED BY GOD PARTICLE ⚛
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
