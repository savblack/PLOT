// Delivery policy for signup-bypass confirmation links: try Resend first, and
// if that throws fall back to Supabase's own auth mailer (the project's
// configured SMTP). The caller only deletes the new user when this throws,
// i.e. when BOTH paths failed. Only the path name is logged; never addresses
// or keys.
export type SignupMailPath = 'resend' | 'supabase';

export async function deliverSignupLink(
  sendViaResend: () => Promise<void>,
  sendViaSupabase: () => Promise<void>,
  log: (message: string) => void = console.log,
): Promise<SignupMailPath> {
  try {
    await sendViaResend();
    log('[signup-bypass] confirmation email path: resend');
    return 'resend';
  } catch (resendError) {
    log(`[signup-bypass] resend failed (${(resendError as Error).message}); falling back to supabase mailer`);
  }
  try {
    await sendViaSupabase();
    log('[signup-bypass] confirmation email path: supabase');
    return 'supabase';
  } catch (supabaseError) {
    log(`[signup-bypass] supabase mailer failed (${(supabaseError as Error).message})`);
    throw new Error('both confirmation email paths failed');
  }
}
