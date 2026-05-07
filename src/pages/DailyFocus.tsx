import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface StrikeRow {
  strike: number;
  ce_oi: number;
  pe_oi: number;
}

interface FocusCard {
  indexName: string;
  expiry: string;
  tradeDate: string;
  maxPain: number;
  ceFocus: number;
  ceFocusOI: number;
  peFocus: number;
  peFocusOI: number;
}

function parseStrikeData(raw: Record<string, any>): StrikeRow[] {
  if (!raw) return [];
  return Object.entries(raw)
    .map(([key, val]: [string, any]) => {
      const strike = parseFloat(key);
      if (isNaN(strike)) return null;
      const ce_oi = parseFloat(val?.ce_oi ?? val?.CE_OI ?? val?.ceOI ?? 0) || 0;
      const pe_oi = parseFloat(val?.pe_oi ?? val?.PE_OI ?? val?.peOI ?? 0) || 0;
      return { strike, ce_oi, pe_oi };
    })
    .filter((r): r is StrikeRow => r !== null)
    .sort((a, b) => a.strike - b.strike);
}

function computeMaxPain(rows: StrikeRow[]): number {
  let minPain = Infinity;
  let maxPainStrike = rows[0]?.strike ?? 0;
  for (const candidate of rows) {
    const S = candidate.strike;
    let pain = 0;
    for (const r of rows) {
      pain += r.ce_oi * Math.max(0, S - r.strike);
      pain += r.pe_oi * Math.max(0, r.strike - S);
    }
    if (pain < minPain) {
      minPain = pain;
      maxPainStrike = S;
    }
  }
  return maxPainStrike;
}

function computeFocusCard(
  indexName: string,
  expiry: string,
  tradeDate: string,
  strikeData: Record<string, any>
): FocusCard | null {
  const rows = parseStrikeData(strikeData);
  if (rows.length < 3) return null;

  const maxPain = computeMaxPain(rows);

  // CE Focus: highest CE OI at or above max pain (resistance wall above)
  const ceRows = rows.filter(r => r.strike >= maxPain && r.ce_oi > 0);
  if (!ceRows.length) return null;
  const ceFocusRow = ceRows.reduce((b, r) => r.ce_oi > b.ce_oi ? r : b);

  // PE Focus: highest PE OI at or below max pain (support wall below)
  const peRows = rows.filter(r => r.strike <= maxPain && r.pe_oi > 0);
  if (!peRows.length) return null;
  const peFocusRow = peRows.reduce((b, r) => r.pe_oi > b.pe_oi ? r : b);

  return {
    indexName,
    expiry,
    tradeDate,
    maxPain,
    ceFocus: ceFocusRow.strike,
    ceFocusOI: ceFocusRow.ce_oi,
    peFocus: peFocusRow.strike,
    peFocusOI: peFocusRow.pe_oi,
  };
}

