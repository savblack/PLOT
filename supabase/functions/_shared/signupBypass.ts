// Pure decisions for signup-bypass. The HTTP handler in index.ts keeps the
// rate limit, honeypot, and Admin API calls. These helpers are what the
// tests can run without standing up a request.

export type BypassAction = 'signup' | 'resend' | 'magiclink';
export type BypassClient = 'web' | 'app';

// The native app's deep link (apps/mobile/app/(auth)/index.tsx AUTH_APP_CALLBACK).
// It is already on the project's Redirect URLs for GoTrue signup and magic
// links. Sent bare, with no query: an allow-list entry without a wildcard only
// matches the exact URL, and GoTrue falls back to the Site URL (the web app)
// when a redirect does not match. The app tells a bypass signup apart with
// its own stored flag instead of ?from=signup.
export const APP_AUTH_CALLBACK = 'plot://auth/callback';

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

// Only the mobile app sends client: 'app'. Anything else keeps the web callback.
export function bypassClient(value: unknown): BypassClient {
  return value === 'app' ? 'app' : 'web';
}

export function bypassAction(value: unknown): BypassAction {
  if (value === 'resend' || value === 'magiclink') return value;
  return 'signup';
}

// Signup, resend, and magic link used to share one 3/hour IP bucket. A person
// who created an account, resent the email, then asked for a magic link was
// rejected on the next try. Each action keeps its own 3/hour bucket. Signup
// stays at 3 because that call creates an account. The global bucket is still
// one counter for every action.
export function rateScopeFor(action: BypassAction): string {
  return `signup-bypass:${action}`;
}

export const SIGNUP_BYPASS_GLOBAL_SCOPE = 'signup-bypass-all';

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
export function authCallbackRedirect(
  origin: string | null,
  action: BypassAction,
  confirmSignup = false,
  client: BypassClient = 'web',
): string {
  if (client === 'app') return APP_AUTH_CALLBACK;
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

/**
 * The app's inbox step takes a six-digit code for a link opened on another
 * device, so an app request carries generateLink's email_otp. Web has no code
 * field, so its email stays link-only.
 */
export function authLinkMail(action: BypassAction, actionLink: string, code?: string): { subject: string, text: string } {
  const codeLine = code ? `\n\nOn a different device? Enter this code in the Plot app instead: ${code}` : '';
  const ignore = '\n\nIf you did not request this, you can ignore this email.';
  if (action === 'magiclink') {
    return {
      subject: 'Your Plot sign-in link',
      text: `Sign in to Plot by opening this link:\n\n${actionLink}${codeLine}${ignore}`,
    };
  }
  return {
    subject: 'Confirm your Plot account',
    text: `Confirm your Plot account by opening this link:\n\n${actionLink}${codeLine}${ignore}`,
  };
}
