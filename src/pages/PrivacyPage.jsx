import { Link } from 'react-router-dom';
import './LegalPage.css';

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <div className="legal-panel">
        <Link to="/login" className="legal-back">← Back</Link>

        <p className="legal-label">Legal</p>
        <h1>Privacy Policy</h1>
        <p className="legal-owner">A product of SUSUMU HOUSE</p>
        <p className="legal-meta">Last updated: June 2026</p>

        <h2>1. Agreement to This Policy</h2>
        <p><strong>By creating an account or using PLOT in any way, you acknowledge that you have read, understood, and agree to this Privacy Policy in full. If you do not agree, you must not use the Service.</strong></p>
        <p>You use the Service at your own risk. While we take reasonable steps to protect your data, no method of transmission over the internet or electronic storage is completely secure. We cannot guarantee the absolute security of your information, and by using the Service you accept this inherent risk.</p>

        <h2>2. What We Collect</h2>
        <p>When you use PLOT, we may collect:</p>
        <ul>
          <li><strong>Account information</strong> — your email address and hashed password (managed via Supabase Auth)</li>
          <li><strong>Profile and preference data</strong> — your username, display name, optional bio, region, timezone, and channel/provider preferences</li>
          <li><strong>Activity data</strong> — films and TV shows you log, rate, save, add to lists, or track in progress</li>
          <li><strong>Journal entries</strong> — notes and reviews you write about content you've watched</li>
          <li><strong>Integration and utility data</strong> — calendar feed tokens, reminder settings, and optional Plex/Trakt integration records where enabled</li>
          <li><strong>Support data</strong> — feedback messages and optional screenshot attachments you submit through the app</li>
          <li><strong>Usage data</strong> — product analytics about pages viewed and features used</li>
          <li><strong>Technical data</strong> — IP address, browser type, and device information collected automatically when you access the Service</li>
        </ul>

        <h2>3. How We Use Your Data</h2>
        <p>We use your data to operate, maintain, and improve the Service, including:</p>
        <ul>
          <li>Providing and personalising your PLOT experience</li>
          <li>Displaying your watch history, lists, journal, reminders, and watch progress inside your account</li>
          <li>Sending transactional emails (account confirmation, password reset)</li>
          <li>Operating calendar links, support workflows, and optional media integrations</li>
          <li>Analysing usage patterns to improve the product and monitor launch health</li>
        </ul>
        <p>We do not sell your personal data to third parties.</p>

        <h2>4. Third-Party Services &amp; Disclaimer</h2>
        <p>The Service relies on third-party infrastructure and data providers. By using PLOT, you acknowledge and accept that your data may be processed by these third parties under their own policies, over which SUSUMU HOUSE has no control:</p>
        <ul>
          <li><strong>Supabase</strong> — authentication, database, storage, and edge functions</li>
          <li><strong>The Movie Database (TMDB)</strong> — film and TV metadata. This product uses the TMDB API but is not endorsed or certified by TMDB.</li>
          <li><strong>Vercel</strong> — website and application hosting. Your requests are routed through Vercel's infrastructure.</li>
          <li><strong>PostHog</strong> — product analytics used to understand how the Service is used.</li>
          <li><strong>Linear</strong> — anonymised in-app feedback can be mirrored into our product backlog for support and planning.</li>
          <li><strong>Resend</strong> — feedback email delivery and transactional notification support where applicable.</li>
          <li><strong>Google Fonts</strong> — typography loaded from Google's servers, which may log your IP address per Google's privacy policy.</li>
        </ul>
        <p>We are not liable for the acts or omissions of these third-party providers, including any data breaches, service outages, or loss of data that occurs on their infrastructure. Your use of the Service constitutes your acceptance of their respective policies.</p>

        <h2>5. Data Security &amp; Limitation of Liability</h2>
        <p>We implement commercially reasonable measures to protect your data. However, <strong>we cannot guarantee that your data will be completely secure at all times.</strong> You acknowledge and agree that:</p>
        <ul>
          <li>No internet transmission or electronic storage method is 100% secure</li>
          <li>You provide your data at your own risk</li>
          <li>SUSUMU HOUSE shall not be liable for any unauthorised access, data breach, loss, theft, or disclosure of your information that is beyond our reasonable control</li>
          <li>In the event of a data breach, we will notify affected users as required by applicable law, but shall not be liable for any resulting damages</li>
        </ul>

        <h2>6. Data Retention &amp; Deletion</h2>
        <p>Your data is retained for as long as your account remains active. You may request deletion of your account and associated app data at any time through account settings. Account deletion removes the current app records tied to your user account, including lists, favourites, reminders, journal/history, integration records, feedback rows, and the original feedback attachment objects associated with your account. We may retain operational logs, anonymised analytics, and temporary backup copies for a limited period where required for security, debugging, or normal infrastructure recovery.</p>

        <h2>7. Cookies &amp; Local Storage</h2>
        <p>PLOT uses cookies and local storage for session management, authentication, and limited product analytics state. We do not use advertising cookies. By using the Service, you consent to this use.</p>

        <h2>8. Your Rights</h2>
        <p>Depending on your jurisdiction, you may have rights regarding your personal data. To exercise any such rights, contact us via the app. We will respond to reasonable requests in accordance with applicable law but are not liable for any inability to fully comply where doing so conflicts with our legal obligations or technical constraints. You can download a copy of your data at any time from Settings.</p>

        <h2>9. Children's Privacy</h2>
        <p>The Service is not directed at children under the age of 13. We do not knowingly collect personal data from children under 13. If we become aware that we have collected such data, we will delete it immediately.</p>

        <h2>10. Changes to This Policy</h2>
        <p>We reserve the right to update this Privacy Policy at any time. Changes will be posted to this page with an updated "last updated" date. Your continued use of the Service after any changes constitutes your acceptance of the revised policy.</p>

        <h2>11. Contact</h2>
        <p>PLOT is a product of SUSUMU HOUSE. This Privacy Policy is governed by the laws of New South Wales, Australia. Any disputes arising in connection with this policy are subject to the exclusive jurisdiction of the courts of New South Wales, Australia. For privacy-related enquiries, contact us at contact@susumuhouse.com or via the app.</p>
      </div>
    </div>
  );
}
