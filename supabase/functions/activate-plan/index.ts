// activate-plan edge function — Cashfree payment gateway
// Secrets: CASHFREE_APP_ID, CASHFREE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Amounts in rupees (Cashfree uses rupees, not paise)
const PLANS = {
  'Basic':   { role: 'basic',   credits: 50,   amount: 100   },
  'Premium': { role: 'premium', credits: 200,  amount: 300   },
  'Pro':     { role: 'pro',     credits: 3000, amount: 2500  },
};

const CREDIT_PACKS = {
  25:  50,
  50:  100,
  100: 200,
  250: 500,
};

const CF_BASE = 'https://api.cashfree.com/pg';

Deno.serve(async function(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  var SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  var SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  var CF_APP_ID    = Deno.env.get('CASHFREE_APP_ID');
  var CF_SECRET    = Deno.env.get('CASHFREE_SECRET_KEY');

  var respond = function(body, status) {
    return new Response(JSON.stringify(body), {
      status: status || 200,
      headers: Object.assign({}, CORS, { 'Content-Type': 'application/json' }),
    });
  };

  try {
    var body = await req.json();
    var action = body.action;

    // Identify user from JWT
    var authHeader = req.headers.get('Authorization') || '';
    var userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { 'Authorization': authHeader, 'apikey': SERVICE_KEY },
    });
    var userData = await userRes.json();
    var userId = userData && userData.id;
    if (!userId) throw new Error('Unauthorized');

    var cfHeaders = {
      'x-client-id':     CF_APP_ID,
      'x-client-secret': CF_SECRET,
      'x-api-version':   '2023-08-01',
      'Content-Type':    'application/json',
    };

    // ── CREATE ORDER ──
    // Returns payment_session_id so frontend can open Cashfree checkout
    if (action === 'create_order') {
      var amount    = Number(body.amount);
      var email     = String(body.email  || 'user@godparticle.app');
      var phone     = String(body.phone  || '9999999999').replace(/\D/g, '').slice(0, 10) || '9999999999';
      var returnUrl = String(body.return_url || 'https://godparticle-v2-ivory.vercel.app/pricing');

      var orderId = 'gp' + userId.replace(/-/g, '').slice(0, 10) + Date.now();

      var cfRes = await fetch(CF_BASE + '/orders', {
        method: 'POST',
        headers: cfHeaders,
        body: JSON.stringify({
          order_id:      orderId,
          order_amount:  amount,
          order_currency: 'INR',
          customer_details: {
            customer_id:    userId.replace(/-/g, '').slice(0, 32),
            customer_email: email,
            customer_phone: phone,
          },
          order_meta: {
            return_url: returnUrl,
          },
        }),
      });

      if (!cfRes.ok) {
        var cfErr = await cfRes.json();
        throw new Error('Cashfree order failed: ' + (cfErr.message || cfRes.status));
      }

      var cfOrder = await cfRes.json();
      return respond({
        order_id:           cfOrder.order_id,
        payment_session_id: cfOrder.payment_session_id,
      });
    }

    // ── VERIFY PAYMENT ──
    // Fetches order from Cashfree, checks PAID status and amount, then activates
    if (action === 'verify_payment') {
      var orderId   = body.order_id;
      var plan      = body.plan;
      var credits   = body.credits;

      if (!orderId) throw new Error('Missing order_id');

      var cfRes = await fetch(CF_BASE + '/orders/' + orderId, { headers: cfHeaders });
      if (!cfRes.ok) throw new Error('Cashfree verification failed: ' + cfRes.status);
      var cfOrder = await cfRes.json();

      if (cfOrder.order_status !== 'PAID') {
        throw new Error('Payment not completed. Status: ' + cfOrder.order_status);
      }

      var paidAmount = Number(cfOrder.order_amount);

      if (plan) {
        var planConfig = PLANS[plan];
        if (!planConfig) throw new Error('Invalid plan: ' + plan);
        if (Math.abs(paidAmount - planConfig.amount) > 1) {
          throw new Error('Amount mismatch. Expected ₹' + planConfig.amount + ', got ₹' + paidAmount);
        }

        var updateRes = await fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + userId, {
          method: 'PATCH',
          headers: {
            'Authorization': 'Bearer ' + SERVICE_KEY,
            'apikey':         SERVICE_KEY,
            'Content-Type':   'application/json',
            'Prefer':         'return=minimal',
          },
          body: JSON.stringify({ role: planConfig.role, credits: planConfig.credits }),
        });
        if (!updateRes.ok) throw new Error('Profile update failed');

      } else if (credits !== undefined && credits !== null) {
        var creditNum      = parseInt(String(credits));
        var expectedAmount = CREDIT_PACKS[creditNum];
        if (!expectedAmount) throw new Error('Invalid credit pack: ' + credits);
        if (Math.abs(paidAmount - expectedAmount) > 1) {
          throw new Error('Amount mismatch for credits');
        }

        await fetch(SUPABASE_URL + '/rest/v1/rpc/add_credits', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + SERVICE_KEY,
            'apikey':         SERVICE_KEY,
            'Content-Type':   'application/json',
          },
          body: JSON.stringify({
            p_user_id:    userId,
            p_credits:    creditNum,
            p_type:       'purchase',
            p_description: 'Purchased ' + creditNum + ' credits via Cashfree',
          }),
        });

      } else {
        throw new Error('Must provide plan or credits');
      }

      return respond({ success: true });
    }

    throw new Error('Unknown action: ' + action);

  } catch (err) {
    return respond({ success: false, error: err.message }, 400);
  }
});
