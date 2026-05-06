import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase, callEdge } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface PriceAlert {
  id: string;
  symbol: string;
  exchange: string;
  label: string | null;
  condition: string;
  target_price: number;
  is_triggered: boolean;
  triggered_at: string | null;
  triggered_price: number | null;
  created_at: string;
}

interface Toast {
  id: string;
  msg: string;
}

const SETUP_SQL = `CREATE TABLE IF NOT EXISTS price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol TEXT NOT NULL,
  exchange TEXT NOT NULL DEFAULT 'NSE',
  label TEXT,
  condition TEXT NOT NULL,
  target_price NUMERIC NOT NULL,
  is_triggered BOOLEAN DEFAULT FALSE,
  triggered_at TIMESTAMPTZ,
  triggered_price NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts_own" ON price_alerts FOR ALL USING (auth.uid() = user_id);`;

export default function AlertsCenter() {
  const { user } = useAuth();

  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [livePrice, setLivePrice] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [notifications, setNotifications] = useState<Toast[]>([]);
  const [pollingActive, setPollingActive] = useState(false);
  const [lastChecked, setLastChecked] = useState('');
  const [checking, setChecking] = useState(false);
  const [showTriggered, setShowTriggered] = useState(false);

  // Form state
  const [symbol, setSymbol] = useState('');
  const [exchange, setExchange] = useState<'NSE' | 'BSE'>('NSE');
  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [targetPrice, setTargetPrice] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Polling offset — rotate through alerts 3 at a time
  const pollOffsetRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load alerts ──────────────────────────────────────────────
  async function loadAlerts() {
    setLoading(true);
    const { data, error } = await supabase
      .from('price_alerts')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        setSetupRequired(true);
      }
      setLoading(false);
      return;
    }
    setSetupRequired(false);
    setAlerts(data || []);
    setLoading(false);
  }

  useEffect(() => {
    if (user) loadAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── Toast helpers ────────────────────────────────────────────
  function pushToast(msg: string) {
    const id = Math.random().toString(36).slice(2);
    setNotifications(prev => [...prev, { id, msg }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 8000);
  }

  function dismissToast(id: string) {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }

  // ── Poll price for a single alert ────────────────────────────
  async function checkAlert(alert: PriceAlert): Promise<number | null> {
    try {
      const data = await callEdge('smooth-endpoint', {
        type: 'stock_price',
        symbol: alert.symbol,
        exchange: alert.exchange,
        interval: 'daily',
      });
      const records: any[] = data?.data?.data || [];
      const today = new Date().toISOString().split('T')[0];
      const latest =
        records.filter((r: any) => r.CH_TIMESTAMP < today).slice(-1)[0] ||
        records.slice(-1)[0];
      const price = parseFloat(latest?.CH_CLOSING_PRICE || '0');
      if (price > 0) {
        setLivePrice(prev => ({ ...prev, [alert.symbol]: price }));
      }
      return price > 0 ? price : null;
    } catch {
      return null;
    }
  }

  async function triggerAlert(alert: PriceAlert, price: number) {
    await supabase
      .from('price_alerts')
      .update({
        is_triggered: true,
        triggered_at: new Date().toISOString(),
        triggered_price: price,
      })
      .eq('id', alert.id);

    setAlerts(prev =>
      prev.map(a =>
        a.id === alert.id
          ? { ...a, is_triggered: true, triggered_at: new Date().toISOString(), triggered_price: price }
          : a
      )
    );
    pushToast(
      `🔔 ${alert.symbol} crossed ₹${price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}! Alert triggered.`
    );
  }

  // ── Polling cycle ────────────────────────────────────────────
  async function runPollCycle(currentAlerts: PriceAlert[]) {
    const active = currentAlerts.filter(a => !a.is_triggered);
    if (active.length === 0) return;

    setChecking(true);
    const offset = pollOffsetRef.current % active.length;
    const batch = active.slice(offset, offset + 3);
    pollOffsetRef.current = (offset + 3) % active.length;

    for (const alert of batch) {
      const price = await checkAlert(alert);
      if (price === null) continue;
      const hit =
        (alert.condition === 'above' && price >= alert.target_price) ||
        (alert.condition === 'below' && price <= alert.target_price);
      if (hit) await triggerAlert(alert, price);
    }

    setLastChecked(new Date().toLocaleTimeString('en-IN', { hour12: false }));
    setChecking(false);
  }

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (pollingActive) {
      // Run immediately, then every 60 s
      runPollCycle(alerts);
      intervalRef.current = setInterval(() => {
        setAlerts(prev => {
          runPollCycle(prev);
          return prev;
        });
      }, 60_000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollingActive]);

  // ── Add alert ────────────────────────────────────────────────
  async function handleAddAlert() {
    setFormError('');
    const sym = symbol.trim().toUpperCase();
    if (!sym) { setFormError('Symbol is required.'); return; }
    const tp = parseFloat(targetPrice);
    if (!tp || tp <= 0) { setFormError('Enter a valid target price.'); return; }

    setSaving(true);
    const { data, error } = await supabase
      .from('price_alerts')
      .insert({
        user_id: user?.id,
        symbol: sym,
        exchange,
        condition,
        target_price: tp,
        label: label.trim() || null,
      })
      .select()
      .single();

    if (error) {
      setFormError(error.message);
      setSaving(false);
      return;
    }
    setAlerts(prev => [data, ...prev]);
    setSymbol('');
    setExchange('NSE');
    setCondition('above');
    setTargetPrice('');
    setLabel('');
    setShowForm(false);
    setSaving(false);
  }

  // ── Delete alert ─────────────────────────────────────────────
  async function handleDelete(id: string) {
    await supabase.from('price_alerts').delete().eq('id', id);
    setAlerts(prev => prev.filter(a => a.id !== id));
    setLivePrice(prev => {
      // don't purge symbol if another alert uses it
      return prev;
    });
  }

  // ── Derived ──────────────────────────────────────────────────
  const activeAlerts = alerts.filter(a => !a.is_triggered);
  const triggeredAlerts = alerts.filter(a => a.is_triggered);
  const todayStr = new Date().toISOString().split('T')[0];
  const triggeredToday = triggeredAlerts.filter(
    a => a.triggered_at && a.triggered_at.startsWith(todayStr)
  ).length;
  const watchingSymbols = new Set(activeAlerts.map(a => a.symbol)).size;

  const fmt = (n: number) =>
    `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
      {/* Grid bg */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      {/* Toast notifications */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-xs w-full">
        {notifications.map(n => (
          <div
            key={n.id}
            className="bg-[#111118] border border-[#f0c040]/50 rounded-xl px-4 py-3 flex items-start gap-3 shadow-lg"
          >
            <span className="text-sm font-mono text-[#f0c040] flex-1">{n.msg}</span>
            <button
              onClick={() => dismissToast(n.id)}
              className="text-[#6b6b85] hover:text-[#e8e8f0] shrink-0 text-xs leading-none"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#1e1e2e]">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#f0c040] rounded-xl flex items-center justify-center text-lg">⚛</div>
          <div className="font-bold text-base">God Particle</div>
        </Link>
        <Link to="/dashboard" className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040]">← Dashboard</Link>
      </nav>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="text-2xl">🔔</div>
            <h1 className="text-2xl font-black">Alerts Center</h1>
          </div>
          <p className="text-xs font-mono text-[#6b6b85]">
            Set price level alerts · Get notified when GCT key levels are hit · Auto-checks every 60s
          </p>
        </div>

        {/* Setup required banner */}
        {setupRequired && (
          <div className="bg-[#ff8c42]/10 border border-[#ff8c42]/40 rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <span className="font-black text-[#ff8c42]">Setup Required</span>
            </div>
            <p className="text-xs font-mono text-[#6b6b85]">
              The <code className="text-[#f0c040]">price_alerts</code> table doesn't exist yet.
              Run the following SQL in your Supabase SQL Editor:
            </p>
            <pre className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl p-4 text-[11px] font-mono text-[#39d98a] overflow-x-auto whitespace-pre-wrap">
              {SETUP_SQL}
            </pre>
          </div>
        )}

        {/* Polling status bar */}
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {pollingActive ? (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#39d98a] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#39d98a]" />
                </span>
                <span className="text-xs font-mono text-[#39d98a]">
                  Active — checking every 60s
                  {lastChecked && ` · Last: ${lastChecked}`}
                </span>
                {checking && (
                  <span className="text-[10px] font-mono text-[#6b6b85] animate-pulse">⏳ checking...</span>
                )}
              </>
            ) : (
              <>
                <span className="h-2.5 w-2.5 rounded-full bg-[#6b6b85]" />
                <span className="text-xs font-mono text-[#6b6b85]">
                  Paused{lastChecked && ` · Last checked: ${lastChecked}`}
                </span>
              </>
            )}
          </div>
          <button
            onClick={() => setPollingActive(p => !p)}
            className={`text-xs font-black px-4 py-2 rounded-lg border transition-all ${
              pollingActive
                ? 'border-[#ff4d6d]/50 text-[#ff4d6d] hover:bg-[#ff4d6d]/10'
                : 'border-[#39d98a]/50 text-[#39d98a] hover:bg-[#39d98a]/10'
            }`}
          >
            {pollingActive ? '⏸ Pause Polling' : '▶ Start Polling'}
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Active Alerts', value: activeAlerts.length, color: '#4d9fff' },
            { label: 'Triggered Today', value: triggeredToday, color: '#39d98a' },
            { label: 'Watching Symbols', value: watchingSymbols, color: '#f0c040' },
          ].map(s => (
            <div key={s.label} className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-4 text-center">
              <div className="text-2xl font-black font-mono" style={{ color: s.color }}>
                {s.value}
              </div>
              <div className="text-[10px] font-mono text-[#6b6b85] mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Add Alert button / form */}
        {!setupRequired && (
          <div className="space-y-3">
            <button
              onClick={() => setShowForm(f => !f)}
              className="w-full bg-[#f0c040] text-black font-black py-3 rounded-xl text-sm hover:bg-[#ffd060] transition-all"
            >
              {showForm ? '✕ Cancel' : '+ Add Alert'}
            </button>

            {showForm && (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 space-y-5">
                <h3 className="font-black text-sm text-[#e8e8f0]">New Price Alert</h3>

                {/* Symbol */}
                <div>
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Symbol</label>
                  <input
                    type="text"
                    value={symbol}
                    onChange={e => setSymbol(e.target.value.toUpperCase())}
                    placeholder="e.g. RELIANCE"
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]"
                  />
                </div>

                {/* Exchange */}
                <div>
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Exchange</label>
                  <div className="flex gap-2">
                    {(['NSE', 'BSE'] as const).map(ex => (
                      <button
                        key={ex}
                        onClick={() => setExchange(ex)}
                        className={`flex-1 py-2.5 rounded-lg text-xs font-black transition-all border ${
                          exchange === ex
                            ? 'border-[#f0c040] bg-[#f0c040]/10 text-[#f0c040]'
                            : 'border-[#1e1e2e] bg-[#16161f] text-[#6b6b85]'
                        }`}
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Condition */}
                <div>
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Condition</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCondition('above')}
                      className={`flex-1 py-2.5 rounded-lg text-xs font-black transition-all border ${
                        condition === 'above'
                          ? 'border-[#39d98a] bg-[#39d98a]/10 text-[#39d98a]'
                          : 'border-[#1e1e2e] bg-[#16161f] text-[#6b6b85]'
                      }`}
                    >
                      ↑ Goes ABOVE ₹
                    </button>
                    <button
                      onClick={() => setCondition('below')}
                      className={`flex-1 py-2.5 rounded-lg text-xs font-black transition-all border ${
                        condition === 'below'
                          ? 'border-[#ff4d6d] bg-[#ff4d6d]/10 text-[#ff4d6d]'
                          : 'border-[#1e1e2e] bg-[#16161f] text-[#6b6b85]'
                      }`}
                    >
                      ↓ Falls BELOW ₹
                    </button>
                  </div>
                </div>

                {/* Target price */}
                <div>
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">Target Price (₹)</label>
                  <input
                    type="number"
                    value={targetPrice}
                    onChange={e => setTargetPrice(e.target.value)}
                    placeholder="e.g. 2500"
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]"
                  />
                </div>

                {/* Label */}
                <div>
                  <label className="block text-xs font-mono text-[#6b6b85] uppercase tracking-widest mb-2">
                    Label <span className="normal-case text-[#6b6b85]">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    placeholder="e.g. AL Level, GCT Buy Zone"
                    className="w-full bg-[#16161f] border border-[#1e1e2e] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e8e8f0] outline-none focus:border-[#f0c040]"
                  />
                </div>

                {formError && (
                  <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-xl px-4 py-3 text-xs font-mono text-[#ff4d6d]">
                    {formError}
                  </div>
                )}

                <button
                  onClick={handleAddAlert}
                  disabled={saving}
                  className="w-full bg-[#f0c040] text-black font-black py-3 rounded-xl text-sm hover:bg-[#ffd060] transition-all disabled:opacity-50"
                >
                  {saving ? '⏳ Setting Alert...' : '🔔 Set Alert'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-8 text-center">
            <div className="text-xs font-mono text-[#6b6b85] animate-pulse">Loading alerts...</div>
          </div>
        )}

        {/* Active alerts */}
        {!loading && !setupRequired && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-[#e8e8f0]">
                Active <span className="font-mono text-[#6b6b85] font-normal">({activeAlerts.length})</span>
              </h2>
            </div>

            {activeAlerts.length === 0 ? (
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-8 text-center">
                <div className="text-3xl mb-3">🔕</div>
                <div className="text-sm font-black text-[#6b6b85] mb-1">No alerts set</div>
                <div className="text-xs font-mono text-[#6b6b85]">
                  Add your first alert to get notified when GCT levels are hit.
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {activeAlerts.map(alert => {
                  const live = livePrice[alert.symbol];
                  const diff = live != null ? live - alert.target_price : null;
                  const condColor = alert.condition === 'above' ? '#39d98a' : '#ff4d6d';
                  return (
                    <div
                      key={alert.id}
                      className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 hover:border-[#f0c040]/30 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className="text-xl shrink-0 mt-0.5"
                            style={{ color: condColor }}
                          >
                            {alert.condition === 'above' ? '↑' : '↓'}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-sm text-[#e8e8f0]">{alert.symbol}</span>
                              <span className="text-[9px] font-black bg-[#16161f] border border-[#1e1e2e] px-1.5 py-0.5 rounded text-[#6b6b85]">
                                {alert.exchange}
                              </span>
                              {alert.label && (
                                <span className="text-[9px] font-mono bg-[#f0c040]/10 text-[#f0c040] px-1.5 py-0.5 rounded-full">
                                  {alert.label}
                                </span>
                              )}
                            </div>
                            <div className="text-xs font-mono text-[#6b6b85] mt-0.5">
                              {alert.condition === 'above' ? 'Alert when above' : 'Alert when below'}{' '}
                              <span className="font-black" style={{ color: condColor }}>
                                {fmt(alert.target_price)}
                              </span>
                            </div>
                            {live != null && (
                              <div className="text-[11px] font-mono text-[#4d9fff] mt-1">
                                Last: {fmt(live)}{' '}
                                <span className={diff != null && diff >= 0 ? 'text-[#39d98a]' : 'text-[#ff4d6d]'}>
                                  · {diff != null && diff >= 0 ? '+' : ''}{diff?.toFixed(2)} pts away
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDelete(alert.id)}
                          className="text-[10px] font-black border border-[#ff4d6d]/30 text-[#ff4d6d] px-2.5 py-1.5 rounded-lg hover:bg-[#ff4d6d]/10 transition-all shrink-0"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Triggered alerts (collapsible) */}
        {!loading && !setupRequired && triggeredAlerts.length > 0 && (
          <div className="space-y-3">
            <button
              onClick={() => setShowTriggered(s => !s)}
              className="flex items-center justify-between w-full text-left"
            >
              <h2 className="text-sm font-black text-[#6b6b85]">
                Triggered <span className="font-mono font-normal">({triggeredAlerts.length})</span>
              </h2>
              <span className="text-xs font-mono text-[#6b6b85]">{showTriggered ? '▲ collapse' : '▼ expand'}</span>
            </button>

            {showTriggered && (
              <div className="space-y-2">
                {triggeredAlerts.map(alert => (
                  <div
                    key={alert.id}
                    className="bg-[#111118] border border-[#39d98a]/20 rounded-xl p-4 opacity-75"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="text-xl shrink-0 mt-0.5">✅</div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-sm text-[#e8e8f0]">{alert.symbol}</span>
                            <span className="text-[9px] font-black bg-[#16161f] border border-[#1e1e2e] px-1.5 py-0.5 rounded text-[#6b6b85]">
                              {alert.exchange}
                            </span>
                            {alert.label && (
                              <span className="text-[9px] font-mono bg-[#f0c040]/10 text-[#f0c040] px-1.5 py-0.5 rounded-full">
                                {alert.label}
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-mono text-[#39d98a] mt-0.5">
                            Triggered at{' '}
                            <span className="font-black">
                              {alert.triggered_price != null ? fmt(alert.triggered_price) : '—'}
                            </span>
                            {alert.triggered_at && (
                              <span className="text-[#6b6b85]">
                                {' '}on {new Date(alert.triggered_at).toLocaleDateString('en-IN')}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-[#6b6b85] mt-0.5">
                            Target was {alert.condition === 'above' ? '↑' : '↓'} {fmt(alert.target_price)}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(alert.id)}
                        className="text-[10px] font-black border border-[#1e1e2e] text-[#6b6b85] px-2.5 py-1.5 rounded-lg hover:bg-[#1e1e2e] transition-all shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-[10px] font-mono text-[#6b6b85] text-center">
          Prices fetched via Yahoo Finance · Delayed 15–20 min · Not financial advice
        </p>
      </div>
    </div>
  );
}
