// Delivery policy for signup-bypass links: Resend first, then Brevo. Both send
// the same message, with the same link and code, from hello@theplot.tv. When
// both fail the caller reports `email_failed` and cleans up.
//
// The backup is a second email provider, NOT Supabase's own auth mailer. Until
// 2026-11-09 the backup was `signInWithOtp` with the anon key, and that could
// not deliver in production, for two independent reasons (supabase/auth,
// internal/api):
//   1. `/otp` sits behind `verifyCaptcha` (api.go). With captcha enforced, a
//      request without `gotrue_meta_security.captcha_token` is rejected before
//      the handler runs. This function exists because the visitor has no
//      captcha token.
//   2. Every caller makes the link first with admin `generateLink` (type
//      magiclink), which sets `recovery_sent_at = now` (mail.go,
//      adminGenerateLink). `/otp` then reaches `sendMagicLink`, which refuses
//      with `over_email_send_rate_limit` while `recovery_sent_at` is younger
//      than SMTP max_frequency (default one minute).
// So do not route a backup through any GoTrue send endpoint. A second provider
// sends the link already generated, and touches neither limit.
//
// Only provider names and error messages are logged; never addresses, links
// or keys.
export type SignupMailResult = 'sent' | 'failed';

export type SignupMailSender = { name: string; send: () => Promise<void> };

export async function deliverSignupLink(
  senders: SignupMailSender[],
  log: (message: string) => void = console.log,
): Promise<SignupMailResult> {
  for (const sender of senders) {
    try {
      await sender.send();
      log(`[signup-bypass] confirmation email path: ${sender.name}`);
      return 'sent';
    } catch (error) {
      log(`[signup-bypass] ${sender.name} failed (${(error as Error).message})`);
    }
  }
  log('[signup-bypass] every email path failed');
  return 'failed';
}
