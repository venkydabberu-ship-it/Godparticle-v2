// activate-plan edge function
// Verifies Razorpay payment then upgrades user plan or adds credits

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLANS = {
  'Basic':   { role: 'basic',   credits: 50,   amount: 10000  },
  'Premium': { role: 'premium', credits: 200,  amount: 30000  },
  'Pro':     { role: 'pro',     credits: 3000, amount: 250000 },
};

const CREDIT_PACKS = {
  25:  5000,
  50:  10000,
  100: 20000,
  250: 50000,
};

Deno.serve(async function(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const RZP_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID');
  const RZP_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET');

  try {
    const body = await req.json();
    const paymentId = body.payment_id;
    const plan = body.plan;
    const credits = body.credits;

    if (!paymentId) throw new Error('Missing payment_id');

    // Identify user from JWT
    const authHeader = req.headers.get('Authorization') || '';
    const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { 'Authorization': authHeader, 'apikey': SERVICE_KEY },
    });
    const userData = await userRes.json();
    const userId = userData && userData.id;
    if (!userId) throw new Error('Unauthorized');

    // Verify payment with Razorpay API
    const credentials = btoa(RZP_KEY_ID + ':' + RZP_KEY_SECRET);
    const rzpRes = await fetch('https://api.razorpay.com/v1/payments/' + paymentId, {
      headers: { 'Authorization': 'Basic ' + credentials },
    });
    if (!rzpRes.ok) throw new Error('Could not verify payment — Razorpay API error ' + rzpRes.status);
    const payment = await rzpRes.json();

    if (payment.status !== 'captured') {
      throw new Error('Payment not captured. Status: ' + payment.status);
    }

    if (plan) {
      // ── Plan subscription ──
      const planConfig = PLANS[plan];
      if (!planConfig) throw new Error('Invalid plan: ' + plan);
      if (payment.amount !== planConfig.amount) {
        throw new Error('Amount mismatch. Expected ' + planConfig.amount + ' paise, got ' + payment.amount);
      }

      const updateRes = await fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + userId, {
        method: 'PATCH',
        headers: {
          'Authorization': 'Bearer ' + SERVICE_KEY,
          'apikey': SERVICE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ role: planConfig.role, credits: planConfig.credits }),
      });
      if (!updateRes.ok) throw new Error('Profile update failed');

    } else if (credits !== undefined && credits !== null) {
      // ── Credit pack purchase ──
      const creditNum = parseInt(String(credits));
      const expectedAmount = CREDIT_PACKS[creditNum];
      if (!expectedAmount) throw new Error('Invalid credit pack: ' + credits);
      if (payment.amount !== expectedAmount) {
        throw new Error('Amount mismatch for credits');
      }

      await fetch(SUPABASE_URL + '/rest/v1/rpc/add_credits', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + SERVICE_KEY,
          'apikey': SERVICE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_user_id: userId,
          p_credits: creditNum,
          p_type: 'purchase',
          p_description: 'Purchased ' + creditNum + ' credits',
        }),
      });
    } else {
      throw new Error('Must provide plan or credits');
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: Object.assign({}, CORS, { 'Content-Type': 'application/json' }) }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 400, headers: Object.assign({}, CORS, { 'Content-Type': 'application/json' }) }
    );
  }
});
