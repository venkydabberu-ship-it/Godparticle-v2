import { Link } from 'react-router-dom';

export default function Refund() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0]">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(240,192,64,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(240,192,64,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#1e1e2e]">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#f0c040] rounded-xl flex items-center justify-center text-lg">⚛</div>
          <div className="font-bold text-base">God Particle</div>
        </Link>
        <Link to="/" className="text-xs font-mono text-[#6b6b85] hover:text-[#f0c040]">← Home</Link>
      </nav>

      <div className="relative z-10 max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-black mb-2">Refund &amp; Cancellation Policy</h1>
        <p className="text-xs font-mono text-[#6b6b85] mb-10">Last updated: April 2026 · Applies to all God Particle subscriptions and credit purchases</p>

        <div className="space-y-8 text-sm font-mono text-[#c0c0d0] leading-relaxed">

          <div className="bg-[#f0c040]/10 border border-[#f0c040]/30 rounded-2xl p-5">
            <div className="font-black text-[#f0c040] mb-2">Summary (Plain English)</div>
            <ul className="space-y-1 text-[#e8e8f0] text-xs">
              <li>· Cancel anytime — no questions asked, no penalty.</li>
              <li>· Cancellation stops future billing. Current period access continues until it ends.</li>
              <li>· No refunds on subscription payments already processed.</li>
              <li>· Credit packs are digital goods and are non-refundable once purchased.</li>
              <li>· Technical failures? Contact us within 7 days — we will make it right.</li>
            </ul>
          </div>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">1. Subscription Cancellation</h2>
            <ul className="space-y-3 list-none">
              <li>
                <strong className="text-[#e8e8f0]">How to cancel:</strong>
                <p className="mt-1 text-[#6b6b85]">Go to <strong className="text-[#e8e8f0]">Pricing page → Your Active Plan → Cancel Subscription</strong>. This immediately stops future auto-debits. Your access remains active until the end of the current paid period.</p>
              </li>
              <li>
                <strong className="text-[#e8e8f0]">What happens after cancellation:</strong>
                <ul className="mt-1 space-y-1 text-[#6b6b85] pl-3">
                  <li>· Your subscription status changes to "CANCELLED".</li>
                  <li>· You retain full access until the billing period ends.</li>
                  <li>· After the period ends, your account reverts to the Free tier.</li>
                  <li>· Any remaining credits at cancellation are retained on your account (they do not expire).</li>
                </ul>
              </li>
              <li>
                <strong className="text-[#e8e8f0]">UPI Autopay / eNACH mandate:</strong>
                <p className="mt-1 text-[#6b6b85]">Cancelling your subscription through our platform sends a cancellation request to Cashfree, which revokes your UPI AutoPay or eNACH mandate. If you revoke the mandate directly from your bank app, please also cancel from our platform to avoid service disruption.</p>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">2. Refund Policy — Subscriptions</h2>
            <div className="bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-xl p-4 mb-4">
              <div className="font-bold text-[#ff4d6d] mb-1">No Mid-Period Refunds</div>
              <p className="text-[#c0c0d0]">Subscription fees are charged in advance for a full 30-day period. Once a payment is processed and your plan is activated, <strong>no refund is issued for the remaining days of that billing period</strong>. This is standard practice for all SaaS and subscription services.</p>
            </div>
            <ul className="space-y-2 list-none">
              <li>· <strong className="text-[#e8e8f0]">Exception — Technical failure:</strong> If you were charged but your plan was not activated due to a system error, you are entitled to a full refund. Contact us within 7 days with your order ID or subscription ID.</li>
              <li>· <strong className="text-[#e8e8f0]">Exception — Duplicate charge:</strong> If you were charged twice for the same billing cycle, the extra charge will be fully refunded.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">3. Refund Policy — Credit Packs</h2>
            <p className="mb-3">Credit packs are one-time digital purchases. Once credits are added to your account, they are considered consumed and <strong>are not refundable</strong>.</p>
            <ul className="space-y-2 list-none">
              <li>· Exception: If payment was deducted but credits were not credited to your account, contact us within 7 days with your order ID. We will verify and credit your account or issue a refund.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">4. Refund Processing</h2>
            <ul className="space-y-2 list-none">
              <li>· Approved refunds are processed within <strong>5–7 business days</strong>.</li>
              <li>· Refunds are credited back to the original payment method (bank account, UPI, or card) used for the transaction.</li>
              <li>· Processing time after we initiate the refund depends on your bank — typically 2–5 additional business days.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">5. Free Trial</h2>
            <p>God Particle does not offer free trials for paid plans. All users receive 50 free credits on signup to explore the platform before purchasing.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">6. Plan Downgrades</h2>
            <p>If you downgrade from Premium to Basic, the downgrade takes effect at the start of the next billing cycle. You continue to enjoy Premium access until then. No partial refund is issued for the difference in plan cost.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">7. Contact for Billing Issues</h2>
            <p className="mb-3">For any refund requests, billing disputes, or payment failures, contact us with the following information:</p>
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 space-y-2">
              <div><span className="text-[#6b6b85]">Email: </span><a href="mailto:support@godparticle.life" className="text-[#f0c040] underline">support@godparticle.life</a></div>
              <div><span className="text-[#6b6b85]">Include: </span><span>Your registered email · Subscription ID or Order ID · Description of the issue</span></div>
              <div><span className="text-[#6b6b85]">Response time: </span><span>Within 2 business days</span></div>
              <div><span className="text-[#6b6b85]">Refund decision: </span><span>Within 7 business days of your request</span></div>
            </div>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">8. Disputes via Cashfree</h2>
            <p>If you raised a dispute or chargeback through your bank or Cashfree, please also notify us at the above email. We respond to all Cashfree dispute requests within the required timeframe. Raising a chargeback for a valid charge without contacting us first may result in account suspension.</p>
          </section>

        </div>

        <div className="mt-12 pt-6 border-t border-[#1e1e2e] flex flex-wrap gap-4 text-xs font-mono text-[#6b6b85]">
          <Link to="/terms" className="hover:text-[#f0c040] transition-all">Terms &amp; Conditions</Link>
          <Link to="/privacy" className="hover:text-[#f0c040] transition-all">Privacy Policy</Link>
          <Link to="/pricing" className="hover:text-[#f0c040] transition-all">Pricing</Link>
          <Link to="/" className="hover:text-[#f0c040] transition-all">← Back to Home</Link>
        </div>
      </div>
    </div>
  );
}
