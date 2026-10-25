/**
 * signup-bypass — exceptional-path account creation for browsers where
 * Cloudflare Turnstile has failed to produce a token (ad blocker, privacy
 * extension, or the widget never called back). The normal signup path
 * (apps/web AuthPage.jsx calling `supabase.auth.signUp()` directly, gated
 * by Supabase's dashboard-level Bot & Abuse Protection) stays the primary
 * route whenever a token arrives in time. This function runs when that
 * token is missing: the page waits a few seconds, and a widget error arms
 * it immediately (see packages/core/captchaGate.js).
 *
 * Does its own bot mitigation instead of relying on Turnstile:
 *   1. Honeypot ('website' field, invisible to humans — see .fn-website in
 *      AuthPage.css). A filled value fakes a generic success so bots aren't
 *      tipped off, mirroring newsletter-subscribe/index.ts.
 *   2. Submission-timing heuristic, against a SERVER-issued clock — GET
 *      issues a signed `{iat}` token (HMAC'd with the service-role key,
 *      which never reaches the client) when the signup page loads; POST
 *      requires that same token back and verifies its signature and age
 *      itself. A raw client-supplied timestamp would be trivial to fake (a
 *      script can just claim "I've been here 5 seconds" instantly) — this
 *      makes the elapsed time a fact this server observed, not a claim the
 *      caller makes about itself.
 *   3. Per-IP rate limit — DB-backed and atomic via the existing
 *      auth_note_fail RPC / auth_fail_attempts table (see
 *      supabase/migrations/20260728000000_auth_fail_attempts.sql), NOT an
 *      in-memory Map: an earlier in-memory per-isolate limiter was proven
 *      ineffective (400 concurrent requests all returned 200, since Supabase
 *      spreads bursts across isolates with independent counters). This is a
 *      real rejection (429), not a faked success — it's capacity control, not bot
 *      detection.
 *
 * On success, creates an unconfirmed account via the Admin API and sends a
 * magic link to the supplied mailbox. The verification credential never
 * returns to the anonymous caller.
 *
 * Deploy with --no-verify-jwt (no session exists yet when this is called —
 * see supabase/config.toml).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../_shared/database.types.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { usableRateCount } from '../_shared/securityGuards.js';
import { deliverSignupLink } from '../_shared/signupMailer.ts';
import {
  allowedOrigin,
  authCallbackRedirect,
  authLinkMail,
  bypassAction,
  isExistingAccountError,
  isMissingUserError,
  type BypassAction,
} from '../_shared/signupBypass.ts';

function cors(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(origin),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

function json(body: unknown, origin: string | null, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json', ...extraHeaders },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESEND_API_URL = 'https://api.resend.com/emails';
const CONFIRM_FROM = 'Plot <hello@theplot.tv>';

async function sendAuthEmail(email: string, actionLink: string, action: BypassAction) {
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) throw new Error('RESEND_API_KEY is not configured');
  const mail = authLinkMail(action, actionLink);
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: CONFIRM_FROM,
      to: [email],
      subject: mail.subject,
      text: mail.text,
    }),
  });
  if (!res.ok) throw new Error(`Resend request failed (${res.status})`);
}

// Fallback when Resend fails: send through Supabase's own auth mailer (the
// project's configured SMTP). The user already exists, so shouldCreateUser is
// off. Uses an anon-key client so the service-role client's session is untouched.
async function sendViaSupabaseMailer(email: string, redirectTo: string) {
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!anon) throw new Error('SUPABASE_ANON_KEY is not configured');
  const mailer = createClient(Deno.env.get('SUPABASE_URL')!, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await mailer.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
  });
  if (error) throw new Error(`Supabase mailer failed (${error.status ?? 'unknown'})`);
}

type LinkResult = 'sent' | 'absent' | 'failed';

async function mailLink(email: string, actionLink: string, action: BypassAction, redirectTo: string): Promise<LinkResult> {
  try {
    await deliverSignupLink(
      () => sendAuthEmail(email, actionLink, action),
      () => sendViaSupabaseMailer(email, redirectTo),
    );
    return 'sent';
  } catch (error) {
    console.error('[signup-bypass] could not send auth link:', (error as Error).message);
    return 'failed';
  }
}

// Magic link for an address that already has an account, or a resend of the
// signup confirmation. The response the caller returns must not say whether
// the address exists. `absent` means generateLink could not find a user and
// this action is not allowed to create one.
async function deliverMagicLink(
  email: string,
  origin: string | null,
  action: BypassAction,
  confirmSignup: boolean,
): Promise<LinkResult> {
  const redirectTo = authCallbackRedirect(origin, action, confirmSignup);
  const generated = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo },
  });
  if (!generated.error && generated.data?.properties?.action_link) {
    const mailAction: BypassAction = confirmSignup && action === 'magiclink' ? 'signup' : action;
    return mailLink(email, generated.data.properties.action_link, mailAction, redirectTo);
  }
  if (action === 'magiclink' && isMissingUserError(generated.error?.message)) {
    const created = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: false,
    });
    if (created.error && !isExistingAccountError(created.error.message)) {
      console.error('[signup-bypass] could not create user for magic link');
      return 'failed';
    }
    const signupRedirect = authCallbackRedirect(origin, 'signup', true);
    const again = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: signupRedirect },
    });
    if (again.error || !again.data?.properties?.action_link) return 'failed';
    return mailLink(email, again.data.properties.action_link, 'signup', signupRedirect);
  }
  if (isMissingUserError(generated.error?.message)) return 'absent';
  console.error('[signup-bypass] generateLink failed');
  return 'failed';
}

// Deliberately fast — a real user reads the form and types for at least this
// long; a script that fills+submits immediately doesn't.
const MIN_SUBMIT_MS = 1200;
// Caps how long a form token can be stockpiled before use — not a security
// boundary on its own (the rate limit does that job), just hygiene so tokens
// can't be minted far in advance and hoarded.
// 15 minutes. The web client refreshes sooner
// (SIGNUP_FORM_TOKEN_REFRESH_AFTER_MS in apps/web/src/utils/signupFormToken.js)
// so a form left open does not POST an expired token and paint a fake
// confirmation. Keep that margin if this window changes.
const MAX_TOKEN_AGE_MS = 15 * 60 * 1000;

// Deliberately low — this is an exceptional path (Turnstile already failed
// for this browser), not the general signup rate.
const RATE_SCOPE = 'signup-bypass';
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX_ATTEMPTS = 3;
// Across all callers. The per-IP limit is cheap to sidestep from a pool of
// addresses; this bounds what the whole pool can do in an hour (each attempt
// here creates an unconfirmed account and sends an email). A real hour of
// bypass signups is in the single digits.
const RATE_MAX_GLOBAL = 60;

// Only accept a platform-provided connection header — X-Forwarded-For is
// caller-controlled when this public function is invoked directly.
// No header means no per-IP bucket, so every caller would share one and the
// limit would either fail open (keyed on a constant) or lock everyone out at
// once. Returning null makes the caller refuse the request instead.
const clientIp = (req: Request): string | null => req.headers.get('cf-connecting-ip') || null;

// This function only ever needs elevated privileges (creating a user who
// doesn't exist yet, with no session to act on behalf of) — unlike functions
// that split anon (user-context) vs service-role (admin) clients, there is
// no anon/user-context case here at all.
const SERVICE_ROLE_KEY = serviceKey();
const supabaseAdmin = createClient<Database>(Deno.env.get('SUPABASE_URL')!, SERVICE_ROLE_KEY);

// --- Signed form-timing token ------------------------------------------
// HMAC-SHA256 over a base64url-encoded {iat} payload. The key is
// SIGNUP_FORM_TOKEN_SECRET when set, otherwise a purpose-specific key derived
// from the service key with HKDF. Until 2026-10-14 the service key itself was
// the HMAC key; a secret that authenticates the whole project should not
// double as a signing key for form tokens, because any weakness in one use is
// a weakness in the other. Deriving keeps the deploy free of a new secret
// while separating the two. Changing either input invalidates tokens already
// issued, which only costs a visitor one 15-minute form window.
let hmacKeyPromise: Promise<CryptoKey> | null = null;
function getHmacKey(): Promise<CryptoKey> {
  if (!hmacKeyPromise) {
    hmacKeyPromise = (async () => {
      const enc = new TextEncoder();
      const dedicated = Deno.env.get('SIGNUP_FORM_TOKEN_SECRET');
      if (dedicated) {
        return crypto.subtle.importKey('raw', enc.encode(dedicated), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
      }
      const ikm = await crypto.subtle.importKey('raw', enc.encode(SERVICE_ROLE_KEY), 'HKDF', false, ['deriveKey']);
      return crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('plot-signup-bypass'), info: enc.encode('form-timing-token-v1') },
        ikm,
        { name: 'HMAC', hash: 'SHA-256', length: 256 },
        false,
        ['sign', 'verify'],
      );
    })();
  }
  return hmacKeyPromise;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// Uint8Array<ArrayBuffer>, not plain Uint8Array: since TS 5.7 the class is
// generic over its backing buffer, and only an ArrayBuffer-backed view counts as
// a BufferSource for crypto.subtle.
function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function issueFormToken(): Promise<string> {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({ iat: Date.now() })));
  const key = await getHmacKey();
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(sig))}`;
}

// Returns the token's iat if the signature is valid and it's not stale/from
// the future, otherwise null (treated identically to a missing token).
async function verifyFormToken(token: unknown): Promise<number | null> {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  try {
    const key = await getHmacKey();
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(sig),
      new TextEncoder().encode(payload),
    );
    if (!valid) return null;
    const { iat } = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    if (typeof iat !== 'number') return null;
    const age = Date.now() - iat;
    if (age < 0 || age > MAX_TOKEN_AGE_MS) return null;
    return iat;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });

  // Issues the signed timing token the signup form fetches on load (see
  // AuthPage.jsx) — no side effects, safe to call anonymously and often.
  if (req.method === 'GET') return json({ formToken: await issueFormToken() }, origin);

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, origin, 405);

  let body: {
    email?: string;
    password?: string;
    website?: string;
    formToken?: string;
    action?: string;
    confirmSignup?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, origin, 400);
  }

  // 1. Honeypot — real users never see or fill this field. Fake a generic
  // success so bots aren't tipped off, rather than returning an error.
  if (body.website) return json({ ok: true }, origin);

  // 2. Timing heuristic, verified against the server's own record of when
  // the form was issued (see verifyFormToken above) — same fake-success
  // treatment as the honeypot, for the same reason (don't reveal detection).
  const issuedAt = await verifyFormToken(body.formToken);
  if (issuedAt === null || Date.now() - issuedAt < MIN_SUBMIT_MS) return json({ ok: true }, origin);

  const action = bypassAction(body.action);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!EMAIL_RE.test(email)) return json({ error: 'Please enter a valid email address.', reason: 'invalid_email' }, origin, 400);
  // Resend and magic link only need the mailbox. Signup still requires a password.
  if (action === 'signup' && password.length < 6) {
    return json({ error: 'Password must be at least 6 characters.', reason: 'weak_password' }, origin, 400);
  }

  // 3. Rate limit — atomic, DB-backed, shared table/RPC with admin-review's
  // login throttle and media-sync's companion-token auth, kept independent
  // via `scope`.
  const ip = clientIp(req);
  if (!ip) {
    console.error('[signup-bypass] no cf-connecting-ip header; refusing rather than sharing one rate bucket');
    return json({ error: 'Something went wrong. Please try again.', reason: 'unknown' }, origin, 503);
  }
  const [perIp, global] = await Promise.all([
    supabaseAdmin.rpc('auth_note_fail', { p_scope: RATE_SCOPE, p_ip: ip, p_window_ms: RATE_WINDOW_MS }),
    supabaseAdmin.rpc('auth_note_fail', { p_scope: `${RATE_SCOPE}-all`, p_ip: 'global', p_window_ms: RATE_WINDOW_MS }),
  ]);
  const attempts = usableRateCount(perIp);
  const globalAttempts = usableRateCount(global);
  if (attempts === null || globalAttempts === null) {
    console.error('Signup rate check failed:', perIp.error ?? global.error ?? 'invalid attempt count');
    return json({ error: 'Something went wrong. Please try again.', reason: 'unknown' }, origin, 503);
  }
  if (attempts > RATE_MAX_ATTEMPTS || globalAttempts > RATE_MAX_GLOBAL) {
    return json(
      { error: 'Too many attempts. Please wait a moment and try again.', reason: 'rate_limited' },
      origin,
      429,
      { 'Retry-After': String(RATE_WINDOW_MS / 1000) },
    );
  }

  // Resend and "email me a magic link" never create a second account. They
  // send a magic link through Resend, inside the same rate limit. A missing
  // account gets the same success body so this route is not an address oracle.
  if (action !== 'signup') {
    const sent = await deliverMagicLink(email, origin, action, body.confirmSignup === true);
    if (sent === 'failed') {
      return json({ error: 'We could not send your confirmation email. Please try again.', reason: 'email_failed' }, origin, 503);
    }
    return json({ ok: true, requires_email_confirmation: true }, origin);
  }

  // Account creation deliberately stays unconfirmed. The credential capable
  // of confirming it is delivered only to the supplied mailbox below.
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
  });
  if (createError) {
    // An address that already has an account gets the same answer as a new
    // one. Saying "already registered" here let anyone confirm whether an
    // address is a Plot member. The earlier version also sent no email, so
    // an unconfirmed person sat on "check your inbox" with nothing coming.
    // A magic link confirms an unconfirmed account and signs in a confirmed
    // one, and the response stays identical either way.
    if (isExistingAccountError(createError.message)) {
      const sent = await deliverMagicLink(email, origin, 'signup', true);
      if (sent === 'failed') {
        return json({ error: 'We could not send your confirmation email. Please try again.', reason: 'email_failed' }, origin, 503);
      }
      return json({ ok: true, requires_email_confirmation: true }, origin);
    }
    return json({ error: 'Something went wrong. Please try again.', reason: 'unknown' }, origin, 400);
  }

  const redirectTo = authCallbackRedirect(origin, 'signup');
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo },
  });
  if (linkError || !linkData?.properties?.action_link) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    return json({ error: 'Something went wrong. Please try again.', reason: 'unknown' }, origin, 500);
  }

  const mailed = await mailLink(email, linkData.properties.action_link, 'signup', redirectTo);
  if (mailed !== 'sent') {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    return json({ error: 'We could not send your confirmation email. Please try again.', reason: 'email_failed' }, origin, 503);
  }

  return json({ ok: true, requires_email_confirmation: true }, origin);
});
