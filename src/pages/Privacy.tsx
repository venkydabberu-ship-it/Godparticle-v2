import { Link } from 'react-router-dom';

export default function Privacy() {
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
        <h1 className="text-3xl font-black mb-2">Privacy Policy</h1>
        <p className="text-xs font-mono text-[#6b6b85] mb-10">Last updated: April 2026 · Compliant with IT Act 2000 &amp; IT (Amendment) Act 2008</p>

        <div className="space-y-8 text-sm font-mono text-[#c0c0d0] leading-relaxed">

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">1. Who We Are</h2>
            <p>God Particle Intelligence ("we", "us", "our") operates the God Particle platform — a market analysis and educational tool accessible at our web and mobile application. This policy explains what personal data we collect, how we use it, and your rights.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">2. Data We Collect</h2>
            <div className="space-y-3">
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
                <div className="font-bold text-[#e8e8f0] mb-2">Account Data</div>
                <p className="text-[#6b6b85]">Email address, phone number (optional), username, and password (stored as a secure hash — we never see your password in plain text).</p>
              </div>
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
                <div className="font-bold text-[#e8e8f0] mb-2">Usage Data</div>
                <p className="text-[#6b6b85]">Analysis inputs (stock symbols, strike prices, date ranges), analysis results you run, credits consumed, and subscription status.</p>
              </div>
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
                <div className="font-bold text-[#e8e8f0] mb-2">Payment Data</div>
                <p className="text-[#6b6b85]">Subscription plan, payment status, and next billing date. <strong>We do not store card numbers, UPI IDs, or bank account details</strong> — these are held exclusively by Cashfree Payments (PCI-DSS compliant).</p>
              </div>
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
                <div className="font-bold text-[#e8e8f0] mb-2">Technical Data</div>
                <p className="text-[#6b6b85]">Browser type, device type, IP address (collected by Supabase infrastructure), and session tokens stored in your browser's local storage.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">3. How We Use Your Data</h2>
            <ul className="space-y-2 list-none">
              <li>· <strong>To provide the service:</strong> authenticate your account, run analyses, manage credits and subscriptions.</li>
              <li>· <strong>To process payments:</strong> share required details with Cashfree Payments to create and manage your subscription mandate.</li>
              <li>· <strong>To communicate:</strong> send subscription receipts, service updates, and security notifications to your registered email.</li>
              <li>· <strong>To improve the platform:</strong> anonymised, aggregated usage data helps us understand which features are most valuable.</li>
              <li>· We do <strong>not</strong> sell, rent, or share your personal data with third parties for marketing purposes.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">4. Third-Party Services</h2>
            <div className="space-y-3">
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
                <div className="font-bold text-[#e8e8f0] mb-1">Supabase (Database &amp; Authentication)</div>
                <p className="text-[#6b6b85]">Your account data and analysis history are stored on Supabase's infrastructure. Supabase is SOC 2 Type II compliant and data resides in servers with industry-standard encryption at rest and in transit.</p>
              </div>
              <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4">
                <div className="font-bold text-[#e8e8f0] mb-1">Cashfree Payments</div>
                <p className="text-[#6b6b85]">Subscription billing and mandate management is handled by Cashfree Payments India Pvt. Ltd., a RBI-authorised payment aggregator. Your payment instrument details are governed by Cashfree's privacy policy. We share only your name, email, and phone number with Cashfree for KYC and mandate creation.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">5. Data Retention</h2>
            <ul className="space-y-2 list-none">
              <li>· Account data is retained while your account is active and for 90 days after deletion request, to resolve any billing disputes.</li>
              <li>· Analysis history is retained indefinitely to power the "replay analysis" feature. You may request deletion of your analysis history by contacting us.</li>
              <li>· Payment records are retained for 7 years as required by Indian tax and accounting regulations.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">6. Cookies &amp; Local Storage</h2>
            <p>We use browser local storage (not cookies) to store your authentication session and cached profile data for fast page loads. This data is stored only on your device and is cleared when you log out. We do not use advertising cookies or third-party tracking pixels.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">7. Your Rights</h2>
            <ul className="space-y-2 list-none">
              <li>· <strong>Access:</strong> You may request a copy of your personal data at any time.</li>
              <li>· <strong>Correction:</strong> You may update your username or phone number from your account settings.</li>
              <li>· <strong>Deletion:</strong> You may request deletion of your account and personal data by emailing us. Payment records are exempted per legal retention requirements.</li>
              <li>· <strong>Portability:</strong> You may request an export of your analysis history in CSV format.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">8. Data Security</h2>
            <p>We implement industry-standard security measures including TLS encryption for all data in transit, password hashing (bcrypt via Supabase Auth), row-level security on all database tables, and role-based access controls. Despite these measures, no system is 100% secure. Please report any suspected security issues immediately to our support email.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">9. Children's Privacy</h2>
            <p>Our platform is not directed at individuals under 18 years of age. We do not knowingly collect personal data from minors. If you believe a minor has created an account, please contact us immediately.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">10. Changes to This Policy</h2>
            <p>We may update this policy from time to time. We will notify you of material changes via email before they take effect. Continued use of the platform after notification constitutes acceptance.</p>
          </section>

          <section>
            <h2 className="text-base font-black text-[#f0c040] mb-3">11. Grievance Officer &amp; Contact</h2>
            <p className="mb-3">In accordance with the Information Technology Act 2000 and rules made thereunder, the name and contact details of our Grievance Officer are:</p>
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-4 space-y-1">
              <div><span className="text-[#6b6b85]">Platform: </span>God Particle Intelligence</div>
              <div><span className="text-[#6b6b85]">Email: </span><a href="mailto:support@godparticle.life" className="text-[#f0c040] underline">support@godparticle.life</a></div>
              <div><span className="text-[#6b6b85]">Response time: </span>Within 30 days of receipt</div>
            </div>
          </section>

        </div>

        <div className="mt-12 pt-6 border-t border-[#1e1e2e] flex flex-wrap gap-4 text-xs font-mono text-[#6b6b85]">
          <Link to="/terms" className="hover:text-[#f0c040] transition-all">Terms &amp; Conditions</Link>
          <Link to="/refund" className="hover:text-[#f0c040] transition-all">Refund &amp; Cancellation</Link>
          <Link to="/" className="hover:text-[#f0c040] transition-all">← Back to Home</Link>
        </div>
      </div>
    </div>
  );
}
