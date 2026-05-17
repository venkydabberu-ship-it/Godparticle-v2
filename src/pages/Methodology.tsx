import { useState } from 'react';
import { Link } from 'react-router-dom';

// ── Types ──────────────────────────────────────────────────────────────────────

type SectionId =
  | 'forecast'
  | 'z2h'
  | 'gamma'
  | 'oiheatmap'
  | 'sector'
  | 'gct'
  | 'scanner'
  | 'focus'
  | 'backtest'
  | 'alerts'
  | 'journal';

interface Section {
  id: SectionId;
  icon: string;
  title: string;
  subtitle: string;
  color: string;
}

const SECTIONS: Section[] = [
  { id: 'forecast',  icon: '⚛',  title: 'God Particle Index Forecast', subtitle: '17-parameter conviction model', color: '#f0c040' },
  { id: 'z2h',       icon: '🚀', title: 'Zero to Hero',                 subtitle: 'Expiry-day OTM scanner',          color: '#a78bfa' },
  { id: 'gamma',     icon: '🌀', title: 'Gamma Trap',                   subtitle: 'Dealer gamma & pin mechanics',    color: '#34d399' },
  { id: 'oiheatmap', icon: '🔥', title: 'OI Heatmap & Max Pain',        subtitle: 'Open interest distribution',      color: '#f97316' },
  { id: 'sector',    icon: '🔄', title: 'Sector Rotation (RRG)',        subtitle: 'Relative-strength quadrants',     color: '#38bdf8' },
  { id: 'gct',       icon: '🎯', title: 'Multi-Timeframe GCT',          subtitle: 'Gravitational crash levels',      color: '#fb7185' },
  { id: 'scanner',   icon: '📡', title: 'Options Scanner',              subtitle: 'OI velocity & institutional flow',color: '#fbbf24' },
  { id: 'focus',     icon: '📍', title: 'Daily Focus (Strike Focus)',   subtitle: '3 strikes per index per day',     color: '#4ade80' },
  { id: 'backtest',  icon: '📊', title: 'Backtest Engine',             subtitle: 'Historical accuracy scoring',     color: '#c084fc' },
  { id: 'alerts',    icon: '🔔', title: 'Alerts Center',               subtitle: 'Price-threshold notifications',   color: '#67e8f9' },
  { id: 'journal',   icon: '📓', title: 'Trade Journal',               subtitle: 'Trade tracking & P&L stats',     color: '#a3e635' },
];

