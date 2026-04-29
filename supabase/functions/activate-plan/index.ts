// activate-plan — one-time plan purchases + credit packs (no autopay)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// One-time plan purchases — valid 28 days from payment
const PLANS = {
  'Basic':   { role: 'basic',   credits: 150, amount: 99,  days: 28 },
  'Premium': { role: 'premium', credits: 0,   amount: 299, days: 28 },
};

const CREDIT_PACKS = { 60: 49, 140: 99, 320: 199 };

const CF_HOST = 'api.cashfree.com';
const CF_PG   = 'https://' + CF_HOST + '/pg';

function pgH(appId, secret) {
  return { 'x-client-id': appId, 'x-client-secret': secret, 'x-api-version': '2023-08-01', 'Content-Type': 'application/json' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const SB_URL    = Deno.env.get('SUPABASE_URL');
  const SB_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const CF_APP_ID = Deno.env.get('CASHFREE_APP_ID');
  const CF_SECRET = Deno.env.get('CASHFREE_SECRET_KEY');

  const respond = (body, status) => new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

  const sbGet = (path) => fetch(SB_URL + path, {
    headers: { 'Authorization': 'Bearer ' + SB_KEY, 'apikey': SB_KEY },
  });

  const sbPatch = (path, data) => fetch(SB_URL + path, {
    method: 'PATCH',
    headers: { 'Authorization': 'Bearer ' + SB_KEY, 'apikey': SB_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(data),
  });

  try {
    const body   = await req.json();
    const action = body['action'];

    // Auth
    const authHeader = req.headers.get('Authorization') || '';
    const userRes  = await fetch(SB_URL + '/auth/v1/user', {
      headers: { 'Authorization': authHeader, 'apikey': SB_KEY },
    });
    const userData = await userRes.json();
    const userId   = userData && userData['id'];
    if (!userId) throw new Error('Unauthorized');

    // Profile
    const profRes = await sbGet('/rest/v1/profiles?id=eq.' + userId + '&select=*');
    const profArr = await profRes.json();
    const profile = profArr && profArr[0];

    const patchProfile = async (data) => {
      const r = await sbPatch('/rest/v1/profiles?id=eq.' + userId, data);
      if (!r.ok) throw new Error('Profile update failed');
    };

    const patchAuthMeta = async (meta) => {
      await fetch(SB_URL + '/auth/v1/admin/users/' + userId, {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + SB_KEY, 'apikey': SB_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_metadata: meta }),
      });
    };

    // ── CREATE ORDER (plans + credit packs) ──
    if (action === 'create_order') {
      const amount    = Number(body['amount']);
      const email     = String(body['email']  || 'user@godparticle.app');
      const rawPhone  = String(body['phone']  || '9999999999').replace(/\D/g, '').slice(0, 10);
      const phone     = rawPhone || '9999999999';
      const returnUrl = String(body['return_url'] || 'https://godparticle-v2-ivory.vercel.app/pricing');
      const cleanId   = userId.replace(/-/g, '');
      const orderId   = 'gpcr' + cleanId.slice(0, 10) + Date.now();

      const cfRes = await fetch(CF_PG + '/orders', {
        method: 'POST',
        headers: pgH(CF_APP_ID, CF_SECRET),
        body: JSON.stringify({
          order_id:       orderId,
          order_amount:   amount,
          order_currency: 'INR',
          customer_details: {
            customer_id:    cleanId.slice(0, 32),
            customer_email: email,
            customer_phone: phone,
          },
          order_meta: { return_url: returnUrl },
        }),
      });

      if (!cfRes.ok) {
        const e = await cfRes.json();
        throw new Error('Cashfree order failed: ' + (e['message'] || cfRes.status));
      }

      const cfOrder = await cfRes.json();
      return respond({ order_id: cfOrder['order_id'], payment_session_id: cfOrder['payment_session_id'] });
    }

    // ── VERIFY PAYMENT (plans + credit packs) ──
    if (action === 'verify_payment') {
      const orderId = body['order_id'];
      if (!orderId) throw new Error('Missing order_id');

      const cfRes = await fetch(CF_PG + '/orders/' + orderId, { headers: pgH(CF_APP_ID, CF_SECRET) });
      if (!cfRes.ok) throw new Error('Cashfree verification failed: ' + cfRes.status);
      const cfOrder = await cfRes.json();

      if (cfOrder['order_status'] !== 'PAID') throw new Error('Payment not completed. Status: ' + cfOrder['order_status']);

      const paidAmount = Number(cfOrder['order_amount']);
      const planKey    = body['plan'];
      const credits    = body['credits'];

      // ── Plan purchase (Basic/Premium) ──
      if (planKey && PLANS[planKey]) {
        const planConfig = PLANS[planKey];
        if (Math.abs(paidAmount - planConfig['amount']) > 1) throw new Error('Amount mismatch for plan');

        const expiresAt = new Date(Date.now() + planConfig['days'] * 24 * 60 * 60 * 1000).toISOString();
        const updateData: any = {
          role:             planConfig['role'],
          credits_reset_at: expiresAt,
        };
        if (planConfig['credits'] > 0) {
          updateData['credits'] = planConfig['credits'];
        }
        await patchProfile(updateData);
        await patchAuthMeta({ role: planConfig['role'] });
        return respond({ success: true, plan: planKey, expires_at: expiresAt });
      }

      // ── Credit pack purchase ──
      const creditNum      = parseInt(String(credits));
      const expectedAmount = CREDIT_PACKS[creditNum];
      if (!expectedAmount) throw new Error('Invalid credit pack: ' + credits);
      if (Math.abs(paidAmount - expectedAmount) > 1) throw new Error('Amount mismatch for credits');

      const currentCredits = (profile && profile['credits']) || 0;
      await patchProfile({ credits: currentCredits + creditNum });

      return respond({ success: true });
    }

    throw new Error('Unknown action: ' + action);

  } catch (err) {
    return respond({ success: false, error: err.message }, 200);
  }
});
