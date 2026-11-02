import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from './database.types.ts';
import { authCallbackRedirect, isMissingUserError, type BypassAction } from './signupBypass.ts';

export type LinkResult = 'sent' | 'absent' | 'failed' | 'withdrawn' | 'withdraw_failed';

// Shown when the mailer accepted the link and both password updates then
// failed, so the emailed link was cancelled. Same sentence as
// AUTH_PAGE.linkWithdrawn. This function cannot import the app catalog.
export const LINK_WITHDRAWN_ERROR = 'We emailed a sign-in link, then had to cancel it because we could not secure the account. Please try again.';

// Shown when that cancellation also failed. The emailed link is still live.
// Same sentence as AUTH_PAGE.linkWithdrawFailed.
export const LINK_WITHDRAW_FAILED_ERROR = 'We emailed a sign-in link, but we could not secure the account or cancel that link. Do not open it.';

export function linkDeliveryError(result: LinkResult): { error: string; reason: string; status: number } | null {
  if (result === 'withdrawn') return { error: LINK_WITHDRAWN_ERROR, reason: 'link_withdrawn', status: 503 };
  if (result === 'withdraw_failed') return { error: LINK_WITHDRAW_FAILED_ERROR, reason: 'link_withdraw_failed', status: 503 };
  if (result === 'failed') {
    return { error: 'We could not send your confirmation email. Please try again.', reason: 'email_failed', status: 503 };
  }
  return null;
}
export type AuthAccount = { id: string; confirmed: boolean };

type GenerateLink = SupabaseClient<Database>['auth']['admin']['generateLink'];
type DeleteUser = SupabaseClient<Database>['auth']['admin']['deleteUser'];
type UpdateUser = SupabaseClient<Database>['auth']['admin']['updateUserById'];

export type SignupLinkAdmin = {
  generateLink: GenerateLink;
  deleteUser: DeleteUser;
  updateUserById: UpdateUser;
  findUserByEmail: (email: string) => Promise<AuthAccount | null>;
};

type SendLink = (email: string, link: string, action: BypassAction, redirect: string) => Promise<LinkResult>;

type ListedUser = {
  id?: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
};

// GoTrue's admin list filter is a substring match. `a@example.com` also
// matches `extra-a@example.com`, so the caller has to compare the whole address.
export function exactAuthUser(users: ListedUser[], email: string): AuthAccount | null {
  const want = email.trim().toLowerCase();
  const match = users.find((user) => String(user.email || '').trim().toLowerCase() === want);
  if (!match?.id) return null;
  return { id: match.id, confirmed: Boolean(match.email_confirmed_at || match.confirmed_at) };
}

const PASSWORD_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const PASSWORD_LOWER = 'abcdefghijklmnopqrstuvwxyz';
const PASSWORD_DIGITS = '0123456789';
const PASSWORD_SYMBOLS = '!@#$%^&*_-+=';
const PASSWORD_LENGTH = 32;

function randomIndex(max: number): number {
  if (max <= 1) return 0;
  const bound = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= bound);
  return value % max;
}

function pickFrom(alphabet: string): string {
  return alphabet[randomIndex(alphabet.length)];
}

// GoTrue rejects an admin password update that misses a required character
// class (checkPasswordStrength). Base64 of random bytes misses '-' and '_'
// about a quarter of the time, so a symbol requirement failed those updates.
// Every password includes one of each class, then the rest is shuffled in.
// 32 characters stays under bcrypt's 72-character limit.
export function replacementPassword(): string {
  const alphabet = PASSWORD_UPPER + PASSWORD_LOWER + PASSWORD_DIGITS + PASSWORD_SYMBOLS;
  const chars = [
    pickFrom(PASSWORD_UPPER),
    pickFrom(PASSWORD_LOWER),
    pickFrom(PASSWORD_DIGITS),
    pickFrom(PASSWORD_SYMBOLS),
  ];
  while (chars.length < PASSWORD_LENGTH) chars.push(pickFrom(alphabet));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    const swap = chars[i];
    chars[i] = chars[j];
    chars[j] = swap;
  }
  return chars.join('');
}

