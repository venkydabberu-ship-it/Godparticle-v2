import { Link } from 'react-router-dom';

export default function Terms() {
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
        <h1 className="text-3xl font-black mb-2">Terms &amp; Conditions</h1>
        <p className="text-xs font-mono text-[#6b6b85] mb-10">Last updated: April 2026 · Effective immediately</p>

        <div className="space-y-8 text-sm font-mono text-[#c0c0d0] leading-relaxed">

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">1. About God Particle Intelligence</h2>
            <p>God Particle Intelligence ("God Particle", "we", "us", "our") is a technology platform that provides market data analysis tools, options analysis, and educational content related to Indian equity and derivatives markets. We are <strong className="text-[#ff4d6d]">NOT registered with SEBI as an investment adviser or research analyst</strong>. All content provided is strictly for educational and informational purposes.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">2. Not Financial Advice</h2>
            <p>Nothing on this platform constitutes financial advice, investment advice, trading advice, or any other type of advice. God Particle analysis tools and outputs are for <strong>educational and research purposes only</strong>. You should consult a SEBI-registered investment adviser before making any investment decisions. We are not liable for any losses incurred based on use of our platform.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">3. Eligibility</h2>
            <p>You must be at least 18 years of age to use this platform. By creating an account, you confirm you are legally capable of entering into binding contracts under applicable Indian law.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">4. Subscription Plans &amp; Auto-Renewal</h2>
            <p className="mb-3">God Particle offers the following paid plans, billed monthly via Cashfree Payments:</p>
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 space-y-2 mb-3">
              <div className="flex justify-between"><span className="text-[#f0c040] font-bold">Basic Plan</span><span>₹99 / month · 100 credits per month</span></div>
              <div className="flex justify-between"><span className="text-[#39d98a] font-bold">Premium Plan</span><span>₹299 / month · 1000 credits per month</span></div>
            </div>
            <ul className="space-y-2 list-none">
              <li>· Subscriptions are <strong>automatically renewed every 30 days</strong> via UPI AutoPay / eNACH mandate.</li>
              <li>· By subscribing, you authorise God Particle to collect recurring payments from your linked bank account or UPI handle via Cashfree Payments.</li>
              <li>· Your subscription remains active until cancelled. We will notify you before each renewal via the email address on your account.</li>
              <li>· To stop renewals, cancel your subscription from the Pricing page before the next billing date.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">5. Credit System</h2>
            <ul className="space-y-2 list-none">
              <li>· Credits are virtual units used to access analysis features on the platform.</li>
              <li>· Free accounts receive 50 one-time credits on signup. These never expire and carry forward until a paid plan is purchased.</li>
              <li>· Basic plan users receive 100 credits monthly. Unused credits from the previous month carry forward and are added to the new monthly allocation.</li>
              <li>· Premium plan users receive 1000 fresh credits every 30 days. Unused credits <strong>do not carry forward</strong> — they reset to 1000 on renewal.</li>
              <li>· Credits have no monetary value, are non-transferable, and cannot be exchanged for cash or refunded.</li>
              <li>· Additional credit packs may be purchased as one-time top-ups at the rates listed on the Pricing page.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">6. Cancellation &amp; Refunds</h2>
            <ul className="space-y-2 list-none">
              <li>· You may cancel your subscription at any time from the Pricing page. Cancellation stops future renewals.</li>
              <li>· <strong>No refund is issued for the current billing period</strong> once payment has been processed. Access continues until the period ends.</li>
              <li>· Credit pack purchases are final and non-refundable as they are consumed digitally.</li>
              <li>· For billing disputes or technical failures, contact us at <a href="mailto:support@godparticle.app" className="text-[#f0c040] underline">support@godparticle.app</a> within 7 days of the charge.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">7. User Obligations</h2>
            <ul className="space-y-2 list-none">
              <li>· You agree not to share your account credentials with others.</li>
              <li>· You agree not to reverse-engineer, scrape, or systematically extract data from the platform.</li>
              <li>· You agree not to use the platform for any unlawful purpose under Indian law.</li>
              <li>· Violation of these terms may result in immediate account suspension without refund.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">8. Intellectual Property</h2>
            <p>All analysis methodologies, algorithms, branding, and content on this platform are the exclusive intellectual property of God Particle Intelligence. GCT (Gravitational Cost Theory), God Particle analysis, Zero to Hero, and related names are proprietary. You may not reproduce or distribute any content without written permission.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">9. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, God Particle Intelligence shall not be liable for any direct, indirect, incidental, or consequential losses arising from your use of the platform, including but not limited to trading losses, data loss, or service interruption.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">10. Governing Law &amp; Dispute Resolution</h2>
            <p>These terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of courts in India. We encourage resolution through email before legal escalation.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">11. Changes to Terms</h2>
            <p>We may update these terms from time to time. Continued use of the platform after changes constitutes acceptance of the new terms. Material changes will be communicated via email.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">12. Contact &amp; Grievance Officer</h2>
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 space-y-1">
              <div><span className="text-[#6b6b85]">Platform: </span>God Particle Intelligence</div>
              <div><span className="text-[#6b6b85]">Email: </span><a href="mailto:support@godparticle.app" className="text-[#f0c040] underline">support@godparticle.app</a></div>
              <div><span className="text-[#6b6b85]">Grievance response time: </span>Within 30 days of receipt</div>
            </div>
          </section>

        </div>

        <div className="mt-12 pt-6 border-t border-[#1e1e2e] flex flex-wrap gap-4 text-xs font-mono text-[#6b6b85]">
          <Link to="/privacy" className="hover:text-[#f0c040] transition-all">Privacy Policy</Link>
          <Link to="/refund" className="hover:text-[#f0c040] transition-all">Refund &amp; Cancellation</Link>
          <Link to="/" className="hover:text-[#f0c040] transition-all">← Back to Home</Link>
        </div>
      </div>
    </div>
  );
}