function fmtOI(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function fmtExpiry(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function fmtStrike(n: number): string {
  return n.toLocaleString('en-IN');
}

const INDEX_COLOR: Record<string, string> = {
  NIFTY50:     '#f0c040',
  BANKNIFTY:   '#4d9fff',
  FINNIFTY:    '#39d98a',
  MIDCAPNIFTY: '#ff8c42',
  SENSEX:      '#a78bfa',
  BANKEX:      '#ff4d6d',
};

export default function DailyFocus() {
  const [cards, setCards] = useState<FocusCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');

  const loadFocus = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error: err } = await supabase
        .from('market_data')
        .select('index_name, expiry, trade_date, strike_data')
        .gte('expiry', today)
        .order('expiry', { ascending: true })
        .order('trade_date', { ascending: false })
        .limit(200);

      if (err) throw new Error(err.message);

      // Take first record per index (nearest expiry, latest trade_date)
      const seen = new Set<string>();
      const focusCards: FocusCard[] = [];
      for (const row of (data ?? [])) {
        if (seen.has(row.index_name)) continue;
        seen.add(row.index_name);
        const card = computeFocusCard(row.index_name, row.expiry, row.trade_date, row.strike_data);
        if (card) focusCards.push(card);
      }

      // Sort by canonical index order
      const order = ['NIFTY50','BANKNIFTY','FINNIFTY','MIDCAPNIFTY','SENSEX','BANKEX'];
      focusCards.sort((a, b) => {
        const ai = order.indexOf(a.indexName);
        const bi = order.indexOf(b.indexName);
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      });

      setCards(focusCards);
      setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    } catch (e: any) {
      setError(e.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFocus(); }, [loadFocus]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0] pb-12">
      {/* Header */}
      <div className="border-b border-[#1e1e2e] px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="text-[#6b6b85] hover:text-[#e8e8f0] text-xl">←</Link>
          <div>
            <div className="font-black text-base">Strike Focus</div>
            <div className="text-[10px] font-mono text-[#6b6b85] uppercase tracking-widest">
              Today's key strikes across all indices
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-[10px] font-mono text-[#6b6b85]">Updated {lastUpdated}</span>
          )}
          <button
            onClick={loadFocus}
            disabled={loading}
            className="bg-[#f0c040] text-[#0a0a0f] font-black text-xs px-4 py-2 rounded-xl disabled:opacity-50"
          >
            {loading ? '⟳' : '↺ Refresh'}
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Guidance card */}
        <div className="bg-[#f0c040]/8 border border-[#f0c040]/25 rounded-2xl p-5">
          <div className="text-[10px] font-black uppercase tracking-widest text-[#f0c040] mb-3">What is this?</div>
          <div className="space-y-2 text-xs font-mono text-[#6b6b85]">
            <div>
              <span className="text-[#e8e8f0] font-black">CE Focus Strike</span> — The strike with the
              highest call writer (CE OI) concentration above Max Pain. This is the market makers'
              resistance ceiling. Price struggles to close above it.
            </div>
            <div>
              <span className="text-[#e8e8f0] font-black">PE Focus Strike</span> — The strike with the
              highest put writer (PE OI) concentration below Max Pain. This is the market makers'
              support floor. Price is defended near this level.
            </div>
            <div>
              <span className="text-[#e8e8f0] font-black">Max Pain</span> — The strike where option
              sellers lose the least. Markets tend to gravitate toward it by expiry.
            </div>
            <div className="mt-2 pt-2 border-t border-[#f0c040]/15">
              <span className="text-[#f0c040] font-black">💡</span> These are the two strikes to watch
              today. Buy CE near PE Focus support when bullish. Buy PE near CE Focus resistance when
              bearish. Sell strangle between both if market is rangebound.
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-xl p-4 text-xs font-mono text-[#ff4d6d]">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && cards.length === 0 && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5 animate-pulse">
                <div className="h-4 bg-[#1e1e2e] rounded w-32 mb-4" />
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[1, 2, 3].map(j => (
                    <div key={j} className="h-16 bg-[#1e1e2e] rounded-xl" />
                  ))}
                </div>
                <div className="h-24 bg-[#1e1e2e] rounded-xl" />
              </div>
            ))}
          </div>
        )}

        {/* No data state */}
        {!loading && !error && cards.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📭</div>
            <div className="text-sm font-mono text-[#6b6b85]">No option chain data found for today.</div>
            <div className="text-xs font-mono text-[#6b6b85] mt-1">
              Data is uploaded by admin. Check back after market open.
            </div>
          </div>
        )}

        {/* Cards */}
        {cards.map(card => {
          const color = INDEX_COLOR[card.indexName] ?? '#e8e8f0';
          const range = card.ceFocus - card.peFocus;
          const mid = Math.round((card.ceFocus + card.peFocus) / 2);
          return (
            <div
              key={card.indexName}
              className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5 space-y-4"
              style={{ borderTopColor: color, borderTopWidth: 2 }}
            >
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-black text-sm" style={{ color }}>{card.indexName}</span>
                  <span className="text-[10px] font-mono text-[#6b6b85] bg-[#1e1e2e] px-2 py-0.5 rounded-full">
                    Expiry {fmtExpiry(card.expiry)}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-[#6b6b85]">
                  Data: {fmtExpiry(card.tradeDate)}
                </span>
              </div>

              {/* Three data pills */}
              <div className="grid grid-cols-3 gap-2">
                {/* PE Focus */}
                <div className="bg-[#ff4d6d]/8 border border-[#ff4d6d]/25 rounded-xl p-3 text-center">
                  <div className="text-[9px] font-black uppercase tracking-widest text-[#ff4d6d] mb-1">PE Focus</div>
                  <div className="font-black text-sm text-[#e8e8f0]">{fmtStrike(card.peFocus)}</div>
                  <div className="text-[9px] font-mono text-[#6b6b85] mt-1">{fmtOI(card.peFocusOI)} OI</div>
                  <div className="text-[9px] font-mono text-[#ff4d6d] mt-0.5">SUPPORT</div>
                </div>

                {/* Max Pain */}
                <div className="bg-[#f0c040]/8 border border-[#f0c040]/25 rounded-xl p-3 text-center">
                  <div className="text-[9px] font-black uppercase tracking-widest text-[#f0c040] mb-1">Max Pain</div>
                  <div className="font-black text-sm text-[#e8e8f0]">{fmtStrike(card.maxPain)}</div>
                  <div className="text-[9px] font-mono text-[#6b6b85] mt-1">Pin target</div>
                  <div className="text-[9px] font-mono text-[#f0c040] mt-0.5">EXPIRY PIN</div>
                </div>

                {/* CE Focus */}
                <div className="bg-[#39d98a]/8 border border-[#39d98a]/25 rounded-xl p-3 text-center">
                  <div className="text-[9px] font-black uppercase tracking-widest text-[#39d98a] mb-1">CE Focus</div>
                  <div className="font-black text-sm text-[#e8e8f0]">{fmtStrike(card.ceFocus)}</div>
                  <div className="text-[9px] font-mono text-[#6b6b85] mt-1">{fmtOI(card.ceFocusOI)} OI</div>
                  <div className="text-[9px] font-mono text-[#39d98a] mt-0.5">RESISTANCE</div>
                </div>
              </div>

              {/* Range indicator */}
              <div className="flex items-center gap-2 text-[10px] font-mono text-[#6b6b85]">
                <span className="text-[#ff4d6d]">{fmtStrike(card.peFocus)}</span>
                <div className="flex-1 h-px bg-gradient-to-r from-[#ff4d6d]/40 via-[#f0c040]/60 to-[#39d98a]/40" />
                <span className="text-[#6b6b85]">Range: {fmtStrike(range)} pts · Mid: {fmtStrike(mid)}</span>
                <div className="flex-1 h-px bg-gradient-to-r from-[#39d98a]/40 via-[#f0c040]/60 to-[#ff4d6d]/40" />
                <span className="text-[#39d98a]">{fmtStrike(card.ceFocus)}</span>
              </div>

              {/* Trade plan */}
              <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-4 space-y-3">
                <div className="text-[9px] font-black uppercase tracking-widest text-[#6b6b85]">Today's Trade Plan</div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-lg bg-[#39d98a]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[#39d98a] text-[10px]">▲</span>
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-[#39d98a]">BULLISH — BUY CE {fmtStrike(card.ceFocus)}</div>
                    <div className="text-[9px] font-mono text-[#6b6b85]">
                      If market holds above Max Pain ({fmtStrike(card.maxPain)}) and PE support ({fmtStrike(card.peFocus)}) holds.
                      Buy {card.indexName} CE {fmtStrike(card.ceFocus)} when price approaches from below.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-lg bg-[#ff4d6d]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[#ff4d6d] text-[10px]">▼</span>
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-[#ff4d6d]">BEARISH — BUY PE {fmtStrike(card.peFocus)}</div>
                    <div className="text-[9px] font-mono text-[#6b6b85]">
                      If market breaks below Max Pain ({fmtStrike(card.maxPain)}) and CE wall ({fmtStrike(card.ceFocus)}) holds as ceiling.
                      Buy {card.indexName} PE {fmtStrike(card.peFocus)} when price rejects from above.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-lg bg-[#f0c040]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[#f0c040] text-[10px]">◆</span>
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-[#f0c040]">
                      RANGE — SELL STRANGLE {fmtStrike(card.peFocus)} PE + {fmtStrike(card.ceFocus)} CE
                    </div>
                    <div className="text-[9px] font-mono text-[#6b6b85]">
                      If market pins near Max Pain ({fmtStrike(card.maxPain)}) between both walls.
                      Sell both strikes to collect premium. Range: {fmtStrike(range)} pts.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