// Look the address up before generateLink. generateLink inserts a row when
// the address is new, and that insert fires trg_notify_new_signup. Deleting
// the row afterwards does not undo the Brevo add or the signup alert.
export async function findAuthUserByEmail(
  supabaseUrl: string,
  apiKey: string,
  email: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AuthAccount | null> {
  const want = email.trim().toLowerCase();
  for (let page = 1; page <= 5; page++) {
    const endpoint = new URL('/auth/v1/admin/users', supabaseUrl);
    endpoint.searchParams.set('filter', want);
    endpoint.searchParams.set('page', String(page));
    endpoint.searchParams.set('per_page', '200');
    const res = await fetchImpl(endpoint, {
      headers: { Authorization: `Bearer ${apiKey}`, apikey: apiKey },
    });
    if (!res.ok) throw new Error(`auth user lookup failed (${res.status})`);
    const body = await res.json();
    const users = Array.isArray(body?.users) ? body.users as ListedUser[] : [];
    const match = exactAuthUser(users, want);
    if (match) return match;
    if (users.length < 200) return null;
  }
  return null;
}

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
    const existing = await admin.findUserByEmail(email);
    // Resend and the already-registered signup path must not invent an account.
    // `absent` is reported to the browser as the same success as a sent link.
    if (!existing && action !== 'magiclink') return 'absent';

    const redirectTo = !existing
      ? authCallbackRedirect(origin, 'signup', true)
      : authCallbackRedirect(origin, action, confirmSignup);
    const generated = await admin.generateLink({ type: 'magiclink', email, options: { redirectTo } });
    if (generated.error) {
      if (isMissingUserError(generated.error.message)) return 'absent';
      console.error('[signup-bypass] generateLink failed');
      return 'failed';
    }
    if (!existing && generated.data?.properties?.verification_type === 'signup' && generated.data.user?.id) {
      createdId = generated.data.user.id;
    }
    if (!generated.data?.properties?.action_link) return 'failed';
    const mailAction: BypassAction = !existing || action === 'signup' || (confirmSignup && action === 'magiclink')
      ? 'signup'
      : action;
    delivered = await mailLink(email, generated.data.properties.action_link, mailAction, redirectTo) === 'sent';
    if (!delivered) return 'failed';

    // Rotate only after the mailer has accepted the message. Doing it earlier
    // locked a real owner out when the bypass send then failed, and left them
    // with a password they never saw. A failed send leaves the old password
    // in place. A confirmed member is never rotated.
    if (existing && !existing.confirmed) {
      let rotated = false;
      for (let attempt = 0; attempt < 2 && !rotated; attempt++) {
        const { error } = await admin.updateUserById(existing.id, { password: replacementPassword() });
        if (!error) rotated = true;
        else console.error('[signup-bypass] could not replace unconfirmed password after the link was accepted');
      }
      if (!rotated) {
        // The emailed link is still valid until its recovery token is replaced.
        // GoTrue's adminGenerateLink for type magiclink writes a new
        // recovery_token and CreateOneTimeToken deletes the previous
        // recovery_token row first (internal/api/mail.go,
        // internal/models/one_time_token.go). Verify looks that hash up, so
        // the link already emailed no longer matches. This call is not mailed.
        try {
          const withdrawn = await admin.generateLink({ type: 'magiclink', email, options: { redirectTo } });
          if (withdrawn.error || !withdrawn.data?.properties?.action_link) {
            console.error('[signup-bypass] ALERT emailed magic link is still live: generateLink did not replace the recovery token');
            return 'withdraw_failed';
          }
        } catch (err) {
          const detail = err instanceof Error ? err.message : 'generateLink threw';
          console.error(`[signup-bypass] ALERT emailed magic link is still live: ${detail}`);
          return 'withdraw_failed';
        }
        return 'withdrawn';
      }
    }
    return 'sent';
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
