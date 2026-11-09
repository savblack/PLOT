// Delivery policy for signup-bypass links: Resend is the only path. When it
// fails the caller reports `email_failed` and cleans up, rather than trying a
// second mailer that cannot work.
//
// Until 2026-11-09 a failure fell back to Supabase's own auth mailer through
// `signInWithOtp` with the anon key. That fallback could not deliver in
// production, for two independent reasons (both in supabase/auth,
// internal/api):
//   1. `/otp` sits behind `verifyCaptcha` (api.go). With captcha enforced, a
//      request without `gotrue_meta_security.captcha_token` is rejected before
//      the handler runs, so `shouldCreateUser: false` never matters. Only an
//      admin bearer skips that check. This function exists because the visitor
//      has no captcha token.
//   2. Every caller makes the link first with admin `generateLink` (type
//      magiclink), which sets `recovery_sent_at = now` (mail.go,
//      adminGenerateLink). `/otp` then reaches `sendMagicLink`, which refuses
//      with `over_email_send_rate_limit` while `recovery_sent_at` is younger
//      than SMTP max_frequency (default one minute). So even an admin-key
//      fallback is refused milliseconds after the link is made.
// Reason 2 is why the fallback also failed on Staging, where captcha is off.
//
// Only the error message is logged; never addresses, links or keys.
export type SignupMailResult = 'sent' | 'failed';

export async function deliverSignupLink(
  sendViaResend: () => Promise<void>,
  log: (message: string) => void = console.log,
): Promise<SignupMailResult> {
  try {
    await sendViaResend();
    log('[signup-bypass] confirmation email path: resend');
    return 'sent';
  } catch (resendError) {
    log(`[signup-bypass] resend failed (${(resendError as Error).message}); no fallback mailer`);
    return 'failed';
  }
}
