// Pure decisions for signup-bypass. The HTTP handler in index.ts keeps the
// rate limit, honeypot, and Admin API calls. These helpers are what the
// tests can run without standing up a request.

export type BypassAction = 'signup' | 'resend' | 'magiclink';

export function allowedOrigin(origin: string | null): string {
  if (!origin) return 'https://app.theplot.tv';
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1')) return origin;
    if (hostname === 'theplot.tv' || hostname.endsWith('.theplot.tv')) return origin;
    if (protocol === 'https:' && hostname.endsWith('.plot-5wr.pages.dev')) return origin;
  } catch { /* use canonical origin */ }
  return 'https://app.theplot.tv';
}

export function bypassAction(value: unknown): BypassAction {
  if (value === 'resend' || value === 'magiclink') return value;
  return 'signup';
}

export function isExistingAccountError(message: string | null | undefined): boolean {
  return /already|exists|registered/i.test(message || '');
}

export function isMissingUserError(message: string | null | undefined): boolean {
  return /not found|no user|does not exist/i.test(message || '');
}

/**
 * Where the email link sends the browser after GoTrue verifies it.
 * Signup and resend mark the click as a bypass signup so /auth/callback can
 * fire user_signed_up without sessionStorage. A magic link for someone who
 * is already a member stays a sign-in unless the caller says this click is
 * how a new account finishes signup.
 */
export function authCallbackRedirect(origin: string | null, action: BypassAction, confirmSignup = false): string {
  const url = new URL('/auth/callback', allowedOrigin(origin));
  const asSignup = action !== 'magiclink' || confirmSignup;
  if (asSignup) {
    url.searchParams.set('from', 'signup');
    url.searchParams.set('method', 'email');
  } else {
    url.searchParams.set('method', 'magic_link');
  }
  url.searchParams.set('via', 'bypass');
  return url.toString();
}

export function authLinkMail(action: BypassAction, actionLink: string): { subject: string, text: string } {
  if (action === 'magiclink') {
    return {
      subject: 'Your Plot sign-in link',
      text: `Sign in to Plot by opening this link:\n\n${actionLink}\n\nIf you did not request this, you can ignore this email.`,
    };
  }
  return {
    subject: 'Confirm your Plot account',
    text: `Confirm your Plot account by opening this link:\n\n${actionLink}\n\nIf you did not request this, you can ignore this email.`,
  };
}
