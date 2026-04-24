// activate-plan edge function — Cashfree Subscriptions + one-time credit packs
// Secrets: CASHFREE_APP_ID, CASHFREE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLANS: Record<string, { role: string; credits: number; amount: number; planId: string; planName: string }> = {
  'Basic':   { role: 'basic',   credits: 100, amount: 99,  planId: 'gp_basic_monthly',   planName: 'God Particle Basic Monthly'   },
  'Premium': { role: 'premium', credits: 0,   amount: 299, planId: 'gp_premium_monthly', planName: 'God Particle Premium Monthly' },
};

const CREDIT_PACKS: Record<number, number> = {
  60:  49,
  140: 99,
  320: 199,
};

const CF_PG  = 'https://api.cashfree.com/pg';
const CF_SUB = 'https://api.cashfree.com/subscriptions';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const CF_APP_ID    = Deno.env.get('CASHFREE_APP_ID')!;
  const CF_SECRET    = Deno.env.get('CASHFREE_SECRET_KEY')!;

  const respond = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  const pgHeaders = {
    'x-client-id':     CF_APP_ID,
    'x-client-secret': CF_SECRET,
    'x-api-version':   '2023-08-01',
    'Content-Type':    'application/json',
  };

  const subHeaders = {
    'x-client-id':     CF_APP_ID,
    'x-client-secret': CF_SECRET,
    'x-api-version':   '2022-09-01',
    'Content-Type':    'application/json',
  };

  try {
    const body = await req.json();
    const action = body.action as string;

    // Identify user from JWT
    const authHeader = req.headers.get('Authorization') || '';
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'Authorization': authHeader, 'apikey': SERVICE_KEY },
    });
    const userData = await userRes.json();
    const userId = userData?.id as string;
    if (!userId) throw new Error('Unauthorized');

    // ── GET PROFILE ──
    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
      headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY },
    });
    const profileArr = await profileRes.json();
    const profile = profileArr?.[0];

    const patchProfile = async (data: object) => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'apikey':        SERVICE_KEY,
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error('Profile update failed');
    };

    // ── CREATE SUBSCRIPTION ──
    if (action === 'create_subscription') {
      const planKey = body.plan as string;
      const planConfig = PLANS[planKey];
      if (!planConfig) throw new Error('Invalid plan: ' + planKey);

      const email    = String(body.email  || 'user@godparticle.app');
      const phone    = String(body.phone  || '9999999999').replace(/\D/g, '').slice(0, 10) || '9999999999';
      const returnUrl = String(body.return_url || 'https://godparticle-v2-ivory.vercel.app/pricing');

      // Ensure plan exists in Cashfree
      const planCheckRes = await fetch(`${CF_SUB}/plans/${planConfig.planId}`, { headers: subHeaders });
      if (!planCheckRes.ok) {
        const createPlanRes = await fetch(`${CF_SUB}/plans`, {
          method: 'POST',
          headers: subHeaders,
          body: JSON.stringify({
            plan_id:               planConfig.planId,
            plan_name:             planConfig.planName,
            plan_type:             'PERIODIC',
            plan_currency:         'INR',
            plan_recurring_amount: planConfig.amount,
            plan_max_cycles:       120,
            plan_intervals:        1,
            plan_interval_type:    'MONTH',
          }),
        });
        if (!createPlanRes.ok) {
          const e = await createPlanRes.json();
          throw new Error('Plan creation failed: ' + (e.message || JSON.stringify(e)));
        }
      }

      // First charge time: 5 minutes from now (Cashfree requires future time)
      const firstCharge = new Date(Date.now() + 5 * 60 * 1000);
      const firstChargeIST = new Date(firstCharge.getTime() + 5.5 * 60 * 60 * 1000)
        .toISOString().replace('Z', '+05:30');

      const subscriptionId = 'gpsub' + userId.replace(/-/g, '').slice(0, 10) + Date.now();

      const subRes = await fetch(`${CF_SUB}`, {
        method: 'POST',
        headers: subHeaders,
        body: JSON.stringify({
          subscription_id:            subscriptionId,
          plan_id:                    planConfig.planId,
          customer_details: {
            customer_id:    userId.replace(/-/g, '').slice(0, 32),
            customer_email: email,
            customer_phone: phone,
          },
          authorization: { authorization_amount: 1 },
          subscription_first_charge_time: firstChargeIST,
          subscription_expiry_time: '2035-12-31T23:59:59+05:30',
          subscription_return_url: returnUrl + '?sub_id=' + subscriptionId,
          subscription_note: planConfig.planName,
        }),
      });

      if (!subRes.ok) {
        const e = await subRes.json();
        throw new Error('Subscription creation failed: ' + (e.message || JSON.stringify(e)));
      }

      const subData = await subRes.json();

      // Save pending subscription to profile
      await patchProfile({
        subscription_id:     subscriptionId,
        subscription_status: 'INITIALIZED',
        subscription_plan:   planKey,
      });

      return respond({
        subscribe_url:   subData.subscribe_url || subData.subscription_url,
        subscription_id: subscriptionId,
      });
    }

    // ── VERIFY SUBSCRIPTION ──
    if (action === 'verify_subscription') {
      const subscriptionId = String(body.subscription_id || profile?.subscription_id);
      if (!subscriptionId) throw new Error('Missing subscription_id');

      const subRes = await fetch(`${CF_SUB}/${subscriptionId}`, { headers: subHeaders });
      if (!subRes.ok) throw new Error('Could not fetch subscription');
      const subData = await subRes.json();

      const status = subData.subscription_status as string;
      const planKey = profile?.subscription_plan || body.plan;
      const planConfig = PLANS[planKey];

      if (['ACTIVE', 'INITIALIZED', 'ON_HOLD'].includes(status) && planConfig) {
        const profileUpdate: Record<string, unknown> = {
          role:                planConfig.role,
          subscription_id:     subscriptionId,
          subscription_status: status,
          subscription_plan:   planKey,
          subscription_next_billing: subData.subscription_first_charge_time || null,
        };
        if (planConfig.credits > 0) profileUpdate.credits = planConfig.credits;
        await patchProfile(profileUpdate);
        return respond({ success: true, status });
      }

      return respond({ success: false, status, message: 'Subscription not active yet' });
    }

    // ── CANCEL SUBSCRIPTION ──
    if (action === 'cancel_subscription') {
      const subscriptionId = profile?.subscription_id;
      if (!subscriptionId) throw new Error('No active subscription found');

      const cancelRes = await fetch(`${CF_SUB}/${subscriptionId}/cancel`, {
        method: 'POST',
        headers: subHeaders,
        body: JSON.stringify({}),
      });

      // Update profile even if Cashfree call partially fails
      await patchProfile({ subscription_status: 'CANCELLED' });

      if (!cancelRes.ok) {
        const e = await cancelRes.json();
        throw new Error('Cashfree cancel failed: ' + (e.message || JSON.stringify(e)));
      }

      return respond({ success: true });
    }

    // ── CREATE ORDER (for credit packs — one-time) ──
    if (action === 'create_order') {
      const amount    = Number(body.amount);
      const email     = String(body.email  || 'user@godparticle.app');
      const phone     = String(body.phone  || '9999999999').replace(/\D/g, '').slice(0, 10) || '9999999999';
      const returnUrl = String(body.return_url || 'https://godparticle-v2-ivory.vercel.app/pricing');

      const orderId = 'gpcr' + userId.replace(/-/g, '').slice(0, 10) + Date.now();

      const cfRes = await fetch(`${CF_PG}/orders`, {
        method: 'POST',
        headers: pgHeaders,
        body: JSON.stringify({
          order_id:       orderId,
          order_amount:   amount,
          order_currency: 'INR',
          customer_details: {
            customer_id:    userId.replace(/-/g, '').slice(0, 32),
            customer_email: email,
            customer_phone: phone,
          },
          order_meta: { return_url: returnUrl },
        }),
      });

      if (!cfRes.ok) {
        const e = await cfRes.json();
        throw new Error('Cashfree order failed: ' + (e.message || cfRes.status));
      }

      const cfOrder = await cfRes.json();
      return respond({ order_id: cfOrder.order_id, payment_session_id: cfOrder.payment_session_id });
    }

    // ── VERIFY PAYMENT (for credit packs — one-time) ──
    if (action === 'verify_payment') {
      const orderId  = body.order_id as string;
      const credits  = body.credits as number;
      if (!orderId) throw new Error('Missing order_id');

      const cfRes = await fetch(`${CF_PG}/orders/${orderId}`, { headers: pgHeaders });
      if (!cfRes.ok) throw new Error('Cashfree verification failed: ' + cfRes.status);
      const cfOrder = await cfRes.json();

      if (cfOrder.order_status !== 'PAID') throw new Error('Payment not completed. Status: ' + cfOrder.order_status);

      const paidAmount = Number(cfOrder.order_amount);
      const creditNum  = parseInt(String(credits));
      const expectedAmount = CREDIT_PACKS[creditNum];
      if (!expectedAmount) throw new Error('Invalid credit pack: ' + credits);
      if (Math.abs(paidAmount - expectedAmount) > 1) throw new Error('Amount mismatch for credits');

      // Add credits to profile
      const currentCredits = profile?.credits ?? 0;
      await patchProfile({ credits: currentCredits + creditNum });

      return respond({ success: true });
    }

    throw new Error('Unknown action: ' + action);

  } catch (err: any) {
    return respond({ success: false, error: err.message }, 400);
  }
});