// ── Helper components ──────────────────────────────────────────────────────────

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#0a0a0f] border border-[#2a2a3e] rounded-lg p-4 my-3 font-mono text-xs text-[#f0c040] whitespace-pre-wrap overflow-x-auto">
      {children}
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto my-4">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-[#2a2a3e]">
            {headers.map(h => (
              <th key={h} className="text-left py-2 px-3 text-[#6b6b85] font-mono uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[#1e1e2e] hover:bg-[#111118] transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="py-2 px-3 text-[#c8c8d8] font-mono">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-black uppercase tracking-widest text-[#e8e8f0] mt-6 mb-2">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[#9898a8] leading-relaxed mb-2">{children}</p>;
}

function Tag({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border mr-1 mb-1"
      style={{ color: color ?? '#f0c040', borderColor: `${color ?? '#f0c040'}40`, backgroundColor: `${color ?? '#f0c040'}10` }}
    >
      {children}
    </span>
  );
}

// ── Section content ───────────────────────────────────────────────────────────

function ForecastContent() {
  return (
    <div>
      <P>
        The God Particle Index Forecast is a multi-signal conviction model that combines 17 independent
        inputs — spanning options market structure, institutional flow, price momentum, and volatility —
        to produce a directional bias, intraday price path, and key S/R levels for any index.
      </P>

      <H3>Inputs (17 Parameters)</H3>
      <Table
        headers={['#', 'Parameter', 'Source', 'What It Captures']}
        rows={[
          ['1',  'openPrice',          'User / auto-detected',      "Today's index open (in points)"],
          ['2',  'spotClose',          'strike_data._spot_close',   "Previous session's closing spot price"],
          ['3',  'strikeData (chain)', 'market_data table',         'CE + PE OI, LTP, IV for every strike'],
          ['4',  'vix',               'market_data.vix',           'India VIX — implied vol (annualised %)'],
          ['5',  'indexName',          'user selection',            'NIFTY50 / BANKNIFTY / FINNIFTY / etc.'],
          ['6',  'dte',               'getExpiryDates() helper',   'Calendar days left to nearest expiry'],
          ['7',  'historicalSpotCloses','index_ohlc (10 days)',     'Daily closes for trend calculation'],
          ['8',  'sectorChainData',    'market_data for sub-indices','Sector index option chains & weights'],
          ['9',  'prevStrikeData',     'market_data (prev row)',    'Prior day chain for OI velocity & COI'],
          ['10', 'fiiFuturesLongPct',  'fii_data table',            'FII structural long% (neutral=50)'],
          ['11', 'atr',               'index_ohlc (10 days)',      'Average True Range — mean(H−L)'],
          ['12', 'fiiCmNet',          'fii_activity table',        'FII cash-market net (₹ Crores, prev day)'],
          ['13', 'fiiIdxFutNet',      'fii_activity table',        'FII index-futures net (₹ Crores, prev day)'],
          ['14', 'diiCmNet',          'fii_activity table',        'DII cash-market net (₹ Crores, prev day)'],
          ['15', 'fiiLongPct',        'fii_data table',            'FII structural long% for close nudge'],
          ['16', 'diiNetFut',         'fii_data table',            'DII net futures (long − short contracts)'],
          ['17', 'proNetFut',         'fii_data table',            'Proprietary desk net futures contracts'],
        ]}
      />

      <H3>Step 1 — Max Pain</H3>
      <P>
        Max Pain is the strike price where all open option positions (both CE and PE) would collectively
        expire worthless, causing maximum loss to option buyers. Market-makers' delta-hedging creates a
        gravitational pull toward this level as expiry approaches.
      </P>
      <Formula>{`For each candidate strike S (within ±10% of open):
  pain(S) = Σ [ CE_OI(k) × max(0, S − k) + PE_OI(k) × max(0, k − S) ]
             for every strike k in the chain

Max Pain (mp) = argmin(pain(S))`}</Formula>

      <H3>Step 2 — Gamma Walls (CE Wall & PE Wall)</H3>
      <Formula>{`ceWall = strike with maximum total CE OI     ← hard resistance
peWall = strike with maximum total PE OI     ← hard support

Hard ceiling flag: CE_OI_at_ceWall ≥ 15% of total CE OI
Hard floor flag:   PE_OI_at_peWall ≥ 15% of total PE OI`}</Formula>

      <H3>Step 3 — Near-Term Gamma Walls</H3>
      <P>Reactive intraday walls found within ATM ± 4–5 strike gaps. Used for "proximity" signal.</P>
      <Formula>{`nearResistance = highest-OI CE strike within [ATM, ATM + 5×strikeGap]
nearSupport    = highest-OI PE strike within [ATM − 5×strikeGap, ATM]`}</Formula>

      <H3>Step 4 — Daily Range Estimate</H3>
      <P>Three estimates are computed; the largest is used as the definitive daily range.</P>
      <Formula>{`optionImpliedRange = (atmCE_LTP + atmPE_LTP) / √DTE × 0.85
vixRange          = open × (VIX / 100) / √252
atr               = mean(high − low) for last 10 OHLC candles

dailyRange = max(optionImpliedRange, vixRange, atr)`}</Formula>

      <H3>Step 5 — Conviction Score (14 Signals → ±100)</H3>
      <P>Each signal is capped individually, then summed. Final score capped at −70 to +100.</P>
      <Table
        headers={['Signal', 'Range', 'Formula', 'Interpretation']}
        rows={[
          ['PCR Signal',          '±30', '(pcr − 1.0) × 60',                      'pcr=1.3 → +18 bullish; pcr=0.7 → −18 bearish'],
          ['Max Pain Gravity',    '±25', '−(open − mp) / strikeGap × 12',         'Price far above mp = gravity pulls down (bearish)'],
          ['Room to Run',         '±20', '(CE_dist − PE_dist) / strikeGap × 3',   'More room above than below = bullish'],
          ['Trend Signal',        '±15', 'closeSMA comparison × 15',               '20-period close MA: close>MA by 1% → +15'],
          ['Near-Wall Proximity', '±25', '+25 if at PE wall; −25 if at CE wall',   'Price touching dominant wall = strong signal'],
          ['Sector Signal',       '±20', 'Weighted avg PCR of constituent sectors','Sector rotation alignment'],
          ['OI Velocity',         '±15', 'Fresh PE build at support vs CE at res.','Institutional conviction in real time'],
          ['FII Cash Market',     '±12', 'fiiCmNet / normaliser',                  'FII cash-mkt flow from previous day'],
          ['FII Index Futures',   '±8',  'fiiIdxFutNet / normaliser',              'Derivative book direction'],
          ['FII Structural',      '±8',  '(fiiLongPct − 50) × 0.16',             'Long-term structural positioning'],
          ['Pro Desk Net Futures','±6',  'proNetFut / normaliser',                'Prop-desk directional bet'],
          ['IV Skew',             '±8',  '((CE_IV / PE_IV) − 0.87) × 80',        'Normal: PE IV ~13% higher than CE IV'],
          ['COI Signal',          '±12', 'Fresh OI writing today at S/R',         'Today\'s institutional conviction'],
          ['Gap Signal',          '±15', 'gapPts / strikeGap × scaleFactor',      'Overnight gap direction & size'],
        ]}
      />
      <Formula>{`convictionScore = Σ(all 14 signals), clamped to [−70, +100]

Bias thresholds:
  BULLISH  : convictionScore > +15
  BEARISH  : convictionScore < −25   (asymmetric — higher bar for bearish)
  NEUTRAL  : convictionScore between −25 and +15`}</Formula>

      <H3>Step 6 — Max Pain Gravity (mpGravity)</H3>
      <P>Gravity is exponentially stronger as DTE approaches 0 — on expiry day the index is almost magnetically pulled to Max Pain.</P>
      <Formula>{`mpGravity = max(0.10, min(0.85, 0.85 × e^(−0.45 × DTE)))

DTE = 0  (expiry day)  →  ~0.92  (92% weight toward Max Pain)
DTE = 1               →  ~0.75
DTE = 3               →  ~0.50
DTE = 10+             →  ~0.10

If mp fights the bias (mp is on wrong side of open):
  DTE = 0: gravity reduced by ×0.70
  DTE > 0 and |conviction| > 15: gravity reduced to 0.40 × base`}</Formula>

      <H3>Step 7 — EOD Target</H3>
      <Formula>{`Step 1: Max Pain component
  mpTarget = open + mpGravity × (mp − open)

Step 2: Directional move component
  maxDirectionalMove = dailyRange × min(0.60, |conviction| / 65)
  dteDampener        = max(0.45, 1.0 − DTE × 0.05)
  conservativeTarget = open + sign(bias) × maxDirectionalMove × dteDampener

Step 3: Blend by conviction
  convWeight = min(0.75, |conviction| / 55)    [if bias ≠ NEUTRAL]
             = min(0.15, |conviction| / 100)   [if NEUTRAL]
  eodTarget  = mpTarget × (1 − weight) + conservativeTarget × weight

Step 4: Consistency guardrails
  If BULLISH + conviction > 25 AND eodTarget < open → nudge up
  If BEARISH + conviction > 25 AND eodTarget > open → nudge down

Step 5: Structural close nudge (if DTE > 0)
  closeNudge = coiSignal × 3.5
             + fiiLongPctSignal × 1.2
             + proSignal × 1.0
             + diiCmSignal
  eodTarget += closeNudge`}</Formula>

      <H3>Step 8 — Intraday Path (6 Checkpoints)</H3>
      <P>
        The model generates 6 time-stamped price targets forming the expected intraday trajectory.
        For BULLISH days the canonical shape is: open → morning dip → gradual recovery → EOD target.
        For BEARISH days: open → morning pop → gradual sell-off → EOD target.
        For NEUTRAL days: brief test of one wall → gravity pull back to Max Pain.
      </P>
      <Formula>{`bandScale: DTE=0 → 0.5×   DTE=1 → 0.7×   DTE≥2 → 1.0×

BULLISH path:
  09:15  openPrice  ± 15 × bandScale
  09:45  morningDipTarget = open − vixHalfMove × 1.20  (expected morning dip)
  11:00  dip + 40% of (eodTarget − dip)
  12:30  dip + 62% of (eodTarget − dip)
  14:00  dip + 82% of (eodTarget − dip)
  15:30  eodTarget

BEARISH path (inverted — pop before sell):
  09:15  openPrice ± 15 × bandScale
  09:45  morningPopTarget = open + vixHalfMove × 1.20
  11:00–15:30: step-down toward eodTarget`}</Formula>

      <H3>Step 9 — Predicted High & Low</H3>
      <Formula>{`Predicted High:
  If nearResistance reachable (dist ≤ 1.5 × vixHalfMove):
    BULLISH + no hardCeiling: nearResistance + vixHalfMove × 0.40
    NEUTRAL:                  nearResistance + vixHalfMove × 0.10
    BEARISH or hardCeiling:   nearResistance
  Else:
    BULLISH: open + vixHalfMove × 1.20
    BEAR/NEUT: open + vixHalfMove × 0.75

Predicted Low:
  BULLISH: morningDipTarget
  BEARISH: nearSupport − vixHalfMove × (0.15 if hardFloor else 0.30)
  NEUTRAL:
    If nearSupport reachable: nearSupport − vixHalfMove × (0.20 if hardFloor else 0.50)
    Else: open − vixHalfMove × 1.20`}</Formula>
    </div>
  );
}

function Z2HContent() {
  return (
    <div>
      <P>
        Zero to Hero identifies deeply Out-of-The-Money (OTM) options on expiry day that have the
        potential to return 3x–10x in a single session. It works because of Max Pain gravity —
        when the spot is far from Max Pain at market open, a strong directional move is expected
        to pull price back toward Max Pain before EOD.
      </P>
      <P><strong>Available only on expiry days for all indices.</strong></P>

      <H3>Core Concept — Max Pain Pull</H3>
      <P>
        The day before expiry, admin captures a Z2H snapshot of the option chain and Max Pain.
        On expiry morning, the 9:30 AM spot is compared to that Max Pain. The gap between them
        is the "pull magnitude".
      </P>
      <Formula>{`gapToPain = |spot_9:30 − maxPain|
gapPct   = gapToPain / maxPain × 100

Direction:
  spot > maxPain → BEARISH pull (price expected to fall toward mp)
  spot < maxPain → BULLISH pull (price expected to rise toward mp)

Actionable threshold: gapPct ≥ 0.3%`}</Formula>

      <H3>OTM Strike Selection</H3>
      <Formula>{`For BULLISH pull (need CE options):
  Target strike = maxPain + 1–3 × strikeGap       ← slightly above mp
  Entry: buy CE at that strike when premium ≤ reasonable (low IV)

For BEARISH pull (need PE options):
  Target strike = maxPain − 1–3 × strikeGap       ← slightly below mp
  Entry: buy PE at that strike

Premium targets:
  3×  entry = current premium × 3
  5×  entry = current premium × 5
  10× entry = current premium × 10`}</Formula>

      <H3>Gamma Wall Squeeze</H3>
      <P>
        When a huge concentration of OI sits at one strike, dealers are short gamma there.
        As spot approaches, they are forced to hedge by buying the underlying — accelerating
        the move toward that wall and then beyond it (gamma squeeze).
      </P>
      <Formula>{`Squeeze signal triggered when:
  OI at a single CE strike ≥ 25% of total CE OI   → potential short squeeze up
  OI at a single PE strike ≥ 25% of total PE OI   → potential squeeze down`}</Formula>

      <H3>Snapshots</H3>
      <P>Two DB snapshots are stored per index per expiry cycle:</P>
      <Table
        headers={['Snapshot', 'Timing', 'Captures']}
        rows={[
          ['PREV_CLOSE',   'Previous trading day EOD', 'Max Pain, chain, spot close before expiry day'],
          ['MORNING_9_30', 'Expiry day 9:30 AM',       'Live spot, chain, fresh OI build'],
        ]}
      />
    </div>
  );
}

function GammaContent() {
  return (
    <div>
      <P>
        Gamma Trap uses Black-Scholes option greeks to locate the exact price level where
        dealer delta-hedging flows are maximally concentrated. This level acts as a magnetic
        pin for intraday price — price oscillates around it, and large deviations create
        mean-reversion opportunities.
      </P>

      <H3>Black-Scholes Gamma Formula</H3>
      <Formula>{`d1 = [ ln(S/K) + (r + 0.5σ²) × T ] / (σ × √T)

gamma(S, K) = φ(d1) / (S × σ × √T)

Where:
  S = current spot price
  K = strike price
  T = time to expiry (days / 365)
  σ = implied volatility from live option chain (or 15% if unavailable)
  r = 6.5% (India risk-free rate)
  φ = standard normal PDF`}</Formula>

      <H3>Dollar Gamma (Dealer Exposure)</H3>
      <P>
        Raw gamma is a per-unit measure. Dollar gamma scales it by the notional OI at each
        strike, giving the actual ₹ delta-change dealers must hedge per 1-point spot move.
      </P>
      <Formula>{`dollarGamma(K) = gamma(K) × (CE_OI(K) + PE_OI(K)) × spot

pinZone = argmax(dollarGamma(K))   ← price is magnetically drawn here`}</Formula>

      <H3>Gamma Flip Level</H3>
      <P>
        The Gamma Flip is the strike where dealer net gamma changes sign. Below the flip,
        dealers are short gamma (amplify moves). Above it, dealers are long gamma (dampen moves).
      </P>
      <Formula>{`netOI(K) = PE_OI(K) − CE_OI(K)
gammaFlip = first strike where netOI changes sign (negative → positive)`}</Formula>

      <H3>Trading Playbook</H3>
      <Table
        headers={['Situation', 'Implication', 'Trade']}
        rows={[
          ['spot > pinZone + 30 pts', 'Price stretched above pin; dealers buying back to hedge',  'Sell call / buy put; mean-revert to pin'],
          ['spot < pinZone − 30 pts', 'Price stretched below pin; dealers must re-hedge upward',  'Buy call / sell put; mean-revert to pin'],
          ['spot at pinZone ± 10 pts','High dealer gamma absorption; expect tight range',          'Sell straddle / iron condor around pin'],
          ['spot < gammaFlip',        'Negative gamma regime — moves amplified, less predictable', 'Reduce size; wider stops'],
        ]}
      />
    </div>
  );
}

function OIHeatmapContent() {
  return (
    <div>
      <P>
        The OI Heatmap visualises the full option chain as a colour-coded heatmap — darker shades
        indicate heavier OI concentration. At a glance you can see where option sellers have placed
        their bets, locate the Max Pain level, and identify dominant support/resistance walls.
      </P>

      <H3>Max Pain Calculation</H3>
      <Formula>{`For each candidate expiry price S in [open − 10%, open + 10%]:
  pain(S) = Σ [ CE_OI(k) × max(0, S − k)
              + PE_OI(k) × max(0, k − S) ]
             for all strikes k

maxPain = S that minimises pain(S)

Intuition: option buyers pay maximum premium collectively at this strike.
Market-makers have the most profitable outcome when spot expires here.`}</Formula>

      <H3>Put-Call Ratio (PCR)</H3>
      <Formula>{`pcr = Σ(PE OI across all strikes) / Σ(CE OI across all strikes)

Interpretation:
  pcr > 1.2 → Bullish  (put writers dominating — smart money expects support)
  pcr 0.8–1.2 → Neutral
  pcr < 0.8 → Bearish  (call writers dominating — smart money expects ceiling)`}</Formula>

      <H3>Key Levels Derived</H3>
      <Table
        headers={['Level', 'Formula', 'Role']}
        rows={[
          ['CE Wall',       'Strike with max CE OI',              'Hard resistance — ceiling where option sellers are concentrated'],
          ['PE Wall',       'Strike with max PE OI',              'Hard support — floor where put sellers are concentrated'],
          ['Max Pain',      'Minimum total pain strike',           'Expiry pin target — highest probability EOD zone'],
          ['Near Resistance','Highest CE OI within ATM+5 strikes','Intraday resistance'],
          ['Near Support',   'Highest PE OI within ATM−5 strikes','Intraday support'],
        ]}
      />

      <H3>Options Trading Playbook</H3>
      <Table
        headers={['Scenario', 'Trade']}
        rows={[
          ['Spot well above Max Pain', 'Sell CE at CE Wall; Buy PE near Max Pain'],
          ['Spot well below Max Pain', 'Buy CE near Max Pain; Sell PE at PE Wall'],
          ['Spot at Max Pain', 'Sell strangle outside both walls'],
          ['PCR > 1.5', 'Strong bullish — put writers highly confident; add CE buys'],
          ['PCR < 0.7', 'Strong bearish — call writers dominant; add PE buys'],
        ]}
      />
    </div>
  );
}

function SectorContent() {
  return (
    <div>
      <P>
        The Sector Rotation tool implements a Relative Rotation Graph (RRG) — the same framework
        used by institutional fund managers to identify which sectors are leading or lagging
        the broad market. It tells you where the money is flowing <em>right now</em>.
      </P>

      <H3>Step 1 — Relative Strength Ratio (RS-Ratio)</H3>
      <Formula>{`For each sector vs. NIFTY 50 benchmark:
  RS(t) = sector_close(t) / nifty_close(t)
  RS_ratio(t) = RS(t) / mean(RS over lookback) × 100

  RS_ratio > 100 → sector outperforming NIFTY
  RS_ratio < 100 → sector underperforming NIFTY`}</Formula>

      <H3>Step 2 — RS Momentum</H3>
      <Formula>{`RS_momentum(t) = (RS_ratio(t) − RS_ratio(t−1)) × 8 + 100

  RS_momentum > 100 → relative strength is improving (rising)
  RS_momentum < 100 → relative strength is fading (falling)`}</Formula>

      <H3>Step 3 — RRG Quadrant Assignment</H3>
      <Formula>{`X-axis: RS-Ratio   (< 100 = underperforming, > 100 = outperforming)
Y-axis: RS-Momentum (< 100 = fading momentum, > 100 = rising momentum)

LEADING:   RS-Ratio ≥ 100  AND  RS-Momentum ≥ 100
           → Best long candidates; outperforming and accelerating

WEAKENING: RS-Ratio ≥ 100  AND  RS-Momentum < 100
           → Recently outperforming but losing steam; reduce longs

LAGGING:   RS-Ratio < 100  AND  RS-Momentum < 100
           → Underperforming and getting worse; avoid / short bias

IMPROVING: RS-Ratio < 100  AND  RS-Momentum ≥ 100
           → Underperforming but turning around; early opportunity`}</Formula>

      <H3>Rotation Cycle</H3>
      <P>Sectors rotate clockwise through quadrants over time:</P>
      <Formula>{`IMPROVING → LEADING → WEAKENING → LAGGING → IMPROVING → ...

Strategy:
  Buy sectors in IMPROVING phase (early entry before they reach LEADING)
  Reduce/exit in WEAKENING phase
  Avoid LAGGING sectors`}</Formula>
    </div>
  );
}

function GCTContent() {
  return (
    <div>
      <P>
        Multi-Timeframe GCT (Gravitational Crash Levels) identifies key price zones based on the
        historical range across Monthly, Weekly, and Daily timeframes. When all three timeframes
        agree on a zone, the confluence creates extremely high-probability support or resistance.
      </P>

      <H3>GCT Levels Per Timeframe</H3>
      <Formula>{`Inputs per timeframe (Monthly=14 candles, Weekly=6 candles, Daily=4 candles):
  maxHigh  = max(closes in window)
  minLow   = min(closes in window)
  avgClose = mean(closes in window)
  range    = maxHigh − minLow

Key levels:
  AL  (Above Level)    = maxHigh × 0.97             ← entry zone for breakout
  MGC (Magnet)         = avgClose                    ← mean-reversion target
  CL  (Crash Level)    = minLow + range × 0.15       ← first danger level
  L1  (Level 1 crash)  = minLow + range × 0.08       ← deeper crash level
  L2  (Level 2 crash)  = minLow                      ← full range low
  U1  (Extension 1)    = maxHigh × 1.08              ← breakout target 1
  U2  (Extension 2)    = maxHigh × 1.18              ← breakout target 2`}</Formula>

      <H3>Zone Assignment</H3>
      <Formula>{`currentPrice ≥ AL              → BUY ZONE    (bullish momentum, above all resistance)
MGC ≤ currentPrice < AL        → WATCH ZONE  (neutral; potential breakout or rejection)
CL  ≤ currentPrice < MGC       → DANGER ZONE (bearish; below mean, watch for crash)
currentPrice < CL              → CRASH ZONE  (highest bearish conviction; full crash mode)`}</Formula>

      <H3>Confluence Detection (Multi-Timeframe)</H3>
      <Formula>{`Levels within 2% of each other across Monthly / Weekly / Daily are grouped.
Confluence strength = number of timeframes agreeing.

Strength 1 (single TF):    Watch level
Strength 2 (two TFs):      High-conviction S/R
Strength 3 (all three TFs): TRIPLE CONFLUENCE — strongest possible level`}</Formula>

      <H3>Trading Application</H3>
      <Table
        headers={['Zone', 'Trade Bias', 'Entry Trigger']}
        rows={[
          ['BUY ZONE',    'LONG',    'Price ≥ AL on Monthly + Weekly confluence → buy dips to MGC'],
          ['WATCH ZONE',  'NEUTRAL', 'Wait for breakout above AL or breakdown below MGC'],
          ['DANGER ZONE', 'SHORT',   'Price below MGC + Daily in CRASH → short at CL rejection'],
          ['CRASH ZONE',  'SHORT',   'Strong bearish; target L1 then L2 as downside levels'],
        ]}
      />
    </div>
  );
}

function ScannerContent() {
  return (
    <div>
      <P>
        The Options Scanner detects abnormal OI building at specific strikes by comparing today's
        chain to the previous day's chain. Large, sudden OI changes reveal where institutional
        players are adding positions — either defensively (writing options to collect premium)
        or directionally (hedging large cash positions).
      </P>

      <H3>OI Change Signal</H3>
      <Formula>{`oiChange    = curr_OI(K) − prev_OI(K)
oiChangePct = |oiChange / prev_OI(K)| × 100

Strength classification:
  oiChangePct > 200%  → EXTREME     (exceptional institutional activity)
  oiChangePct > 100%  → VERY HIGH   (large position build)
  oiChangePct > 50%   → HIGH        (notable activity)
  oiChangePct ≤ 50%   → filtered out`}</Formula>

      <H3>Signal Interpretation</H3>
      <Table
        headers={['Side', 'OI Direction', 'Signal Name', 'Meaning']}
        rows={[
          ['CALL (CE)', 'OI increasing', 'BEARISH_BUILD',  'Call writers expect price ≤ this strike; hard ceiling forming'],
          ['CALL (CE)', 'OI decreasing', 'CE_UNWIND',      'Call writers closing — ceiling weakening, upside opens'],
          ['PUT (PE)',  'OI increasing', 'BULLISH_BUILD',  'Put writers expect price ≥ this strike; hard floor forming'],
          ['PUT (PE)',  'OI decreasing', 'PE_UNWIND',      'Put writers closing — floor weakening, downside opens'],
        ]}
      />

      <H3>How to Use</H3>
      <P>
        Look for EXTREME strength signals near key Max Pain levels or existing gamma walls.
        If BULLISH_BUILD appears at a strike coinciding with the PE Wall, the floor is extremely
        strong — price unlikely to break that support on the current expiry. If BEARISH_BUILD
        forms at the CE Wall with EXTREME strength, the ceiling is being re-affirmed — do not
        chase breakouts above it without confirmation.
      </P>
    </div>
  );
}

function FocusContent() {
  return (
    <div>
      <P>
        Daily Focus simplifies the option chain to just 3 strikes per index per day — one strike
        each for CE buyers, PE buyers, and option sellers (strangle). It removes noise and gives
        both beginners and experienced traders a clear decision point.
      </P>

      <H3>Strike Interval Auto-Detection</H3>
      <Formula>{`gaps = [ strike(i+1) − strike(i) for all consecutive strikes in chain ]
interval = mode(gaps)   ← most common gap = actual index strike interval

NIFTY50: 50 pts   BANKNIFTY: 100 pts   FINNIFTY: 50 pts`}</Formula>

      <H3>ATM Identification</H3>
      <Formula>{`ATM = nearest strike to current open price
ATM = round(open / interval) × interval`}</Formula>

      <H3>Buyer Strike Selection</H3>
      <Formula>{`CE buyer range: 5 strikes ITM to 2 strikes OTM above ATM
PE buyer range: 2 strikes OTM to 5 strikes ITM below ATM

Best CE buy strike: highest volume CE within range (most liquid)
Best PE buy strike: highest volume PE within range (most liquid)

Liquidity filter: avoid strikes with OI < 5% of max OI on that side`}</Formula>

      <H3>Seller Strike Selection (Strangle)</H3>
      <Formula>{`CE seller wall = strike with max CE OI at or above Max Pain
PE seller wall = strike with max PE OI at or below Max Pain

Strangle range = CE_wall − PE_wall   (the no-fly zone for sellers)
Premium collected = CE_LTP + PE_LTP at those strikes`}</Formula>

      <H3>Output</H3>
      <P>For each index every morning: one CE buy strike, one PE buy strike, one strangle (CE sell + PE sell strikes), and the total strangle premium collected.</P>
    </div>
  );
}

function BacktestContent() {
  return (
    <div>
      <P>
        The Backtest Engine reruns the God Particle Index Forecast model on any historical date
        using the actual option chain data from that day, then compares the predicted levels to
        what actually happened (from OHLC data). This lets you validate the model's accuracy
        across market regimes.
      </P>

      <H3>Data Requirements</H3>
      <Table
        headers={['Requirement', 'Source', 'Used For']}
        rows={[
          ['Option chain (strike_data)', 'market_data table for that date', 'computeIndexForecast inputs'],
          ['Previous day chain',         'market_data row before that date', 'OI velocity, COI signals'],
          ['OHLC (actual outcome)',      'index_ohlc table',                'Comparing predictions to reality'],
          ['VIX on that date',          'market_data.vix column',          'Range calculation'],
          ['FII data for that date',    'fii_data, fii_activity tables',   'Flow signals'],
        ]}
      />

      <H3>Accuracy Scoring (0–100)</H3>
      <Formula>{`directionScore (50 points):
  If BULLISH prediction AND actual_close > actual_open:  +50
  If BEARISH prediction AND actual_close < actual_open:  +50
  If NEUTRAL prediction AND |close − open| < 1% × open: +50
  Else: 0

tolerance = 50 points (applies to high/low/close checks)

highScore  (15 points): if |predicted_high  − actual_high|  ≤ 50: +15
lowScore   (15 points): if |predicted_low   − actual_low|   ≤ 50: +15
closeScore (20 points): if |predicted_close − actual_close| ≤ 50: +20

totalScore = directionScore + highScore + lowScore + closeScore   (max 100)`}</Formula>

      <H3>Batch Analysis</H3>
      <P>When run across multiple dates, the engine reports:</P>
      <Table
        headers={['Metric', 'Definition']}
        rows={[
          ['Direction accuracy %', '% of days where bias was correct'],
          ['High accuracy %',      '% of days where predicted high was within ±50 pts of actual'],
          ['Low accuracy %',       '% of days where predicted low was within ±50 pts of actual'],
          ['Close accuracy %',     '% of days where predicted close was within ±50 pts of actual'],
          ['Average score',        'Mean totalScore across all tested dates'],
        ]}
      />
    </div>
  );
}

function AlertsContent() {
  return (
    <div>
      <P>
        Alerts Center lets you set price-based notifications for any stock or index.
        When the live price crosses your threshold, you receive an in-app notification.
        No API key required — prices are polled in real time.
      </P>

      <H3>How Alerts Work</H3>
      <Formula>{`Setup:
  symbol    = any NSE/BSE stock or index symbol
  target    = your price threshold
  condition = ABOVE or BELOW

Poll cycle: every 60 seconds while the app is open

Trigger logic:
  ABOVE alert: triggered if current_price ≥ target
  BELOW alert: triggered if current_price ≤ target

On trigger:
  → Record trigger_timestamp and trigger_price in DB
  → Mark alert as triggered (stops further polling for that alert)
  → Show in-app notification badge`}</Formula>

      <H3>Alert Management</H3>
      <Table
        headers={['Status', 'Meaning']}
        rows={[
          ['ACTIVE',    'Live — price not yet reached your target'],
          ['TRIGGERED', 'Fired — price crossed your threshold (shown with timestamp)'],
          ['EXPIRED',   'Created before today — still shown for review but no longer polling'],
        ]}
      />
    </div>
  );
}

function JournalContent() {
  return (
    <div>
      <P>
        The Trade Journal is a personal trade log where you record every trade you take —
        entries, exits, trade type, direction, and notes. It automatically calculates
        your P&L, win rate, and breakeven premium (for options trades).
      </P>

      <H3>Trade Fields</H3>
      <Table
        headers={['Field', 'Options', 'Required']}
        rows={[
          ['Symbol',      'Any NSE stock/index symbol', 'Yes'],
          ['Trade Type',  'CE / PE / STOCK / INTRADAY', 'Yes'],
          ['Direction',   'BUY / SELL',                 'Yes'],
          ['Entry Price', 'Per unit ₹',                 'Yes'],
          ['Entry Date',  'Calendar date',              'Yes'],
          ['Quantity',    'Lots or shares',             'Yes'],
          ['Exit Price',  'Per unit ₹',                 'No (open trade)'],
          ['Exit Date',   'Calendar date',              'No (open trade)'],
          ['GCT Zone',    'BUY / WATCH / DANGER / CRASH ZONE', 'No'],
          ['Notes',       'Free text',                  'No'],
        ]}
      />

      <H3>Automatic P&L Calculations</H3>
      <Formula>{`For closed trades:
  pnl = (exit_price − entry_price) × qty   [if BUY direction]
  pnl = (entry_price − exit_price) × qty   [if SELL direction]

Win = pnl > 0
Loss = pnl < 0

Aggregate stats:
  totalPnL   = Σ(pnl for all closed trades)
  winRate    = (# winning trades / # closed trades) × 100
  avgWin     = mean(pnl for winning trades)
  avgLoss    = mean(pnl for losing trades)
  profitFactor = |totalWins / totalLosses|

For options (CE/PE) — Breakeven:
  Breakeven(CE buy) = entry_strike + entry_premium
  Breakeven(PE buy) = entry_strike − entry_premium`}</Formula>

      <H3>GCT Zone Tagging</H3>
      <P>
        Optionally tag each trade with the GCT zone at entry. Over time this shows you which
        zones produce your best results — helping you focus on the highest edge setups.
      </P>
    </div>
  );
}

const CONTENT: Record<SectionId, React.ReactNode> = {
  forecast:  <ForecastContent />,
  z2h:       <Z2HContent />,
  gamma:     <GammaContent />,
  oiheatmap: <OIHeatmapContent />,
  sector:    <SectorContent />,
  gct:       <GCTContent />,
  scanner:   <ScannerContent />,
  focus:     <FocusContent />,
  backtest:  <BacktestContent />,
  alerts:    <AlertsContent />,
  journal:   <JournalContent />,
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Methodology() {
  const [active, setActive] = useState<SectionId | null>(null);

  function toggle(id: SectionId) {
    setActive(prev => (prev === id ? null : id));
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
      {/* grid background */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      {/* nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#1e1e2e]">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#f0c040] rounded-xl flex items-center justify-center text-lg">⚛</div>
          <div className="font-bold text-base">God Particle</div>
        </Link>
        <Link to="/dashboard" className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040] transition-colors">← Dashboard</Link>
      </nav>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-10">

        {/* header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="text-3xl">📐</div>
            <h1 className="text-3xl font-black tracking-tight">How It Works</h1>
          </div>
          <p className="text-sm text-[#9898a8] leading-relaxed max-w-2xl">
            Every analysis tool in God Particle is built on quantitative models derived from live
            option chain data, institutional flow, and price action. This page explains every
            calculation — inputs, formulas, thresholds, and trading logic — in full detail.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <Tag color="#f0c040">Options Theory</Tag>
            <Tag color="#a78bfa">Expiry Mechanics</Tag>
            <Tag color="#34d399">Greek-Based</Tag>
            <Tag color="#f97316">OI Analysis</Tag>
            <Tag color="#38bdf8">Relative Strength</Tag>
            <Tag color="#fb7185">Multi-Timeframe</Tag>
          </div>
        </div>

        {/* section list */}
        <div className="space-y-3">
          {SECTIONS.map(sec => {
            const isOpen = active === sec.id;
            return (
              <div
                key={sec.id}
                className="border border-[#1e1e2e] rounded-2xl overflow-hidden transition-all"
                style={isOpen ? { borderColor: `${sec.color}40` } : {}}
              >
                {/* header row — always visible */}
                <button
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#111118] transition-colors text-left"
                  onClick={() => toggle(sec.id)}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                      style={{ backgroundColor: `${sec.color}15`, border: `1px solid ${sec.color}30` }}
                    >
                      {sec.icon}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-[#e8e8f0]">{sec.title}</div>
                      <div className="text-xs font-mono text-[#6b6b85] mt-0.5">{sec.subtitle}</div>
                    </div>
                  </div>
                  <div
                    className="text-lg transition-transform duration-200 flex-shrink-0 ml-4"
                    style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', color: sec.color }}
                  >
                    ▾
                  </div>
                </button>

                {/* expandable body */}
                {isOpen && (
                  <div className="px-5 pb-6 border-t border-[#1e1e2e]">
                    <div className="pt-5">
                      {CONTENT[sec.id]}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* footer note */}
        <div className="mt-10 text-center">
          <p className="text-xs font-mono text-[#4b4b6b]">
            All data is sourced from NSE option chains, OHLC feeds, and FII/DII flows. Models are
            re-evaluated daily and may be updated as market microstructure evolves.
          </p>
        </div>
      </div>
    </div>
  );
}
