import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from './database.types.ts';
import { authCallbackRedirect, isMissingUserError, type BypassAction } from './signupBypass.ts';

export type LinkResult = 'sent' | 'absent' | 'failed';
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

export function replacementPassword(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
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

    // A confirming link leaves whatever password is already on the row.
    // An unconfirmed row may have been created by someone else. Replace that
    // password before the link goes out. A confirmed member keeps theirs.
    if (existing && !existing.confirmed) {
      const { error } = await admin.updateUserById(existing.id, { password: replacementPassword() });
      if (error) {
        console.error('[signup-bypass] could not replace unconfirmed password');
        return 'failed';
      }
    }

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
