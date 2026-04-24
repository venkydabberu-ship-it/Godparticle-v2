// cashfree-webhook — handles Cashfree subscription lifecycle events
// Secrets: CASHFREE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Register this URL in Cashfree Dashboard → Webhooks

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-signature',
};

// Basic plan: 100 credits renewed each cycle
const PLAN_CREDITS: Record<string, number> = {
  gp_basic_monthly:   100,
  gp_premium_monthly: 0,
};

const PLAN_ROLE: Record<string, string> = {
  gp_basic_monthly:   'basic',
  gp_premium_monthly: 'premium',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const CF_SECRET    = Deno.env.get('CASHFREE_SECRET_KEY')!;

  const respond = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  try {
    const rawBody = await req.text();

    // Verify Cashfree webhook signature (2025-01-01 format: HMAC-SHA256(timestamp + rawBody))
    const sig       = req.headers.get('x-webhook-signature') || '';
    const timestamp = req.headers.get('x-webhook-timestamp') || '';
    if (CF_SECRET && sig) {
      const message = timestamp + rawBody;
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(CF_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
      const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
      if (expected !== sig) {
        console.error('Webhook signature mismatch');
        return respond({ error: 'Invalid signature' }, 401);
      }
    }

    const event = JSON.parse(rawBody);
    const eventType = event.type as string;

    console.log('Cashfree webhook:', eventType, JSON.stringify(event).slice(0, 300));

    // ── SUBSCRIPTION PAYMENT SUCCESS ──
    if (eventType === 'SUBSCRIPTION_PAYMENT_SUCCESS' || eventType === 'PAYMENT_SUCCESS_WEBHOOK') {
      const subId  = event.data?.subscription?.subscription_id || event.data?.subscription_id;
      const planId = event.data?.subscription?.plan_id         || event.data?.plan_id;

      if (!subId) {
        console.warn('No subscription_id in event');
        return respond({ received: true });
      }

      // Find profile by subscription_id
      const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?subscription_id=eq.${encodeURIComponent(subId)}&select=id,credits`,
        { headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY } },
      );
      const profiles = await profileRes.json();
      const profile  = profiles?.[0];

      if (!profile) {
        console.warn('No profile found for subscription_id:', subId);
        return respond({ received: true });
      }

      const role        = PLAN_ROLE[planId]    ?? 'basic';
      const newCredits  = PLAN_CREDITS[planId] ?? 0;
      const patchData: Record<string, unknown> = {
        role,
        subscription_status: 'ACTIVE',
        subscription_next_billing: event.data?.subscription?.next_payment_time || null,
      };
      if (newCredits > 0) {
        patchData.credits = (profile.credits ?? 0) + newCredits;
      }

      const patchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${profile.id}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'apikey':        SERVICE_KEY,
            'Content-Type':  'application/json',
            'Prefer':        'return=minimal',
          },
          body: JSON.stringify(patchData),
        },
      );
      if (!patchRes.ok) throw new Error('Profile update failed');

      console.log('Renewed subscription for user:', profile.id, 'plan:', planId, 'credits added:', newCredits);
      return respond({ received: true });
    }

    // ── SUBSCRIPTION STATUS CHANGE ──
    if (eventType === 'SUBSCRIPTION_STATUS_CHANGE' || eventType === 'SUBSCRIPTION_STATUS_WEBHOOK') {
      const subId  = event.data?.subscription?.subscription_id || event.data?.subscription_id;
      const status = event.data?.subscription?.subscription_status || event.data?.status;

      if (!subId || !status) return respond({ received: true });

      const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?subscription_id=eq.${encodeURIComponent(subId)}&select=id,role`,
        { headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY } },
      );
      const profiles = await profileRes.json();
      const profile  = profiles?.[0];
      if (!profile) return respond({ received: true });

      const patchData: Record<string, unknown> = { subscription_status: status };

      // If cancelled/expired, revert to free
      if (['CANCELLED', 'EXPIRED', 'BANK_APPROVAL_PENDING'].includes(status)) {
        patchData.role = 'free';
      }

      await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${profile.id}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'apikey':        SERVICE_KEY,
            'Content-Type':  'application/json',
            'Prefer':        'return=minimal',
          },
          body: JSON.stringify(patchData),
        },
      );

      console.log('Subscription status change for user:', profile.id, '->', status);
      return respond({ received: true });
    }

    // Unknown event — acknowledge to prevent retries
    console.log('Unhandled event type:', eventType);
    return respond({ received: true });

  } catch (err: any) {
    console.error('Webhook error:', err.message);
    return respond({ error: err.message }, 500);
  }
});
