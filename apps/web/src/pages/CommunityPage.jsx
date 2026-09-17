import { Link } from 'react-router-dom';
import './LegalPage.css';

/**
 * Community Standards.
 *
 * Not decoration: App Store Guideline 1.2 makes PLOT responsible for removing
 * content that violates "this guideline, your terms of service, or your
 * community standards", and asks for a compliance plan when a reviewer finds
 * violating content. Without published standards there is nothing to enforce
 * against and nothing to show.
 *
 * The categories here are the same five the report reason picker offers
 * (packages/core/copy/moderation.js), deliberately: a reporter should not have
 * to translate between what the rules forbid and what the form accepts. The
 * 24-hour commitment is the same one MODERATION.reportSentBody makes to the
 * reporter, so the page and the app do not promise different things.
 *
 * Kept in step with apps/website/community.html by hand, as terms and privacy
 * are. British English regardless of viewer region, per AGENTS.md.
 */
export default function CommunityPage() {
  return (
    <div className="legal-page">
      <div className="legal-panel">
        <Link to="/login" className="legal-back">← Back</Link>

        <p className="legal-label">Legal</p>
        <h1>Community Standards</h1>
        <p className="legal-owner">A product of SUSUMU HOUSE</p>
        <p className="legal-meta">Last updated: September 2026</p>

        <p>plot is a place to keep track of what you watch and what you thought of it. It is small, and it is meant to feel calm. These standards describe what is not welcome here, what happens when something crosses the line, and how to tell us.</p>
        <p>They apply to everything another person can see: your username, your display name, your bio, your profile picture, the links on your profile, and the names you give your lists.</p>
        <h2>What is not allowed</h2>
        <p><strong>Harassment or bullying.</strong> Targeting someone, following them around the service to provoke them, or encouraging others to do the same.</p>
        <p><strong>Hate or discrimination.</strong> Attacking or demeaning people on the basis of race, ethnicity, national origin, religion, disability, age, sex, gender identity or sexual orientation.</p>
        <p><strong>Sexual content.</strong> Sexually explicit images or text in profile pictures, names, bios or list names. plot is made for a general audience.</p>
        <p><strong>Impersonation.</strong> Presenting yourself as another person, or as plot itself, in a way designed to mislead.</p>
        <p><strong>Spam.</strong> Repetitive or automated activity, advertising, or using your profile mainly to push people somewhere else.</p>
        <p><strong>Anything illegal.</strong> Content that is unlawful where you are or where we operate. Content that sexualises a minor is reported to the relevant authorities.</p>
        <h2>Reporting</h2>
        <p>Every profile, search result and follow request has a Report option. Choose the reason that fits best, and add anything that would help us understand it.</p>
        <p>Reports are private. The person you report is not told who reported them.</p>
        <p>We aim to review every report within 24 hours.</p>
        <h2>Blocking</h2>
        <p>You can block anyone, and you do not have to report them first. Blocking removes any follows between you in both directions, cancels a pending follow request, and hides each of you from the other.</p>
        <p>Everyone you have blocked is listed in Settings, where you can undo it at any time.</p>
        <p>Blocking and reporting are separate. Use either, or both.</p>
        <h2>What we do about it</h2>
        <p>Depending on what we find, we may remove the content, ask you to change it, suspend the account, or remove the account permanently. Serious cases, and repeated ones, go straight to removal. Where someone is at risk we may act without warning.</p>
        <p>If you think we have got it wrong, write to us and we will look at it again.</p>
        <h2>Contact</h2>
        <p>plot is a product of SUSUMU HOUSE, registered office Level 1, 63-73 Ann Street, Surry Hills, NSW 2010. You can reach us at contact@susumuhouse.com, or through the feedback option in the app.</p>
        <h2>Changes</h2>
        <p>We may update these standards as plot grows. The date above changes when we do.</p>
      </div>
    </div>
  );
}
