// cashfree-webhook — handles Cashfree subscription lifecycle events

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-signature',
};

const PLAN_CREDITS = {
  gp_basic_monthly:   100,
  gp_premium_monthly: 0,
};

const PLAN_ROLE = {
  gp_basic_monthly:   'basic',
  gp_premium_monthly: 'premium',
};

async function verifySignature(secret, timestamp, body, sig) {
  const message = timestamp + body;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(mac))) === sig;
}

async function patchRow(supabaseUrl, serviceKey, rowId, data) {
  const url = supabaseUrl + '/rest/v1/profiles?id=eq.' + rowId;
  await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': 'Bearer ' + serviceKey,
      'apikey': serviceKey,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(data),
  });
}

async function findBySub(supabaseUrl, serviceKey, subId, fields) {
  const url = supabaseUrl + '/rest/v1/profiles?subscription_id=eq.' + encodeURIComponent(subId) + '&select=' + fields;
  const res = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + serviceKey, 'apikey': serviceKey },
  });
  const rows = await res.json();
  if (!rows || !rows[0]) return null;
  return rows[0];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const CF_SECRET    = Deno.env.get('CASHFREE_SECRET_KEY');

  const respond = (body, status) => {
    return new Response(JSON.stringify(body), {
      status: status || 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  };

  try {
    const rawBody = await req.text();
    const sig       = req.headers.get('x-webhook-signature') || '';
    const timestamp = req.headers.get('x-webhook-timestamp') || '';

    if (CF_SECRET && sig) {
      const valid = await verifySignature(CF_SECRET, timestamp, rawBody, sig);
      if (!valid) return respond({ error: 'Invalid signature' }, 401);
    }

    const event     = JSON.parse(rawBody);
    const eventType = event['type'];
    const sub       = (event['data'] && event['data']['subscription']) || {};

    if (eventType === 'SUBSCRIPTION_PAYMENT_SUCCESS') {
      const subId  = sub['subscription_id'];
      const planId = sub['plan_id'];

      if (!subId) return respond({ received: true });

      const row = await findBySub(SUPABASE_URL, SERVICE_KEY, subId, 'id,credits');
      if (!row) return respond({ received: true });

      const rowId      = row['id'];
      const rowCredits = row['credits'] || 0;
      const role       = PLAN_ROLE[planId]    || 'basic';
      const addCredits = PLAN_CREDITS[planId] || 0;

      const patch = { role: role, subscription_status: 'ACTIVE' };
      if (sub['next_payment_time']) patch['subscription_next_billing'] = sub['next_payment_time'];
      if (addCredits > 0) patch['credits'] = rowCredits + addCredits;

      await patchRow(SUPABASE_URL, SERVICE_KEY, rowId, patch);
      return respond({ received: true });
    }

    if (eventType === 'SUBSCRIPTION_STATUS_CHANGE') {
      const subId  = sub['subscription_id'];
      const status = sub['subscription_status'];

      if (!subId || !status) return respond({ received: true });

      const row = await findBySub(SUPABASE_URL, SERVICE_KEY, subId, 'id');
      if (!row) return respond({ received: true });

      const rowId = row['id'];
      const patch = { subscription_status: status };
      if (status === 'CANCELLED' || status === 'EXPIRED') patch['role'] = 'free';

      await patchRow(SUPABASE_URL, SERVICE_KEY, rowId, patch);
      return respond({ received: true });
    }

    return respond({ received: true });

  } catch (err) {
    console.error('Webhook error:', err.message);
    return respond({ error: err.message }, 500);
  }
});
