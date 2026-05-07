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
  spotClose: number;  // actual spot at data capture time
  atm: number;        // closest strike to spotClose (or maxPain if no spot)
  interval: number;
  // Seller strikes — high OI OTM walls
  ceFocus: number;
  ceFocusOI: number;
  peFocus: number;
  peFocusOI: number;
  // Buyer strikes — most liquid within 2OTM to 5ITM range
  ceBuy: number;
  ceBuyOI: number;
  peBuy: number;
  peBuyOI: number;
}

interface IndexGroup {
  indexName: string;
  cards: FocusCard[]; // one per expiry, sorted asc
}

function parseStrikeData(raw: Record<string, any>): { rows: StrikeRow[]; spotClose: number } {
  if (!raw) return { rows: [], spotClose: 0 };
  const spotClose = parseFloat(raw['_spot_close']) || 0;
  const rows = Object.entries(raw)
    .filter(([key]) => key !== '_spot_close')
    .map(([key, val]: [string, any]) => {
      const strike = parseFloat(key);
      if (isNaN(strike)) return null;
      const ce_oi = parseFloat(val?.ce_oi ?? val?.CE_OI ?? val?.ceOI ?? 0) || 0;
      const pe_oi = parseFloat(val?.pe_oi ?? val?.PE_OI ?? val?.peOI ?? 0) || 0;
      return { strike, ce_oi, pe_oi };
    })
    .filter((r): r is StrikeRow => r !== null)
    .sort((a, b) => a.strike - b.strike);
  return { rows, spotClose };
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

function detectInterval(rows: StrikeRow[]): number {
  if (rows.length < 2) return 50;
  const gaps = rows.slice(1).map((r, i) => r.strike - rows[i].strike).filter(g => g > 0);
  if (!gaps.length) return 50;
  // Use mode of gaps (most common gap = actual strike interval)
  const freq: Record<number, number> = {};
  for (const g of gaps) freq[g] = (freq[g] ?? 0) + 1;
  return Number(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
}

function computeFocusCard(
  indexName: string,
  expiry: string,
  tradeDate: string,
  strikeData: Record<string, any>
): FocusCard | null {
  const { rows, spotClose } = parseStrikeData(strikeData);
  if (rows.length < 3) return null;

  const maxPain = computeMaxPain(rows);
  const interval = detectInterval(rows);

  // ATM = strike closest to actual spot close (falls back to max pain if spot not stored)
  const spotRef = spotClose > 0 ? spotClose : maxPain;
  const atm = rows.reduce((b, r) =>
    Math.abs(r.strike - spotRef) < Math.abs(b.strike - spotRef) ? r : b
  ).strike;

  // Seller walls: highest OI on each side of max pain
  const ceWallRows = rows.filter(r => r.strike >= maxPain && r.ce_oi > 0);
  if (!ceWallRows.length) return null;
  const ceFocusRow = ceWallRows.reduce((b, r) => r.ce_oi > b.ce_oi ? r : b);

  const peWallRows = rows.filter(r => r.strike <= maxPain && r.pe_oi > 0);
  if (!peWallRows.length) return null;
  const peFocusRow = peWallRows.reduce((b, r) => r.pe_oi > b.pe_oi ? r : b);

  // Buyer range anchored on actual spot (not max pain) — 2 OTM to 5 ITM
  // CE buyer: 5 strikes below ATM (ITM calls) to 2 strikes above ATM (OTM calls)
  const ceBuyLow  = atm - 5 * interval;
  const ceBuyHigh = atm + 2 * interval;
  const ceBuyRows = rows.filter(r => r.strike >= ceBuyLow && r.strike <= ceBuyHigh && r.ce_oi > 0);
  const ceBuyRow  = ceBuyRows.length
    ? ceBuyRows.reduce((b, r) => r.ce_oi > b.ce_oi ? r : b)
    : null;

  // PE buyer: 2 strikes below ATM (OTM puts) to 5 strikes above ATM (ITM puts)
  const peBuyLow  = atm - 2 * interval;
  const peBuyHigh = atm + 5 * interval;
  const peBuyRows = rows.filter(r => r.strike >= peBuyLow && r.strike <= peBuyHigh && r.pe_oi > 0);
  const peBuyRow  = peBuyRows.length
    ? peBuyRows.reduce((b, r) => r.pe_oi > b.pe_oi ? r : b)
    : null;

  return {
    indexName,
    expiry,
    tradeDate,
    maxPain,
    spotClose,
    atm,
    interval,
    ceFocus: ceFocusRow.strike,
    ceFocusOI: ceFocusRow.ce_oi,
    peFocus: peFocusRow.strike,
    peFocusOI: peFocusRow.pe_oi,
    ceBuy: ceBuyRow?.strike ?? atm,
    ceBuyOI: ceBuyRow?.ce_oi ?? 0,
    peBuy: peBuyRow?.strike ?? atm,
    peBuyOI: peBuyRow?.pe_oi ?? 0,
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

const INDEX_ORDER = ['NIFTY50','BANKNIFTY','FINNIFTY','MIDCAPNIFTY','SENSEX','BANKEX'];

export default function DailyFocus() {
  const [groups, setGroups] = useState<IndexGroup[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState<Record<string, string>>({});
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
        .limit(400);

      if (err) throw new Error(err.message);

      // Group by (index_name, expiry), keep latest trade_date per group
      const byIndexExpiry = new Map<string, Map<string, any>>();
      for (const row of (data ?? [])) {
        if (!byIndexExpiry.has(row.index_name)) byIndexExpiry.set(row.index_name, new Map());
        const byExpiry = byIndexExpiry.get(row.index_name)!;
        // Already ordered trade_date desc, so first seen = latest
        if (!byExpiry.has(row.expiry)) byExpiry.set(row.expiry, row);
      }

      const newGroups: IndexGroup[] = [];
      for (const [indexName, byExpiry] of byIndexExpiry) {
        const cards: FocusCard[] = [];
        for (const [, row] of byExpiry) {
          const card = computeFocusCard(indexName, row.expiry, row.trade_date, row.strike_data);
          if (card) cards.push(card);
        }
        cards.sort((a, b) => a.expiry.localeCompare(b.expiry));
        if (cards.length > 0) newGroups.push({ indexName, cards });
      }

      newGroups.sort((a, b) => {
        const ai = INDEX_ORDER.indexOf(a.indexName);
        const bi = INDEX_ORDER.indexOf(b.indexName);
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      });

      setGroups(newGroups);
      // Default selected expiry = nearest per index
      const defaults: Record<string, string> = {};
      for (const g of newGroups) defaults[g.indexName] = g.cards[0].expiry;
      setSelectedExpiry(prev => {
        const merged = { ...defaults };
        // Keep user's selection if still valid
        for (const g of newGroups) {
          if (prev[g.indexName] && g.cards.some(c => c.expiry === prev[g.indexName])) {
            merged[g.indexName] = prev[g.indexName];
          }
        }
        return merged;
      });
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-[#0d0d14] rounded-xl p-3">
                <div className="text-[9px] font-black text-[#4d9fff] uppercase mb-1">For Buyers</div>
                <div><span className="text-[#e8e8f0] font-black">CE Buy Strike</span> — Most liquid CE within 5 ITM to 2 OTM of ATM. Good delta, reasonable premium.</div>
                <div className="mt-1"><span className="text-[#e8e8f0] font-black">PE Buy Strike</span> — Most liquid PE within 2 OTM to 5 ITM of ATM. Best leverage for directional trades.</div>
              </div>
              <div className="bg-[#0d0d14] rounded-xl p-3">
                <div className="text-[9px] font-black text-[#ff8c42] uppercase mb-1">For Sellers</div>
                <div><span className="text-[#e8e8f0] font-black">CE Wall</span> — Highest CE OI above Max Pain. Market makers' resistance ceiling — price struggles here.</div>
                <div className="mt-1"><span className="text-[#e8e8f0] font-black">PE Wall</span> — Highest PE OI below Max Pain. Market makers' support floor — price defended here.</div>
              </div>
            </div>
            <div className="pt-2 border-t border-[#f0c040]/15 text-[10px]">
              <span className="text-[#f0c040] font-black">💡</span> Switch expiry tabs per index to see buyer/seller strikes for weekly vs monthly expiries. Buyers prefer near-term; sellers prefer far-term.
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
        {loading && groups.length === 0 && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-5 animate-pulse">
                <div className="h-4 bg-[#1e1e2e] rounded w-32 mb-4" />
                <div className="flex gap-2 mb-4">{[1,2,3].map(j => <div key={j} className="h-6 bg-[#1e1e2e] rounded-full w-16" />)}</div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[1, 2, 3].map(j => <div key={j} className="h-20 bg-[#1e1e2e] rounded-xl" />)}
                </div>
                <div className="h-28 bg-[#1e1e2e] rounded-xl" />
              </div>
            ))}
          </div>
        )}

        {/* No data state */}
        {!loading && !error && groups.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📭</div>
            <div className="text-sm font-mono text-[#6b6b85]">No option chain data found for today.</div>
            <div className="text-xs font-mono text-[#6b6b85] mt-1">
              Data is uploaded by admin. Check back after market open.
            </div>
          </div>
        )}

        {/* Index groups */}
        {groups.map(group => {
          const color = INDEX_COLOR[group.indexName] ?? '#e8e8f0';
          const selExp = selectedExpiry[group.indexName] ?? group.cards[0].expiry;
          const card = group.cards.find(c => c.expiry === selExp) ?? group.cards[0];
          const sellerRange = card.ceFocus - card.peFocus;

          return (
            <div
              key={group.indexName}
              className="bg-[#111118] border border-[#1e1e2e] rounded-2xl overflow-hidden"
              style={{ borderTopColor: color, borderTopWidth: 2 }}
            >
              {/* Index header + expiry tabs */}
              <div className="px-5 pt-4 pb-3 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-sm" style={{ color }}>{group.indexName}</span>
                  {card.spotClose > 0 ? (
                    <span className="text-[9px] font-mono bg-[#f0c040]/10 border border-[#f0c040]/25 text-[#f0c040] px-2 py-0.5 rounded-full">
                      Spot {fmtStrike(card.spotClose)}
                    </span>
                  ) : null}
                  <span className="text-[9px] font-mono text-[#6b6b85]">ATM {fmtStrike(card.atm)}</span>
                </div>
                {/* Expiry tabs */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {group.cards.map(c => (
                    <button
                      key={c.expiry}
                      onClick={() => setSelectedExpiry(prev => ({ ...prev, [group.indexName]: c.expiry }))}
                      className={`text-[9px] font-black px-2.5 py-1 rounded-full transition-all ${
                        c.expiry === selExp
                          ? 'text-[#0a0a0f]'
                          : 'text-[#6b6b85] bg-[#1e1e2e] hover:text-[#e8e8f0]'
                      }`}
                      style={c.expiry === selExp ? { backgroundColor: color } : {}}
                    >
                      {fmtExpiry(c.expiry)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="px-5 pb-5 space-y-4">
                {/* BUYERS section */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-[#4d9fff]">Buyers</span>
                    <span className="text-[9px] font-mono text-[#6b6b85]">5 ITM → 2 OTM range · most liquid strike</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {/* PE Buy */}
                    <div className="bg-[#ff4d6d]/8 border border-[#ff4d6d]/25 rounded-xl p-3 text-center">
                      <div className="text-[9px] font-black uppercase tracking-widest text-[#ff4d6d] mb-1">PE Buy</div>
                      <div className="font-black text-base text-[#e8e8f0]">{fmtStrike(card.peBuy)}</div>
                      <div className="text-[9px] font-mono text-[#6b6b85] mt-1">{fmtOI(card.peBuyOI)} OI</div>
                      <div className="text-[9px] font-mono text-[#ff4d6d] mt-0.5">
                        {card.peBuy > card.atm ? 'ITM' : card.peBuy === card.atm ? 'ATM' : 'OTM'}
                      </div>
                    </div>

                    {/* ATM / Max Pain */}
                    <div className="bg-[#f0c040]/8 border border-[#f0c040]/25 rounded-xl p-3 text-center">
                      <div className="text-[9px] font-black uppercase tracking-widest text-[#f0c040] mb-1">Max Pain</div>
                      <div className="font-black text-base text-[#e8e8f0]">{fmtStrike(card.maxPain)}</div>
                      <div className="text-[9px] font-mono text-[#6b6b85] mt-1">
                        {card.spotClose > 0 ? `Spot ${fmtStrike(card.spotClose)}` : `ATM ${fmtStrike(card.atm)}`}
                      </div>
                      <div className="text-[9px] font-mono text-[#f0c040] mt-0.5">EXPIRY PIN</div>
                    </div>

                    {/* CE Buy */}
                    <div className="bg-[#39d98a]/8 border border-[#39d98a]/25 rounded-xl p-3 text-center">
                      <div className="text-[9px] font-black uppercase tracking-widest text-[#39d98a] mb-1">CE Buy</div>
                      <div className="font-black text-base text-[#e8e8f0]">{fmtStrike(card.ceBuy)}</div>
                      <div className="text-[9px] font-mono text-[#6b6b85] mt-1">{fmtOI(card.ceBuyOI)} OI</div>
                      <div className="text-[9px] font-mono text-[#39d98a] mt-0.5">
                        {card.ceBuy < card.atm ? 'ITM' : card.ceBuy === card.atm ? 'ATM' : 'OTM'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-[#1e1e2e]" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#6b6b85]">Sellers — OI Walls</span>
                  <div className="flex-1 h-px bg-[#1e1e2e]" />
                </div>

                {/* SELLERS section */}
                <div>
                  <div className="grid grid-cols-3 gap-2">
                    {/* PE Wall */}
                    <div className="bg-[#1e1e2e]/60 border border-[#2a2a3e] rounded-xl p-3 text-center">
                      <div className="text-[9px] font-black uppercase tracking-widest text-[#ff8c42] mb-1">PE Wall</div>
                      <div className="font-black text-base text-[#e8e8f0]">{fmtStrike(card.peFocus)}</div>
                      <div className="text-[9px] font-mono text-[#6b6b85] mt-1">{fmtOI(card.peFocusOI)} OI</div>
                      <div className="text-[9px] font-mono text-[#ff8c42] mt-0.5">SUPPORT</div>
                    </div>

                    {/* Range */}
                    <div className="bg-[#1e1e2e]/60 border border-[#2a2a3e] rounded-xl p-3 text-center">
                      <div className="text-[9px] font-black uppercase tracking-widest text-[#6b6b85] mb-1">Range</div>
                      <div className="font-black text-base text-[#e8e8f0]">{fmtStrike(sellerRange)}</div>
                      <div className="text-[9px] font-mono text-[#6b6b85] mt-1">pts wide</div>
                      <div className="text-[9px] font-mono text-[#6b6b85] mt-0.5">STRANGLE ZONE</div>
                    </div>

                    {/* CE Wall */}
                    <div className="bg-[#1e1e2e]/60 border border-[#2a2a3e] rounded-xl p-3 text-center">
                      <div className="text-[9px] font-black uppercase tracking-widest text-[#ff8c42] mb-1">CE Wall</div>
                      <div className="font-black text-base text-[#e8e8f0]">{fmtStrike(card.ceFocus)}</div>
                      <div className="text-[9px] font-mono text-[#6b6b85] mt-1">{fmtOI(card.ceFocusOI)} OI</div>
                      <div className="text-[9px] font-mono text-[#ff8c42] mt-0.5">RESISTANCE</div>
                    </div>
                  </div>
                </div>

                {/* Trade plan */}
                <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-4 space-y-3">
                  <div className="text-[9px] font-black uppercase tracking-widest text-[#6b6b85]">
                    Today's Trade Plan · {fmtExpiry(card.expiry)} Expiry
                  </div>

                  {/* Bullish — buyer */}
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-lg bg-[#39d98a]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[#39d98a] text-[10px]">▲</span>
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-[#39d98a]">
                        BULLISH BUYER — BUY CE {fmtStrike(card.ceBuy)}
                      </div>
                      <div className="text-[9px] font-mono text-[#6b6b85]">
                        When price holds above Max Pain ({fmtStrike(card.maxPain)}) and PE wall ({fmtStrike(card.peFocus)}) holds as support.
                        {card.ceBuy < card.atm
                          ? ` ITM CE gives higher delta — less time decay risk.`
                          : ` Slight OTM gives good leverage with lower premium.`}
                      </div>
                    </div>
                  </div>

                  {/* Bearish — buyer */}
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-lg bg-[#ff4d6d]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[#ff4d6d] text-[10px]">▼</span>
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-[#ff4d6d]">
                        BEARISH BUYER — BUY PE {fmtStrike(card.peBuy)}
                      </div>
                      <div className="text-[9px] font-mono text-[#6b6b85]">
                        When price breaks below Max Pain ({fmtStrike(card.maxPain)}) and CE wall ({fmtStrike(card.ceFocus)}) caps the upside.
                        {card.peBuy > card.atm
                          ? ` ITM PE gives higher delta — moves more per point.`
                          : ` Slight OTM PE for higher reward on momentum moves.`}
                      </div>
                    </div>
                  </div>

                  {/* Range — seller */}
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-lg bg-[#ff8c42]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[#ff8c42] text-[10px]">◆</span>
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-[#ff8c42]">
                        SELLER — STRANGLE {fmtStrike(card.peFocus)} PE + {fmtStrike(card.ceFocus)} CE
                      </div>
                      <div className="text-[9px] font-mono text-[#6b6b85]">
                        When market is rangebound near Max Pain ({fmtStrike(card.maxPain)}).
                        Sell both OI walls to collect premium. {fmtStrike(sellerRange)} pts wide — max profit if expires between both walls.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Data footer */}
                <div className="text-[9px] font-mono text-[#6b6b85] text-right">
                  OI data: {fmtExpiry(card.tradeDate)} close
                  {card.spotClose > 0 ? ` · Spot at close: ${fmtStrike(card.spotClose)}` : ''}
                  {' · '}Strike interval {fmtStrike(card.interval)} pts
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
