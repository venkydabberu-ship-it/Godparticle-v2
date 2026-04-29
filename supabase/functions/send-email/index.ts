// send-email — transactional emails via Resend API
// Secrets required: RESEND_API_KEY

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FROM = 'God Particle <noreply@godparticle.life>';
const SUPPORT = 'support@godparticle.life';

function html(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{margin:0;padding:0;background:#0a0a0f;font-family:monospace,sans-serif;color:#e8e8f0}
  .wrap{max-width:520px;margin:0 auto;padding:32px 24px}
  .logo{width:40px;height:40px;background:#f0c040;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;margin-bottom:20px}
  h1{color:#f0c040;font-size:20px;margin:0 0 16px}
  p{color:#c8c8d8;font-size:13px;line-height:1.7;margin:0 0 14px}
  .btn{display:inline-block;background:#f0c040;color:#0a0a0f;font-weight:900;font-size:13px;padding:12px 28px;border-radius:10px;text-decoration:none;margin:8px 0}
  .code{background:#16161f;border:1px solid #1e1e2e;border-radius:8px;padding:16px 24px;font-size:24px;font-weight:900;letter-spacing:6px;color:#f0c040;text-align:center;margin:16px 0}
  .footer{margin-top:32px;padding-top:16px;border-top:1px solid #1e1e2e;color:#6b6b85;font-size:11px}
  a{color:#f0c040}
</style></head>
<body><div class="wrap">
  <div class="logo">⚛</div>
  <h1>${title}</h1>
  ${body}
  <div class="footer">
    God Particle Intelligence · <a href="https://godparticle.life">godparticle.life</a><br>
    Questions? <a href="mailto:${SUPPORT}">${SUPPORT}</a>
  </div>
</div></body></html>`;
}

const TEMPLATES: Record<string, (data: any) => { subject: string; html: string }> = {
  welcome: (d) => ({
    subject: 'Welcome to God Particle ⚛',
    html: html('Welcome, ' + (d.username || 'Trader') + '!', `
      <p>You're in. God Particle gives you institutional-grade options analysis for expiry day trading — the same tools the smart money uses, now in your pocket.</p>
      <p>You've started on the <strong style="color:#e8e8f0">Free plan</strong> with 50 analysis credits.</p>
      <p><strong style="color:#f0c040">What to do first:</strong></p>
      <p>· Go to <strong>Zero to Hero</strong> on expiry day and fetch the 9:30 AM snapshot<br>
         · Try <strong>Stock Intelligence</strong> to find crash-buy levels for any large-cap<br>
         · Check <strong>Trending Stocks</strong> before market opens for momentum picks</p>
      <a href="https://godparticle.life/dashboard" class="btn">Open Dashboard →</a>
      <p>If you need anything, reply to this email or contact us at <a href="mailto:${SUPPORT}">${SUPPORT}</a>.</p>
    `),
  }),

  otp: (d) => ({
    subject: 'Your God Particle verification code: ' + d.otp,
    html: html('Verify your account', `
      <p>Use this code to complete your sign-up. It expires in 10 minutes.</p>
      <div class="code">${d.otp}</div>
      <p>If you didn't request this, ignore this email — your account is safe.</p>
    `),
  }),

  password_reset: (d) => ({
    subject: 'Reset your God Particle password',
    html: html('Reset your password', `
      <p>We received a request to reset your password. Use the code below — it expires in 10 minutes.</p>
      <div class="code">${d.otp}</div>
      <p>If you didn't request a password reset, ignore this email. Your account remains secure.</p>
    `),
  }),

  payment_success: (d) => ({
    subject: '✅ Payment confirmed — ' + (d.plan || 'Plan') + ' activated',
    html: html('Payment Confirmed', `
      <p>Your <strong style="color:#f0c040">${d.plan || 'plan'}</strong> is now active.</p>
      <p>
        Amount paid: <strong style="color:#e8e8f0">₹${d.amount || ''}</strong><br>
        Valid until: <strong style="color:#e8e8f0">${d.expires || '28 days from today'}</strong>
      </p>
      <a href="https://godparticle.life/dashboard" class="btn">Go to Dashboard →</a>
      <p>For any billing questions, contact <a href="mailto:${SUPPORT}">${SUPPORT}</a>.</p>
    `),
  }),
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
  const SB_URL     = Deno.env.get('SUPABASE_URL');
  const SB_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  const respond = (body: any, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  try {
    if (!RESEND_KEY) throw new Error('RESEND_API_KEY not configured');

    // Auth check — must be service role or admin
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.includes(SB_KEY || '')) {
      // Check if it's an authenticated user call from the app
      const userRes = await fetch(SB_URL + '/auth/v1/user', {
        headers: { 'Authorization': authHeader, 'apikey': SB_KEY || '' },
      });
      const userData = await userRes.json();
      if (!userData?.id) return respond({ error: 'Unauthorized' }, 401);
    }

    const body = await req.json();
    const { template, to, data = {} } = body;

    if (!template || !to) throw new Error('Missing template or to');

    const tmpl = TEMPLATES[template];
    if (!tmpl) throw new Error('Unknown template: ' + template);

    const { subject, html: htmlBody } = tmpl(data);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + RESEND_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject,
        html: htmlBody,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error('Resend API error: ' + (err.message || res.status));
    }

    const result = await res.json();
    return respond({ success: true, id: result.id });

  } catch (err: any) {
    return respond({ success: false, error: err.message }, 200);
  }
});
