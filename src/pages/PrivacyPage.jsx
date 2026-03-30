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
        <p className="legal-meta">Last updated: March 2026</p>

        <h2>1. Agreement to This Policy</h2>
        <p><strong>By creating an account or using PLOT in any way, you acknowledge that you have read, understood, and agree to this Privacy Policy in full. If you do not agree, you must not use the Service.</strong></p>
        <p>You use the Service at your own risk. While we take reasonable steps to protect your data, no method of transmission over the internet or electronic storage is completely secure. We cannot guarantee the absolute security of your information, and by using the Service you accept this inherent risk.</p>

        <h2>2. What We Collect</h2>
        <p>When you use PLOT, we may collect:</p>
        <ul>
          <li><strong>Account information</strong> — your email address and hashed password (managed via Supabase Auth)</li>
          <li><strong>Profile data</strong> — your username, display name, and optional bio</li>
          <li><strong>Activity data</strong> — films and TV shows you log, rate, or add to lists</li>
          <li><strong>Journal entries</strong> — notes and reviews you write about content you've watched</li>
          <li><strong>Usage data</strong> — basic analytics collected in aggregate and anonymised form</li>
          <li><strong>Technical data</strong> — IP address, browser type, and device information collected automatically</li>
        </ul>

        <h2>3. How We Use Your Data</h2>
        <p>We use your data to operate, maintain, and improve the Service, including:</p>
        <ul>
          <li>Providing and personalising your PLOT experience</li>
          <li>Displaying your watch history, lists, and journal (publicly or privately, per your settings)</li>
          <li>Sending transactional emails (account confirmation, password reset)</li>
          <li>Analysing usage patterns in anonymised, aggregate form to improve the product</li>
        </ul>
        <p>We do not sell your personal data to third parties. We are not responsible for how you choose to use or expose your own data within the Service.</p>

        <h2>4. Third-Party Services &amp; Disclaimer</h2>
        <p>The Service relies on third-party infrastructure. By using PLOT, you acknowledge and accept that your data will be processed by these third parties under their own policies, over which SUSUMU HOUSE has no control:</p>
        <ul>
          <li><strong>Supabase</strong> — authentication and database hosting</li>
          <li><strong>The Movie Database (TMDB)</strong> — film and TV metadata</li>
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
        <p>Your data is retained for as long as your account remains active. You may request deletion of your account and associated data at any time through account settings. We will make reasonable efforts to remove your personal data in a timely manner, subject to any legal obligations to retain it. We are not liable for residual copies that may persist temporarily in backup systems during normal operations.</p>

        <h2>7. Cookies &amp; Local Storage</h2>
        <p>PLOT uses cookies and local storage solely for session management and authentication. We do not use tracking or advertising cookies. By using the Service, you consent to this use.</p>

        <h2>8. Your Rights</h2>
        <p>Depending on your jurisdiction, you may have rights regarding your personal data. To exercise any such rights, contact us via the app. We will respond to reasonable requests in accordance with applicable law but are not liable for any inability to fully comply where doing so conflicts with our legal obligations or technical constraints.</p>

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
