/**
 * signup-bypass — exceptional-path account creation for browsers where
 * Cloudflare Turnstile has persistently failed (ad blocker / privacy
 * extension). The normal signup path (apps/web AuthPage.jsx calling
 * `supabase.auth.signUp()` directly, gated by Supabase's dashboard-level
 * Bot & Abuse Protection) is untouched and stays the primary route for
 * everyone else — this function is only invoked once Turnstile has crossed
 * PERSISTENT_FAILURE_THRESHOLD (see apps/web/src/components/Turnstile.jsx).
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
 * On success, creates the account via the Admin API (bypasses Supabase
 * Auth's own captcha gate, which only applies to client-facing calls) and
 * returns a magic-link token_hash the client verifies immediately
 * (supabase.auth.verifyOtp) to get a live session — no email round-trip.
 *
 * Deploy with --no-verify-jwt (no session exists yet when this is called —
 * see supabase/config.toml).
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { Database } from '../_shared/database.types.ts'

// Db is the *default* instantiation
// (SupabaseClient<unknown, …, never, never>), so every row came back
// `never` and the real client was not even assignable to it. Bind it to
// the schema instead.
type Db = SupabaseClient<Database>;

function allowedOrigin(origin: string | null) {
  if (!origin) return 'https://app.theplot.tv';
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1')) return origin;
    if (hostname === 'theplot.tv' || hostname.endsWith('.theplot.tv')) return origin;
    if (protocol === 'https:' && hostname.endsWith('.plot-5wr.pages.dev')) return origin;
  } catch { /* use canonical origin */ }
  return 'https://app.theplot.tv';
}

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

// Deliberately fast — a real user reads the form and types for at least this
// long; a script that fills+submits immediately doesn't.
const MIN_SUBMIT_MS = 1200;
// Caps how long a form token can be stockpiled before use — not a security
// boundary on its own (the rate limit does that job), just hygiene so tokens
// can't be minted far in advance and hoarded.
const MAX_TOKEN_AGE_MS = 15 * 60 * 1000; // 15 minutes

// Deliberately low — this is an exceptional path (Turnstile already failed
// for this browser), not the general signup rate.
const RATE_SCOPE = 'signup-bypass';
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX_ATTEMPTS = 3;

// Only accept a platform-provided connection header — X-Forwarded-For is
// caller-controlled when this public function is invoked directly.
const clientIp = (req: Request): string => req.headers.get('cf-connecting-ip') || 'unknown';

// This function only ever needs elevated privileges (creating a user who
// doesn't exist yet, with no session to act on behalf of) — unlike functions
// that split anon (user-context) vs service-role (admin) clients, there is
// no anon/user-context case here at all.
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseAdmin = createClient<Database>(Deno.env.get('SUPABASE_URL')!, SERVICE_ROLE_KEY);

// --- Signed form-timing token ------------------------------------------
// HMAC-SHA256 over a base64url-encoded {iat} payload, keyed by the
// service-role key — a secret the client never has access to, so it can't
// forge or backdate a token. Deliberately reuses that existing secret
// rather than provisioning a new one just for this.
let hmacKeyPromise: Promise<CryptoKey> | null = null;
function getHmacKey(): Promise<CryptoKey> {
  if (!hmacKeyPromise) {
    hmacKeyPromise = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(SERVICE_ROLE_KEY),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
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

  let body: { email?: string; password?: string; website?: string; formToken?: string };
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

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!EMAIL_RE.test(email)) return json({ error: 'Please enter a valid email address.', reason: 'invalid_email' }, origin, 400);
  if (password.length < 6) return json({ error: 'Password must be at least 6 characters.', reason: 'weak_password' }, origin, 400);

  // 3. Rate limit — atomic, DB-backed, shared table/RPC with admin-review's
  // login throttle and media-sync's companion-token auth, kept independent
  // via `scope`.
  const ip = clientIp(req);
  const { data: rateCount, error: rateError } = await supabaseAdmin.rpc('auth_note_fail', {
    p_scope: RATE_SCOPE,
    p_ip: ip,
    p_window_ms: RATE_WINDOW_MS,
  });
  if (!rateError && typeof rateCount === 'number' && rateCount > RATE_MAX_ATTEMPTS) {
    return json(
      { error: 'Too many attempts. Please wait a moment and try again.', reason: 'rate_limited' },
      origin,
      429,
      { 'Retry-After': String(RATE_WINDOW_MS / 1000) },
    );
  }

  // Account creation. email_confirm: true — this path exists specifically to
  // get a blocked user into a live session immediately (see verifyOtp below);
  // there's no working captcha-gated flow left to fall back on for a second
  // confirmation step.
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) {
    const already = /already|exists|registered/i.test(createError.message || '');
    return json(
      already
        ? { error: 'An account with this email already exists. Try signing in instead.', reason: 'already_registered' }
        : { error: 'Something went wrong. Please try again.', reason: 'unknown' },
      origin,
      already ? 409 : 400,
    );
  }

  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError || !linkData?.properties?.hashed_token) {
    return json({ error: 'Something went wrong. Please try again.', reason: 'unknown' }, origin, 500);
  }

  return json({ token_hash: linkData.properties.hashed_token, user_id: created.user.id }, origin);
});
