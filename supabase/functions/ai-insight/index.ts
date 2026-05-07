// ai-insight — calls Claude Haiku to generate plain-English trade commentary
// Supports: z2h_signal (Max Pain Pull / Gamma Wall Squeeze) + stock_gct (God Particle Analysis)
// API key stored as ANTHROPIC_API_KEY secret in Supabase project settings

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL  = 'claude-haiku-4-5-20251001'; // fast + cheap for short insights

// Rate limit: 10 insights per user per hour
const rateLimitMap = new Map<string, { count: number; reset: number }>();
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.reset) {
    rateLimitMap.set(userId, { count: 1, reset: now + 3_600_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'content-type': 'application/json' },
  });
}

// ── PROMPT BUILDERS ─────────────────────────────────────────────────────────

function z2hPrompt(d: any): string {
  const isGamma = d.signal === 'GAMMA_WALL_SQUEEZE';
  const dir = d.direction === 'BULLISH' ? 'BULLISH (buy CE)' : 'BEARISH (buy PE)';
  const ind = d.indexKey ?? 'Index';
  const spot = Number(d.spot930 ?? 0).toLocaleString('en-IN');
  const mp   = Number(d.prevMaxPain ?? 0).toLocaleString('en-IN');
  const ts   = d.pullStrike;
  const ltp  = d.pullLTP;
  const sl   = d.targets?.sl ?? 0;
  const t1   = d.targets?.t1 ?? 0;
  const hero = d.targets?.hero ?? 0;

  if (isGamma) {
    const wall = d.wallStrike ?? 'N/A';
    const wallDist = Math.round(Number(d.wallStrike ?? 0) - Number(d.spot930 ?? 0));
    return `You are a professional options trader advising a retail client in India on an expiry day trade.

SETUP: GAMMA WALL SQUEEZE — ${dir}
Index: ${ind} | Spot at 9:30 AM: ₹${spot} | Max Pain: ₹${mp} (gap ${d.gapPct}%)
CE Wall (highest OI): ${wall} — ${wallDist} pts above spot — this is the SQUEEZE TARGET
Trade: Buy ${ts} ${d.optionType} at ₹${ltp} | SL ₹${sl} | T1 ₹${t1} | Hero ₹${hero}

Write EXACTLY 3 sentences. Each on a new line:
1. [WHY] Explain the gamma mechanics for THIS specific setup — why the wall forces writers to hedge
2. [WATCH] What price action or level confirms entry in the 9:30–10:30 AM window
3. [RISK] What would invalidate this trade — what price to exit immediately

Be specific to these exact numbers. Plain English, no jargon. No generic advice. Under 90 words total.`;
  }

  const gapDir = Number(d.gap ?? 0) > 0 ? 'below' : 'above';
  return `You are a professional options trader advising a retail client in India on an expiry day trade.

SETUP: MAX PAIN PULL — ${dir}
Index: ${ind} | Spot at 9:30 AM: ₹${spot} | Max Pain: ₹${mp}
Gap: ${d.gapPct}% — spot is ${gapDir} max pain (expiry gravity zone)
Trade: Buy ${ts} ${d.optionType} at ₹${ltp} | SL ₹${sl} | T1 ₹${t1} | Hero ₹${hero}

Write EXACTLY 3 sentences. Each on a new line:
1. [WHY] Explain WHY the ${d.gapPct}% gap creates expiry gravity for THIS trade
2. [WATCH] Entry trigger — what to look for in the 9:30–10:30 AM window
3. [RISK] What would invalidate this — specific price/time to exit

Be specific to these exact numbers. Plain English. Under 90 words total.`;
}

function stockGCTPrompt(d: any): string {
  const rec   = d.recommendation ?? 'WAIT';
  const conv  = d.conviction ?? 50;
  const bias  = d.bias ?? 'NEUTRAL';
  const sym   = d.symbol ?? 'Stock';
  const pcb   = Number(d.pcb ?? 0).toFixed(1);
  const vwap  = Number(d.vwap ?? 0).toFixed(1);
  const oiwap = Number(d.oiwap ?? 0).toFixed(1);
  const lc    = Number(d.lc ?? 0).toFixed(2);
  const sigs  = (d.signals ?? []).slice(0, 4).map((s: any) => `${s.name ?? s.label ?? ''}: ${s.value ?? ''}`).join(', ');

  return `You are a professional stock trader advising a retail client in India using the God Particle (GCT) system.

ANALYSIS RESULT: ${sym}
Recommendation: ${rec} | Conviction: ${conv}/100 | Bias: ${bias}
God Particle Close Below (PCB): ₹${pcb} — key level
VWAP: ₹${vwap} | OI-WAP: ₹${oiwap} | Last Close: ₹${lc}
Key signals: ${sigs || 'standard GCT analysis'}

Write EXACTLY 3 sentences. Each on a new line:
1. [READ] What the GCT data is saying about ${sym} right now — specifically the PCB vs last close
2. [ACTION] The exact trade plan: entry level, what to look for as confirmation
3. [RISK] Stop loss logic and what would invalidate the ${rec} call

Be specific to these numbers. Plain English. Under 90 words total.`;
}

// ── MAIN HANDLER ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
  if (req.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);

  // Auth — verify bearer token against Supabase
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return respond({ error: 'Unauthorized' }, 401);

  const sbUrl  = Deno.env.get('SUPABASE_URL') ?? '';
  const sbAnon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  let userId: string;
  try {
    const authRes = await fetch(`${sbUrl}/auth/v1/user`, {
      headers: { 'Authorization': authHeader, 'apikey': sbAnon },
    });
    if (!authRes.ok) return respond({ error: 'Unauthorized' }, 401);
    const { id } = await authRes.json();
    if (!id) return respond({ error: 'Unauthorized' }, 401);
    userId = id;
  } catch {
    return respond({ error: 'Unauthorized' }, 401);
  }

  if (!checkRateLimit(userId)) {
    return respond({ error: 'Rate limit reached — 10 AI insights per hour. Try again later.' }, 429);
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return respond({ error: 'AI not configured' }, 500);

  let body: any;
  try { body = await req.json(); } catch { return respond({ error: 'Invalid JSON' }, 400); }

  const { type, data } = body;
  let prompt: string;
  if (type === 'z2h_signal')  prompt = z2hPrompt(data);
  else if (type === 'stock_gct') prompt = stockGCTPrompt(data);
  else return respond({ error: 'Invalid type. Use z2h_signal or stock_gct.' }, 400);

  try {
    const aiRes = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 250,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      console.error('[ai-insight] Anthropic error:', err);
      return respond({ error: 'AI service error' }, 502);
    }

    const aiJson = await aiRes.json();
    const insight: string = aiJson.content?.[0]?.text?.trim() ?? '';
    return respond({ insight });
  } catch (err) {
    console.error('[ai-insight] fetch error:', err);
    return respond({ error: 'AI request failed' }, 502);
  }
});
