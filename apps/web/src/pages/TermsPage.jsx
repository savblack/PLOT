import { Link } from 'react-router-dom';
import './LegalPage.css';

export default function TermsPage() {
  return (
    <div className="legal-page">
      <div className="legal-panel">
        <Link to="/login" className="legal-back">← Back</Link>

        <p className="legal-label">Legal</p>
        <h1>Terms of Service</h1>
        <p className="legal-owner">A product of SUSUMU HOUSE</p>
        <p className="legal-meta">Last updated: June 2026</p>

        <h2>1. Acceptance of Terms</h2>
        <p><strong>By creating an account, accessing, or using PLOT in any way, you agree to be legally bound by these Terms of Service in their entirety. Your use of the Service constitutes your full and unconditional acceptance of these Terms and all risk associated with that use. If you do not agree to every provision of these Terms, you must immediately stop using the Service and delete your account.</strong></p>
        <p>These Terms form a binding legal agreement between you and SUSUMU HOUSE ("we", "us", "our"). We reserve the right to update these Terms at any time. Continued use of the Service following any update constitutes acceptance of the revised Terms.</p>

        <h2>2. Account Registration &amp; Eligibility</h2>
        <p>You must be at least 13 years old to use the Service. By registering, you represent and warrant that all information you provide is accurate and that you meet this eligibility requirement. You are solely responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account, whether or not authorised by you. We are not liable for any loss or damage arising from your failure to safeguard your account.</p>
        <p>If we discover that an account is held by a person under 13, we will immediately terminate that account and delete associated data without notice or liability.</p>

        <h2>3. Acceptable Use &amp; User Responsibility</h2>
        <p>You are solely and entirely responsible for your conduct and all content you submit, post, or display on the Service. You agree not to:</p>
        <ul>
          <li>Use the Service for any unlawful, harmful, or fraudulent purpose</li>
          <li>Harass, threaten, defame, or harm any person</li>
          <li>Post content that is obscene, hateful, or infringes the rights of any third party</li>
          <li>Attempt to gain unauthorised access to any part of our systems or infrastructure</li>
          <li>Reverse engineer, scrape, or harvest data from the Service without our express written permission</li>
          <li>Interfere with or disrupt the integrity, performance, or security of the Service</li>
          <li>Impersonate any person or entity or misrepresent your affiliation with any person or entity</li>
        </ul>
        <p>We reserve the right, but have no obligation, to monitor content on the Service. We may remove any content and terminate any account at our sole discretion, without notice or liability to you.</p>

        <h2>4. Third-Party Data &amp; Services</h2>
        <p>Film and television metadata displayed on PLOT is provided by The Movie Database (TMDB). This product uses the TMDB API but is not endorsed or certified by TMDB. We make no representations or warranties regarding the accuracy, completeness, or reliability of any third-party data. You use such data entirely at your own risk. We are not responsible for any errors, omissions, or inaccuracies in third-party content.</p>
        <p>Streaming availability ("where to watch") is sourced from JustWatch via the TMDB API and may be inaccurate or out of date. Some outbound links to streaming services and retailers are affiliate links: PLOT may earn a commission on qualifying purchases or sign-ups made through them, at no additional cost to you. As an Amazon Associate, PLOT earns from qualifying purchases. Affiliate relationships never affect which services are shown or their order.</p>
        <p>The Service may integrate with or link to third-party platforms and services. We have no control over, and assume no responsibility for, the content, privacy practices, or terms of any third-party service. Your dealings with third parties are solely between you and them.</p>

        <h2>5. User Content</h2>
        <p>You retain ownership of content you create on PLOT. By submitting content, you grant SUSUMU HOUSE a perpetual, worldwide, non-exclusive, royalty-free, sublicensable license to use, store, display, reproduce, and distribute that content for the purpose of operating and improving the Service.</p>
        <p>You are solely responsible for all content you submit and represent that you have all rights necessary to grant the above license. You agree to indemnify and hold harmless SUSUMU HOUSE from any claims arising from your content. We are not responsible for and expressly disclaim liability for any user-generated content on the Service.</p>

        <h2>6. No Warranties — Service Provided "As Is"</h2>
        <p><strong>THE SERVICE IS PROVIDED STRICTLY ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTY OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE. SUSUMU HOUSE EXPRESSLY DISCLAIMS ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.</strong></p>
        <p>We do not warrant that: (a) the Service will be uninterrupted, error-free, or secure; (b) any defects will be corrected; (c) the Service or servers that make it available are free of viruses or harmful components; or (d) the results of using the Service will meet your requirements. You assume all responsibility for any damage to your device, loss of data, or other harm that results from your use of the Service.</p>

        <h2>7. Limitation of Liability</h2>
        <p><strong>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL SUSUMU HOUSE, ITS OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, LICENSORS, OR AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES OF ANY KIND, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, LOSS OF DATA, LOSS OF GOODWILL, SERVICE INTERRUPTION, COMPUTER DAMAGE, SYSTEM FAILURE, OR THE COST OF SUBSTITUTE SERVICES, WHETHER ARISING OUT OF OR IN CONNECTION WITH THESE TERMS OR FROM THE USE OF OR INABILITY TO USE THE SERVICE, EVEN IF SUSUMU HOUSE HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</strong></p>
        <p>To the fullest extent permitted by law, our total aggregate liability to you for any and all claims arising out of or related to these Terms or your use of the Service shall not exceed the greater of (a) the total amount you paid us in the twelve months preceding the claim, or (b) ten US dollars (USD $10).</p>

        <h2>8. Indemnification</h2>
        <p>You agree to defend, indemnify, and hold harmless SUSUMU HOUSE and its officers, directors, employees, contractors, agents, licensors, and affiliates from and against any and all claims, damages, obligations, losses, liabilities, costs, and expenses (including reasonable legal fees) arising from: (a) your use of or access to the Service; (b) your violation of these Terms; (c) your violation of any third-party right; (d) any content you submit to the Service; or (e) your violation of any applicable law, rule, or regulation. This obligation survives termination of your account.</p>

        <h2>9. Assumption of Risk</h2>
        <p>You expressly acknowledge and agree that your use of the Service is at your sole and exclusive risk. You assume full responsibility for all risks associated with your use of the Service, including any reliance on the accuracy of content, any interactions with other users, and any decisions made based on information obtained through the Service. SUSUMU HOUSE shall not be responsible for any harm, loss, or damage of any kind that may result from your use of the Service.</p>

        <h2>10. Account Termination</h2>
        <p>You may delete your account at any time. We reserve the right to suspend or permanently terminate your account at any time, for any reason or no reason, with or without notice, and without liability to you. Upon termination, your right to use the Service immediately ceases. You can download a copy of your data from Settings before deleting your account.</p>

        <h2>11. Modifications to the Service</h2>
        <p>We reserve the right to modify, suspend, or discontinue the Service (or any part thereof) at any time, permanently or temporarily, with or without notice. You agree that SUSUMU HOUSE shall not be liable to you or any third party for any modification, suspension, or discontinuation of the Service.</p>

        <h2>12. Changes to Terms</h2>
        <p>We may revise these Terms at any time by posting updated Terms to this page. Your continued use of the Service after any such changes constitutes your binding acceptance of the new Terms.</p>

        <h2>13. Contact &amp; Governing Law</h2>
        <p>PLOT is a product of SUSUMU HOUSE. These Terms are governed by and construed in accordance with the laws of New South Wales, Australia, without regard to its conflict of law principles. You irrevocably submit to the exclusive jurisdiction of the courts of New South Wales, Australia for the resolution of any dispute arising out of or in connection with these Terms. For questions, contact us at contact@susumuhouse.com or via the app.</p>
      </div>
    </div>
  );
}
