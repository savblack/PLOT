import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from './database.types.ts';
import { authCallbackRedirect, isMissingUserError, type BypassAction } from './signupBypass.ts';

export type LinkResult = 'sent' | 'absent' | 'failed';
type SignupLinkAdmin = Pick<SupabaseClient<Database>['auth']['admin'], 'generateLink' | 'deleteUser'>;
type SendLink = (email: string, link: string, action: BypassAction, redirect: string) => Promise<LinkResult>;

// GoTrue can create a user while generating a magic link. Its verification_type
// is signup only for that new user, so it identifies the account this request
// owns. Never infer ownership from an unconfirmed email or account age.
export async function deliverMagicLink(
  admin: SignupLinkAdmin,
  mailLink: SendLink,
  email: string,
  origin: string | null,
  action: BypassAction,
  confirmSignup: boolean,
): Promise<LinkResult> {
  let createdId: string | undefined;
  let delivered = false;
  try {
    let redirectTo = authCallbackRedirect(origin, action, confirmSignup);
    let generated = await admin.generateLink({ type: 'magiclink', email, options: { redirectTo } });
    if (generated.error) {
      if (isMissingUserError(generated.error.message)) return 'absent';
      console.error('[signup-bypass] generateLink failed');
      return 'failed';
    }
    if (generated.data?.properties?.verification_type === 'signup') {
      createdId = generated.data.user.id;
      // A resend must not sign up an unknown address. Undo GoTrue's implicit
      // creation and return the same generic success as a missing address.
      if (action !== 'magiclink') return 'absent';
      redirectTo = authCallbackRedirect(origin, 'signup', true);
      generated = await admin.generateLink({ type: 'magiclink', email, options: { redirectTo } });
    }
    if (generated.error || !generated.data?.properties?.action_link) return 'failed';
    const mailAction = createdId || (confirmSignup && action === 'magiclink') ? 'signup' : action;
    delivered = await mailLink(email, generated.data.properties.action_link, mailAction, redirectTo) === 'sent';
    return delivered ? 'sent' : 'failed';
  } catch {
    console.error('[signup-bypass] auth link delivery failed');
    return 'failed';
  } finally {
    if (createdId && !delivered) {
      try {
        const { error } = await admin.deleteUser(createdId);
        if (error) console.error('[signup-bypass] could not remove newly created account after link failure');
      } catch {
        console.error('[signup-bypass] could not remove newly created account after link failure');
      }
    }
  }
}
