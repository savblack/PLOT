import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  Dimensions, Image, Animated, Easing, FlatList,
} from 'react-native';
import { TextInput } from '../../components/TextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import Svg, { Path } from 'react-native-svg';
import * as Crypto from 'expo-crypto';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '../../lib/supabase';
import { loadNewThisWeek } from '@plot/core/newThisWeek.js';
// This screen is a fixed composition (dark poster wall + light glass panel,
// mirroring the web AuthPage) — it deliberately doesn't follow the app theme.
import { colors, fontFamily, fontSize, radii, spacing } from '../../lib/tokens';
import Turnstile from '../../components/Turnstile';
import { track, EVENTS } from '../../lib/analytics';
import { authErrorReason } from '@plot/core/authErrors.js';
import { AUTH_TIMEOUT_MESSAGE, withAuthTimeout } from '@plot/core/authTimeout.js';
import { CAPTCHA_SUBMIT_ATTEMPTS, captchaRetryAfterWait, captchaSubmitEnabled, captchaSubmitPlan, captchaWaitOver, shouldResetCaptcha } from '@plot/core/captchaGate.js';
import { shouldMagicLinkViaBypass, shouldResendViaBypass } from '@plot/core/authBypass.js';
import { createSignupBypassClient } from '@plot/core/signupBypassClient.js';
import { COMMON } from '@plot/core/copy/common.js';
import { AUTH_PAGE, MIN_PASSWORD_LENGTH } from '@plot/core/copy/authPage.js';
import { SHOW_APPLE_LOGIN, SHOW_GOOGLE_LOGIN } from '../../lib/launchFeatures';
import { hasSignedInBefore } from '../../lib/signedInBefore';
import { rememberBypassSignup, reportBypassSignupConfirmed } from '../../lib/bypassSignupReport';
import PlotWordmark from '../../components/PlotWordmark';
import { useDialog } from '../../components/Dialog';

// The panel's fixed palette (see the note on the tokens import): charcoal ink
// and zinc greys picked against the dark poster wall, named once so the
// colour-literal ratchet (scripts/check-color-literals.mjs) sees one each.
const INK = '#09090B';
const PAPER = '#FAFAFA';
const MUTED = '#71717A';
const QUIET = '#A1A1AA';
const PLACEHOLDER = '#898989';

const { width: W, height: H } = Dimensions.get('window');

const POSTER_W = 110;
const POSTER_H = 165;
const GAP = 10;

// Posters come from the shared "New this week" picker (@plot/core/newThisWeek.js),
// the same titles and rules as the web sign-in pages. There is no hardcoded
// fallback list: TMDB paths are never guessed, so the wall stays dark until
// the titles arrive, and stays dark if they never do.
const WALL_POSTER_COUNT = 18;
const WALL_MIN_POSTERS = 9;

function buildColumns(paths: string[], cols: number) {
  const columns: string[][] = Array.from({ length: cols }, () => []);
  paths.forEach((p, i) => columns[i % cols].push(p));
  return columns;
}

function ScrollingColumn({ paths, offset, duration }: { paths: string[]; offset: number; duration: number }) {
  const translateY = useRef(new Animated.Value(offset)).current;
  const totalH = paths.length * (POSTER_H + GAP);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(translateY, {
        toValue: offset - totalH,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const doubled = [...paths, ...paths];

  return (
    <Animated.View style={{ transform: [{ translateY }] }}>
      {doubled.map((p, i) => (
        <View key={i} style={{ marginBottom: GAP }}>
          <Image
            source={{ uri: `https://image.tmdb.org/t/p/w342${p}` }}
            style={{ width: POSTER_W, height: POSTER_H, borderRadius: 10 }}
            resizeMode="cover"
          />
        </View>
      ))}
    </Animated.View>
  );
}

// 'inbox' is the step after an email sign-up or a magic-link request: the
// email carries a link that opens the app and a numeric code, and this
// screen takes the code. It replaces the old "Almost there!" alert.
type Mode = 'signin' | 'signup' | 'forgot' | 'inbox';
type InboxKind = 'signup' | 'magic';
type CaptchaMode = 'signup' | 'login' | 'forgot' | 'magic';

function GoogleIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" aria-hidden>
      <Path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <Path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.583-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <Path fill="#FBBC05" d="M3.964 10.705a5.41 5.41 0 0 1-.282-1.705c0-.593.102-1.17.282-1.705V4.963H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.037l3.007-2.332z" />
      <Path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.963L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </Svg>
  );
}

// Read the session Supabase hands back on an OAuth redirect. The mobile client
// has detectSessionInUrl off (lib/configureCore.ts), so the implicit flow's
// `#access_token=…&refresh_token=…` fragment is parsed here by hand.
function sessionFromRedirect(url: string) {
  const hash = url.split('#')[1] ?? '';
  const params = new URLSearchParams(hash);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  return access_token && refresh_token ? { access_token, refresh_token } : null;
}

// Cloudflare Turnstile — the Supabase project enforces captcha on auth, so
// every sign-in / sign-up / magic-link must carry a token (mirrors web AuthPage).
const TURNSTILE_SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;

// Password-reset links resolve on the web app (there's no native
// set-new-password screen yet), so point them at the web callback.
const AUTH_WEB_CALLBACK = 'https://app.theplot.tv/auth/callback';

// Magic links and sign-up confirmations sign the user straight into a session,
// so they come back into the app via the plot:// deep link that
// app/(auth)/callback.tsx listens for. A link opened on another device cannot
// open this app, which is why the same email also carries a numeric code
// (see the 'inbox' mode below).
// PRODUCTION REQUIREMENT: this exact URL must be in Supabase Dashboard →
// Authentication → URL Configuration → Redirect URLs. Supabase compares it
// literally; on a mismatch it silently sends the person to the Site URL (the
// web app) instead of back into this app.
// Written out rather than built with Linking.createURL('/auth/callback'): in a
// store build that returns plot:///auth/callback (three slashes, empty host),
// which did not match the allow-listed plot://auth/callback, so Google sign-in
// on TestFlight build 6 finished on theplot.tv instead of in the app.
// The scheme is `expo.scheme` in app.json.
const AUTH_APP_CALLBACK = 'plot://auth/callback';

// Supabase's email OTP length setting allows 6 to 10 digits.
const OTP_MIN_DIGITS = 6;
const OTP_MAX_DIGITS = 10;

// Kind, Plot-voiced auth errors (mirrors web AuthPage's friendlyError).
function friendlyAuthError(msg?: string) {
  if (!msg) return COMMON.genericError;
  if (msg.includes('Invalid login credentials'))   return AUTH_PAGE.incorrectCredentials;
  if (msg.includes('Email not confirmed'))         return AUTH_PAGE.activationEmailWaiting.replace(/^__warning__/, '');
  if (msg.includes('User already registered'))     return AUTH_PAGE.accountAlreadyExists;
  if (msg.includes('Password should be at least')) return AUTH_PAGE.weakPassword;
  // Empty password reaching GoTrue — same user-facing fix as a short password.
  if (msg.includes('Signup requires a valid password')) return AUTH_PAGE.weakPassword;
  if (msg.includes('Anonymous sign-ins are disabled'))  return AUTH_PAGE.weakPassword;
  if (msg.includes('Unable to validate email'))    return AUTH_PAGE.invalidEmail;
  if (msg.includes('rate limit') || msg.includes('too many')) return AUTH_PAGE.rateLimited;
  // A timeout or a request that never reached Supabase. The raw text
  // ("Network request failed") told people nothing about what to do.
  if (isConnectionFailure(msg)) return AUTH_PAGE.connectionFailed;
  return msg;
}

// We stopped waiting (withAuthTimeout), or the phone never reached Supabase.
function isConnectionFailure(msg?: string) {
  const reason = authErrorReason(msg);
  return reason === 'timeout' || reason === 'network';
}

// Run a Supabase Auth request under the shared time limit and always come back
// as `{ error }`, so a hang or a thrown network error takes the caller's
// existing error path instead of leaving the button spinning. Mirrors web
// AuthPage's authRequest. The request itself is not cancelled (supabase-js
// takes no AbortSignal here): a late success still stores the session and
// signs the person in, and a late signup still sends its email, which a retry
// then reports as an existing account.
async function authRequest<R extends { error: { message: string } | null }>(
  request: Promise<R>,
): Promise<R | { data: null; error: { message: string } }> {
  try {
    return await withAuthTimeout(request);
  } catch (e) {
    const message = e instanceof Error && e.message ? e.message : AUTH_TIMEOUT_MESSAGE;
    return { data: null, error: { message } };
  }
}

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { notify, dialog } = useDialog();
  // Sign up for a fresh install; Sign in once this device has held a session.
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [inboxKind, setInboxKind] = useState<InboxKind>('signup');
  // Whether the newest email came from signup-bypass. Its code comes from an
  // Admin API magic link, so it verifies as 'email' even on a signup.
  const [inboxViaBypass, setInboxViaBypass] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [resendNote, setResendNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [posterPaths, setPosterPaths] = useState<string[]>([]);
  const [captchaNonce, setCaptchaNonce] = useState(0); // bump to drop a used token
  const [captchaExecute, setCaptchaExecute] = useState(0); // bump to run the challenge
  const captchaTokenRef = useRef<string | null>(null);
  const captchaBlockedRef = useRef(false);
  const captchaErroredRef = useRef(false);
  // Cloudflare is showing its checkbox and waits for a tap.
  const captchaInteractiveRef = useRef(false);
  const captchaErrorCountRef = useRef(0);
  // The same facts as state, for the submit button. The widget starts as soon
  // as the screen shows, and the button waits for its token (see
  // captchaSubmitEnabled) instead of starting the check on tap.
  const [captchaHasToken, setCaptchaHasToken] = useState(false);
  const [captchaErrored, setCaptchaErrored] = useState(false);
  const [captchaInteractive, setCaptchaInteractive] = useState(false);
  const [captchaWaitStart, setCaptchaWaitStart] = useState(() => Date.now());
  const [captchaNow, setCaptchaNow] = useState(() => Date.now());
  // Form token, minimum form age, and the POSTs to signup-bypass, shared with
  // web AuthPage. client: 'app' makes the emailed link open this app.
  const [bypassClient] = useState(() => createSignupBypassClient({ getSupabase: () => supabase, client: 'app' }));
  // Mode switches advance this. A submit still inside the captcha wait or a
  // bypass request must not act on a screen the person has left.
  const attemptRef = useRef(0);
  const beginAttempt = () => {
    attemptRef.current += 1;
    const attempt = attemptRef.current;
    return () => attempt === attemptRef.current;
  };

  // Starts a new wait for the button: the token is gone (used, expired, or
  // being fetched again) and the next one is on its way.
  const markCaptchaWaiting = () => {
    const now = Date.now();
    setCaptchaHasToken(false);
    setCaptchaInteractive(false);
    setCaptchaWaitStart(now);
    setCaptchaNow(now);
  };

  const [captchaStarted, setCaptchaStarted] = useState(false);
  const startCaptcha = () => {
    if (captchaStarted) return;
    setCaptchaStarted(true);
    markCaptchaWaiting();
  };

  // The widget starts its check at the first touch on this screen, not when
  // it opens, so Cloudflare's "Verify you are human" box cannot appear before
  // anyone has done anything. Any touch counts (a field, a button, the wall):
  // iOS needs a tap to focus a field or fill a password, so the check is
  // always under way before someone can submit.
  // When it never returns a token, signup, resend, and magic link go through
  // signup-bypass like web. Sign-in and password reset have no bypass and stop.
  const refreshCaptcha = () => {
    captchaTokenRef.current = null;
    captchaInteractiveRef.current = false;
    markCaptchaWaiting();
    setCaptchaNonce((n) => n + 1);
  };

  const handleCaptchaToken = (token: string | null) => {
    captchaTokenRef.current = token;
    if (token) {
      captchaErroredRef.current = false;
      setCaptchaHasToken(true);
      setCaptchaErrored(false);
      setCaptchaInteractive(false);
    } else {
      markCaptchaWaiting();
    }
  };

  const handleCaptchaInteractive = () => {
    captchaInteractiveRef.current = true;
    setCaptchaInteractive(true);
  };

  const handleCaptchaError = () => {
    captchaTokenRef.current = null;
    captchaInteractiveRef.current = false;
    captchaBlockedRef.current = true;
    captchaErroredRef.current = true;
    setCaptchaErrored(true);
    setCaptchaInteractive(false);
    // Same event web's widget fires on each failure during signup.
    captchaErrorCountRef.current += 1;
    if (mode === 'signup') track(EVENTS.SIGNUP_CAPTCHA_BLOCKED, { attempt: captchaErrorCountRef.current });
  };

  // One attempt. A widget error ends the wait early so the retry can run.
  // A timeout does not: the challenge may still be in flight. While the
  // checkbox is on screen the wait is long enough for someone to tap it.
  const waitForCaptchaAttempt = (authMode: CaptchaMode) => {
    const blockedAtStart = captchaBlockedRef.current;
    if (captchaTokenRef.current) return Promise.resolve(captchaTokenRef.current);
    return new Promise<string | null>((resolve) => {
      const started = Date.now();
      const id = setInterval(() => {
        const token = captchaTokenRef.current;
        const failedNow = captchaErroredRef.current || (captchaBlockedRef.current && !blockedAtStart);
        const over = captchaWaitOver({
          token,
          errored: failedNow,
          interactive: captchaInteractiveRef.current,
          mode: authMode,
          elapsedMs: Date.now() - started,
        });
        if (over) {
          clearInterval(id);
          resolve(token);
        }
      }, 50);
    });
  };

  const requestCaptcha = () => {
    captchaTokenRef.current = null;
    captchaInteractiveRef.current = false;
    markCaptchaWaiting();
    setCaptchaExecute((n) => n + 1);
  };

  // Token to send, or null when captcha is off. False when both attempts
  // finished without a token. Do not post that request to GoTrue.
  const takeCaptchaToken = async (authMode: CaptchaMode) => {
    if (!TURNSTILE_SITE_KEY) return null;
    // Keep a token that arrived after the previous submit stopped waiting.
    if (captchaTokenRef.current) return captchaTokenRef.current;
    // The widget runs on load, so a challenge is usually already in flight.
    // Only an error from that run earns a fresh one on the first attempt.
    let widgetErrored = captchaErroredRef.current;
    for (let attempt = 1; attempt <= CAPTCHA_SUBMIT_ATTEMPTS; attempt += 1) {
      // A timeout must not reset() an interactive challenge that is still
      // on screen. Only a widget error starts a fresh attempt.
      if (shouldResetCaptcha({ attempt, widgetErrored, runsOnLoad: true })) requestCaptcha();
      captchaErroredRef.current = false;
      const token = await waitForCaptchaAttempt(authMode);
      widgetErrored = captchaErroredRef.current;
      const plan = captchaSubmitPlan({
        siteKey: TURNSTILE_SITE_KEY,
        token,
        mode: authMode,
        blocked: captchaBlockedRef.current,
        waited: !token,
      });
      if (plan === 'ready') return token;
      if (!captchaRetryAfterWait({ mode: authMode, errored: widgetErrored, interactive: captchaInteractiveRef.current })) break;
    }
    return false as const;
  };

  // Funnel head, mirroring web: one view event per time the signup form is
  // shown, then one "started" on the first keystroke, Apple sign-in, or
  // submit. The typed value is never captured.
  const signupStarted = useRef(false);
  useEffect(() => {
    if (mode === 'signup') {
      track(EVENTS.SIGNUP_FORM_VIEWED);
      signupStarted.current = false;
      // Fetched on view so the token's age reflects real time on the form
      // if signup-bypass turns out to be needed. No side effects server-side.
      if (TURNSTILE_SITE_KEY) void bypassClient.loadFormToken();
    }
  }, [mode, bypassClient]);

  const noteSignupStarted = () => {
    if (mode !== 'signup' || signupStarted.current) return;
    signupStarted.current = true;
    track(EVENTS.SIGNUP_FORM_STARTED);
  };

  useEffect(() => {
    let mounted = true;
    hasSignedInBefore().then((before) => { if (mounted && before) setMode('signin'); });
    return () => { mounted = false; };
  }, []);

  const switchMode = (next: Mode) => {
    beginAttempt();
    bypassClient.reset();
    setLoading(false);
    setEmailError(null);
    setPasswordError(null);
    setCodeError(null);
    setResendNote(null);
    setMode(next);
  };

  const openInbox = (kind: InboxKind, viaBypass = false) => {
    setInboxKind(kind);
    setInboxViaBypass(viaBypass);
    setCode('');
    setCodeError(null);
    setResendNote(null);
    setMode('inbox');
  };

  useEffect(() => {
    let cancelled = false;
    loadNewThisWeek({ count: WALL_POSTER_COUNT }).then((titles) => {
      const paths = titles.map(t => t.posterPath);
      if (!cancelled && paths.length >= WALL_MIN_POSTERS) setPosterPaths(paths);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!SHOW_APPLE_LOGIN || Platform.OS !== 'ios') return;
    let mounted = true;
    AppleAuthentication.isAvailableAsync().then((available) => {
      if (mounted) setAppleAvailable(available);
    });
    return () => { mounted = false; };
  }, []);

  const columns = buildColumns(posterPaths, 3);

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  // Field-level checks, shown under the field rather than as an alert. Server
  // errors (wrong password, rate limit, captcha) still come as alerts.
  const checkEmail = () => {
    const bad = !isValidEmail(email);
    setEmailError(bad ? AUTH_PAGE.invalidEmail : null);
    return !bad;
  };
  const checkPassword = () => {
    const bad = password.length < MIN_PASSWORD_LENGTH;
    setPasswordError(bad ? AUTH_PAGE.weakPassword : null);
    return !bad;
  };

  const handleSignIn = async () => {
    const emailOk = checkEmail();
    if (!password) { setPasswordError(AUTH_PAGE.weakPassword); }
    if (!emailOk || !password) return;
    setPasswordError(null);
    setLoading(true);
    const captchaToken = await takeCaptchaToken('login');
    if (captchaToken === false) {
      setLoading(false);
      notify(AUTH_PAGE.verificationUnavailable);
      return;
    }
    const { error } = await authRequest(supabase.auth.signInWithPassword({
      email: email.trim(), password, options: { captchaToken: captchaToken ?? undefined },
    }));
    setLoading(false);
    refreshCaptcha();
    if (!error) track(EVENTS.USER_LOGGED_IN, { method: 'password' });
    if (error) {
      track(EVENTS.LOGIN_SUBMIT_FAILED, { reason: authErrorReason(error.message) });
      // An unconfirmed account goes to the inbox step, where the confirmation
      // can be resent and the code entered.
      if (error.message.includes('Email not confirmed')) {
        openInbox('signup');
      } else {
        notify(friendlyAuthError(error.message));
      }
    }
  };

  // Resend whatever the inbox step is waiting on. A token still goes to
  // GoTrue first. No token, or a captcha / SMTP failure, goes through
  // signup-bypass so the inbox actually gets a link.
  const handleResend = async () => {
    const e = email.trim();
    if (!e || !isValidEmail(e)) { setResendNote(AUTH_PAGE.invalidEmail); return; }
    setResendNote(null);
    const isCurrent = beginAttempt();
    const captchaRequired = Boolean(TURNSTILE_SITE_KEY);
    const taken = await takeCaptchaToken(inboxKind === 'signup' ? 'signup' : 'magic');
    if (!isCurrent()) return;
    const captchaToken = taken === false ? null : taken;
    const viaBypass = (error?: { message?: string, status?: number } | null) => (inboxKind === 'signup'
      ? shouldResendViaBypass({ captchaRequired, captchaToken, error })
      : shouldMagicLinkViaBypass({ captchaRequired, captchaToken, error }));
    if (!viaBypass()) {
      const { error } = inboxKind === 'signup'
        ? await authRequest(supabase.auth.resend({
            type: 'signup', email: e,
            options: { emailRedirectTo: AUTH_APP_CALLBACK, captchaToken: captchaToken ?? undefined },
          }))
        : await authRequest(supabase.auth.signInWithOtp({
            email: e,
            options: { shouldCreateUser: true, emailRedirectTo: AUTH_APP_CALLBACK, captchaToken: captchaToken ?? undefined },
          }));
      refreshCaptcha();
      if (!isCurrent()) return;
      if (!error || !viaBypass(error)) {
        if (!error) setInboxViaBypass(false);
        setResendNote(error ? friendlyAuthError(error.message) : AUTH_PAGE.inbox.resent);
        return;
      }
    }
    const sent = await bypassClient.sendLink({
      action: inboxKind === 'signup' ? 'resend' : 'magiclink',
      email: e,
      isCurrent,
    });
    if (!sent.ok && sent.superseded) return;
    if (sent.ok) setInboxViaBypass(true);
    setResendNote(sent.ok ? AUTH_PAGE.inbox.resent : sent.message);
  };

  // The code from the email. Its length is a per-project Supabase setting
  // (6 to 10 digits; Staging sends 8), so accept that whole range rather than
  // assume 6. GoTrue signup confirmations verify as
  // 'signup'; a magic-link code, and every signup-bypass code, verifies as
  // 'email'. Neither needs captcha.
  const handleVerifyCode = async () => {
    const token = code.replace(/\D/g, '');
    if (token.length < OTP_MIN_DIGITS || token.length > OTP_MAX_DIGITS) {
      setCodeError(AUTH_PAGE.inbox.invalidCode);
      return;
    }
    setCodeError(null);
    setLoading(true);
    const { data, error } = await authRequest(supabase.auth.verifyOtp({
      email: email.trim(), token, type: inboxKind === 'signup' && !inboxViaBypass ? 'signup' : 'email',
    }));
    setLoading(false);
    if (error || !data) {
      const message = error?.message ?? '';
      const expired = /expired/i.test(message);
      track(inboxKind === 'signup' ? EVENTS.SIGNUP_SUBMIT_FAILED : EVENTS.LOGIN_SUBMIT_FAILED, {
        method: 'email_code', reason: expired ? 'expired' : authErrorReason(message),
      });
      // A dropped connection is not a wrong code: telling them to retype it
      // would send them hunting for a typo that is not there.
      setCodeError(expired ? AUTH_PAGE.inbox.expiredCode
        : isConnectionFailure(message) ? AUTH_PAGE.connectionFailed
        : AUTH_PAGE.inbox.invalidCode);
      return;
    }
    // A token-backed signup already fired user_signed_up at submit. A bypass
    // signup fires it here, the same as when its link opens the app.
    const confirmedBypassSignup = await reportBypassSignupConfirmed(data.user);
    if (inboxKind === 'magic' && !confirmedBypassSignup) track(EVENTS.USER_LOGGED_IN, { method: 'magic_link' });
  };

  const handleForgot = async () => {
    if (!checkEmail()) return;
    setLoading(true);
    const captchaToken = await takeCaptchaToken('forgot');
    if (captchaToken === false) {
      setLoading(false);
      notify(AUTH_PAGE.verificationUnavailable);
      return;
    }
    const { error } = await authRequest(supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: AUTH_WEB_CALLBACK,
      captchaToken: captchaToken ?? undefined,
    }));
    setLoading(false);
    refreshCaptcha();
    if (error) notify(friendlyAuthError(error.message));
    else {
      track(EVENTS.PASSWORD_RESET_REQUESTED);
      notify('Check your email', 'We sent a link to reset your password.');
    }
  };

  const handleSignUp = async () => {
    noteSignupStarted();
    const emailOk = checkEmail();
    const passwordOk = checkPassword();
    if (!emailOk || !passwordOk) return;
    setLoading(true);
    track(EVENTS.SIGNUP_SUBMIT_CLICKED);
    const isCurrent = beginAttempt();
    const captchaToken = await takeCaptchaToken('signup');
    if (!isCurrent()) return;
    if (captchaToken === false) {
      // No Turnstile token after both attempts. signup-bypass creates the
      // account without one, as web does. GoTrue never sees an empty token.
      if (!captchaBlockedRef.current) {
        track(EVENTS.SIGNUP_CAPTCHA_BLOCKED, { attempt: 0, reason: 'timeout' });
      }
      track(EVENTS.SIGNUP_BYPASS_OFFERED);
      await signUpViaBypass(isCurrent);
      return;
    }
    const { error } = await authRequest(supabase.auth.signUp({
      email: email.trim(), password,
      // The confirmation link opens the app (see AUTH_APP_CALLBACK).
      options: { emailRedirectTo: AUTH_APP_CALLBACK, captchaToken: captchaToken ?? undefined },
    }));
    setLoading(false);
    refreshCaptcha();
    if (error) {
      track(EVENTS.SIGNUP_SUBMIT_FAILED, { reason: authErrorReason(error.message) });
      if (error.message.includes('User already registered')) setEmailError(AUTH_PAGE.accountAlreadyExists);
      else notify(friendlyAuthError(error.message));
    }
    else {
      // Web fires this on the same step (account created, confirmation pending);
      // mobile never did, so signup funnels were web-only.
      track(EVENTS.USER_SIGNED_UP, { method: 'password' });
      openInbox('signup');
    }
  };

  // signup-bypass checks the honeypot, form timing, and rate limits itself.
  // A native form has no hidden field for a bot to fill, so website is empty.
  const signUpViaBypass = async (isCurrent: () => boolean) => {
    const submittedEmail = email.trim();
    const result = await bypassClient.signUp({ email: submittedEmail, password, isCurrent });
    if (!result.ok && result.superseded) return;
    setLoading(false);
    refreshCaptcha();
    if (!result.ok) {
      track(EVENTS.SIGNUP_SUBMIT_FAILED, {
        reason: result.analyticsReason,
        ...(result.status ? { status: result.status } : {}),
      });
      if (result.reason === 'already_registered') setEmailError(result.message);
      else notify(result.message);
      return;
    }
    // created is false for the function's quiet { ok: true } (honeypot or a
    // too-fast post). That looks like success on purpose. user_signed_up
    // fires when the emailed link opens the app (lib/bypassSignupReport.ts).
    if (result.created) await rememberBypassSignup(submittedEmail);
    openInbox('signup', true);
  };

  // When Turnstile times out, or GoTrue's mailer fails the captcha / SMTP
  // check, signup-bypass sends the same link through Resend.
  const handleMagicLink = async () => {
    noteSignupStarted();
    if (!checkEmail()) return;
    setLoading(true);
    const isCurrent = beginAttempt();
    const submittedEmail = email.trim();
    const fromSignup = mode === 'signup';
    const captchaRequired = Boolean(TURNSTILE_SITE_KEY);
    const taken = await takeCaptchaToken('magic');
    if (!isCurrent()) return;
    const captchaToken = taken === false ? null : taken;
    let otpError: { message: string } | null = null;
    if (!shouldMagicLinkViaBypass({ captchaRequired, captchaToken })) {
      const { error } = await authRequest(supabase.auth.signInWithOtp({
        email: submittedEmail,
        options: { shouldCreateUser: true, emailRedirectTo: AUTH_APP_CALLBACK, captchaToken: captchaToken ?? undefined },
      }));
      refreshCaptcha();
      if (!isCurrent()) return;
      if (!error) {
        setLoading(false);
        openInbox('magic');
        return;
      }
      otpError = error;
      if (!shouldMagicLinkViaBypass({ captchaRequired, captchaToken, error })) {
        setLoading(false);
        track(EVENTS.LOGIN_SUBMIT_FAILED, { method: 'magic_link', reason: authErrorReason(error.message) });
        notify(friendlyAuthError(error.message));
        return;
      }
    }
    const sent = await bypassClient.sendLink({
      action: 'magiclink',
      email: submittedEmail,
      confirmSignup: fromSignup,
      isCurrent,
    });
    if (!sent.ok && sent.superseded) return;
    setLoading(false);
    refreshCaptcha();
    if (sent.ok) {
      if (fromSignup) await rememberBypassSignup(submittedEmail);
      openInbox('magic', true);
      return;
    }
    track(EVENTS.LOGIN_SUBMIT_FAILED, {
      method: 'magic_link',
      reason: otpError ? authErrorReason(otpError.message) : sent.reason,
    });
    notify(sent.message);
  };

  // Google through the system browser: Supabase builds the provider URL, the
  // auth session returns to plot://auth/callback with the tokens in the
  // fragment, and the session is set from those. Mirrors web's beginOAuth,
  // including the synchronous re-entry latch (a double tap used to leave two
  // /authorize calls behind there).
  //
  // The latch is a ref because googleLoading is state: a fast double tap can
  // pass a state check twice before React re-renders. It releases in finally,
  // so every path below must settle. The Supabase calls are time-limited for
  // that reason. The in-app browser is not: it is a system sheet with its own
  // Cancel / Close, and openAuthSessionAsync resolves when the person leaves
  // it (iOS reports cancel, Android reports dismiss when the app is active
  // again). While it is open a sign-in is genuinely under way, so releasing
  // the latch on a timer would allow the second start the latch prevents.
  const googleStartingRef = useRef(false);
  const handleGoogleSignIn = async () => {
    if (googleStartingRef.current) return;
    googleStartingRef.current = true;
    // Captured at tap time: failures report against the screen the person
    // started from, as web's beginOAuth does.
    const failedEvent = mode === 'signup' ? EVENTS.SIGNUP_SUBMIT_FAILED : EVENTS.LOGIN_SUBMIT_FAILED;
    noteSignupStarted();
    setGoogleLoading(true);
    try {
      // skipBrowserRedirect with the default implicit flow only builds the URL,
      // so a late answer after a timeout has nothing to undo.
      const { data, error } = await withAuthTimeout(supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: AUTH_APP_CALLBACK, skipBrowserRedirect: true },
      }));
      if (error) throw error;
      if (!data.url) throw new Error('Google sign-in returned no URL');
      const result = await WebBrowser.openAuthSessionAsync(data.url, AUTH_APP_CALLBACK);
      if (result.type !== 'success') return; // cancelled or dismissed
      const tokens = sessionFromRedirect(result.url);
      if (!tokens) throw new Error('Google sign-in returned no session');
      // setSession asks Supabase for the user, which can hang with no
      // connection. A late success still signs the person in.
      const { data: set, error: setError } = await withAuthTimeout(supabase.auth.setSession(tokens));
      if (setError) throw setError;
      const createdMs = set.user?.created_at ? Date.parse(set.user.created_at) : 0;
      const isNew = createdMs > 0 && Date.now() - createdMs < 60_000;
      track(isNew ? EVENTS.USER_SIGNED_UP : EVENTS.USER_LOGGED_IN, { method: 'google' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '';
      track(failedEvent, { method: 'google', reason: authErrorReason(message) });
      notify(isConnectionFailure(message) ? AUTH_PAGE.connectionFailed : AUTH_PAGE.googleSignInFailed);
    } finally {
      googleStartingRef.current = false;
      setGoogleLoading(false);
    }
  };

  // Same latch as Google, for the same reason. Apple's own sheet is not
  // time-limited (it has Cancel, which rejects with ERR_REQUEST_CANCELED);
  // the Supabase calls after it are.
  const appleStartingRef = useRef(false);
  const handleAppleSignIn = async () => {
    if (appleStartingRef.current) return;
    appleStartingRef.current = true;
    const failedEvent = mode === 'signup' ? EVENTS.SIGNUP_SUBMIT_FAILED : EVENTS.LOGIN_SUBMIT_FAILED;
    noteSignupStarted();
    setAppleLoading(true);

    try {
      // Supabase hashes the raw nonce before comparing it with Apple's token.
      // Apple therefore receives the SHA-256 value while Supabase receives raw.
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) throw new Error('Apple returned no identity token');

      const { data, error } = await withAuthTimeout(supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      }));
      if (error) throw error;

      // Apple only returns the name on the first authorization. Preserve it in
      // auth metadata immediately; later sign-ins return null for these fields.
      if (credential.fullName) {
        const fullName = AppleAuthentication.formatFullName(credential.fullName);
        // Sign-in already succeeded here, so a hang or a throw only loses the
        // name. It must not hold the button or report a failed sign-in.
        const metadataError = await withAuthTimeout(supabase.auth.updateUser({
          data: {
            full_name: fullName || undefined,
            given_name: credential.fullName.givenName || undefined,
            family_name: credential.fullName.familyName || undefined,
          },
        })).then(({ error: e }) => e, (e: unknown) => e);
        if (metadataError) console.warn('[apple auth] name metadata save failed', metadataError);
      }

      const createdMs = data.user?.created_at ? Date.parse(data.user.created_at) : 0;
      const isNew = createdMs > 0 && Date.now() - createdMs < 60_000;
      track(isNew ? EVENTS.USER_SIGNED_UP : EVENTS.USER_LOGGED_IN, { method: 'apple' });
    } catch (error: unknown) {
      const code = error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : '';
      if (code !== 'ERR_REQUEST_CANCELED') {
        const message = error instanceof Error ? error.message : '';
        track(failedEvent, { method: 'apple', reason: authErrorReason(message) });
        notify(isConnectionFailure(message) ? AUTH_PAGE.connectionFailed : AUTH_PAGE.appleSignInFailed);
      }
    } finally {
      appleStartingRef.current = false;
      setAppleLoading(false);
    }
  };

  // Off until the security check has a token. Turns on anyway once core says
  // the wait is over, so a check that never finishes cannot leave it grey.
  // Entering the emailed code needs no check, so the inbox step is never held.
  const captchaMode: CaptchaMode | null = mode === 'signin' ? 'login'
    : mode === 'inbox' ? null
    : mode;
  const captchaReady = !captchaMode || captchaSubmitEnabled({
    siteKey: TURNSTILE_SITE_KEY,
    started: captchaStarted,
    token: captchaHasToken ? 'ready' : null,
    errored: captchaErrored,
    interactive: captchaInteractive,
    mode: captchaMode,
    elapsedMs: captchaNow - captchaWaitStart,
  });
  const ctaDisabled = loading || !captchaReady;

  // Re-check the wait limit while the button is off. Stops as soon as it is on.
  useEffect(() => {
    if (captchaReady) return undefined;
    const id = setInterval(() => setCaptchaNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [captchaReady]);

  const handleSubmit = () => {
    if (mode === 'forgot') handleForgot();
    else if (mode === 'inbox') handleVerifyCode();
    else if (mode === 'signin') handleSignIn();
    else handleSignUp();
  };

  const submitLabel = mode === 'signin' ? AUTH_PAGE.submitLabel.login
    : mode === 'signup' ? AUTH_PAGE.submitLabel.signup
    : mode === 'inbox' ? AUTH_PAGE.inbox.confirm
    : AUTH_PAGE.submitLabel.forgot;
  const heading = mode === 'signin' ? AUTH_PAGE.heading.login
    : mode === 'signup' ? AUTH_PAGE.heading.signup
    : mode === 'inbox' ? AUTH_PAGE.inbox.title
    : AUTH_PAGE.heading.forgot;
  const subheading = mode === 'signin' ? AUTH_PAGE.subheading.login
    : mode === 'signup' ? AUTH_PAGE.subheading.signup
    : mode === 'inbox' ? null
    : AUTH_PAGE.subheading.forgot;
  const social = mode === 'signin' || mode === 'signup';

  return (
    <View style={styles.root} onTouchStart={startCaptcha}>
      {/* ── Scrolling poster mosaic ── */}
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.mosaic}>
          {/* Mounted only once posters exist: each column starts its loop on mount. */}
          {posterPaths.length > 0 && columns.map((col, ci) => (
            <View key={ci} style={{ width: POSTER_W, marginHorizontal: GAP / 2, overflow: 'hidden', flex: 1 }}>
              <ScrollingColumn
                paths={col}
                offset={ci === 1 ? -(POSTER_H + GAP) * 2 : 0}
                duration={[38000, 32000, 42000][ci]}
              />
            </View>
          ))}
        </View>

        {/* Dark vignette overlay */}
        <LinearGradient
          colors={['rgba(9,9,11,0.3)', 'rgba(9,9,11,0.55)', 'rgba(9,9,11,0.85)', INK]}
          locations={[0, 0.3, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ── Content ── */}
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Wordmark at top */}
        <View style={[styles.wordmarkWrap, { paddingTop: insets.top + spacing.xl }]}>
          <PlotWordmark size={52} color={PAPER} />
          <Text style={styles.tagline}>Your personal movie & TV companion</Text>
        </View>

        {/* Glass panel */}
        <View style={[styles.panelWrap, { paddingBottom: insets.bottom + spacing.xl }]}>
          <BlurView intensity={60} tint="light" style={styles.panel}>
            <LinearGradient
              colors={['rgba(255,255,255,0.50)', 'rgba(255,255,255,0.88)']}
              locations={[0, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.panelInner}
            >
              {/* Heading */}
              <Text style={styles.panelTitle} accessibilityRole="header">{heading}</Text>
              {subheading ? <Text style={styles.panelSub}>{subheading}</Text> : null}
              {mode === 'inbox' ? (
                <Text style={styles.panelSub}>
                  {inboxKind === 'signup' ? AUTH_PAGE.inbox.signupBefore : AUTH_PAGE.inbox.magicBefore}
                  <Text style={styles.panelSubStrong}>{email.trim()}</Text>
                  {AUTH_PAGE.inbox.after}
                </Text>
              ) : null}

              {social && (appleAvailable || SHOW_GOOGLE_LOGIN) ? (
                <>
                  {appleAvailable ? (
                    <View style={styles.appleButtonWrap} pointerEvents={appleLoading ? 'none' : 'auto'}>
                      <AppleAuthentication.AppleAuthenticationButton
                        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                        cornerRadius={radii.pill}
                        style={[styles.appleButton, appleLoading && styles.appleButtonLoading]}
                        onPress={handleAppleSignIn}
                      />
                    </View>
                  ) : null}
                  {SHOW_GOOGLE_LOGIN ? (
                    <TouchableOpacity
                      style={[styles.googleButton, googleLoading && styles.appleButtonLoading]}
                      onPress={handleGoogleSignIn}
                      disabled={googleLoading}
                      accessibilityRole="button"
                      accessibilityState={{ busy: googleLoading }}
                      activeOpacity={0.85}
                    >
                      {googleLoading ? <ActivityIndicator color={INK} /> : (
                        <>
                          <GoogleIcon />
                          <Text style={styles.googleText}>{AUTH_PAGE.continueWithGoogle}</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : null}
                  <View style={styles.socialDivider}>
                    <View style={styles.socialDividerLine} />
                    <Text style={styles.socialDividerText}>{AUTH_PAGE.socialDivider}</Text>
                    <View style={styles.socialDividerLine} />
                  </View>
                </>
              ) : null}

              {/* Fields */}
              <View style={styles.fields}>
                {mode === 'inbox' ? (
                  <View style={styles.inputWrap}>
                    <Text style={styles.inputLabel}>{AUTH_PAGE.inbox.codeLabel}</Text>
                    <TextInput
                      style={[styles.input, styles.codeInput, codeError ? styles.inputInvalid : null]}
                      placeholder={AUTH_PAGE.inbox.codePlaceholder}
                      placeholderTextColor={PLACEHOLDER}
                      value={code}
                      onChangeText={(t) => { setCode(t.replace(/\D/g, '').slice(0, OTP_MAX_DIGITS)); setCodeError(null); }}
                      keyboardType="number-pad"
                      // iOS offers the code from Mail above the keyboard.
                      textContentType="oneTimeCode"
                      autoComplete="one-time-code"
                      maxLength={OTP_MAX_DIGITS}
                      returnKeyType="go"
                      onSubmitEditing={handleSubmit}
                      accessibilityLabel={AUTH_PAGE.inbox.codeLabel}
                    />
                    {codeError ? <Text style={styles.fieldError} accessibilityLiveRegion="polite">{codeError}</Text> : null}
                  </View>
                ) : (
                  <View style={styles.inputWrap}>
                    <Text style={styles.inputLabel}>{AUTH_PAGE.emailLabel}</Text>
                    <TextInput
                      style={[styles.input, emailError ? styles.inputInvalid : null]}
                      placeholder="your@email.com"
                      placeholderTextColor={PLACEHOLDER}
                      value={email}
                      onChangeText={(t) => { setEmail(t); setEmailError(null); noteSignupStarted(); }}
                      onBlur={() => { if (email) checkEmail(); }}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoComplete="email"
                      returnKeyType="next"
                      onSubmitEditing={undefined}
                      accessibilityLabel={AUTH_PAGE.emailLabel}
                    />
                    {emailError ? <Text style={styles.fieldError} accessibilityLiveRegion="polite">{emailError}</Text> : null}
                  </View>
                )}

                {social && (
                  <View style={styles.inputWrap}>
                    <Text style={styles.inputLabel}>{AUTH_PAGE.passwordLabel}</Text>
                    <TextInput
                      style={[styles.input, passwordError ? styles.inputInvalid : null]}
                      placeholder={mode === 'signup' ? AUTH_PAGE.passwordPlaceholder.signup : AUTH_PAGE.passwordPlaceholder.login}
                      placeholderTextColor={PLACEHOLDER}
                      value={password}
                      onChangeText={(t) => { setPassword(t); setPasswordError(null); noteSignupStarted(); }}
                      onBlur={() => { if (mode === 'signup' && password) checkPassword(); }}
                      secureTextEntry
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      returnKeyType="go"
                      onSubmitEditing={handleSubmit}
                      accessibilityLabel={AUTH_PAGE.passwordLabel}
                    />
                    {passwordError ? <Text style={styles.fieldError} accessibilityLiveRegion="polite">{passwordError}</Text> : null}
                    {mode === 'signin' && (
                      <TouchableOpacity onPress={() => switchMode('forgot')} style={styles.forgotUnder} accessibilityRole="button">
                        <Text style={styles.forgotText}>{AUTH_PAGE.forgotPassword}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>

              {/* CTA — solid ink, like the web .auth-cta. Turnstile takes no space
                  and ignores touches by default (see its own pointerEvents) — if
                  Cloudflare ever decides this sign-in needs a real interactive
                  check, it pops up over the fields above instead of permanently
                  reserving a gap for something that's normally invisible. */}
              <View style={styles.ctaWrap}>
                {TURNSTILE_SITE_KEY ? (
                  <View style={styles.captcha}>
                    <Turnstile
                      siteKey={TURNSTILE_SITE_KEY}
                      onToken={handleCaptchaToken}
                      onError={handleCaptchaError}
                      onInteractive={handleCaptchaInteractive}
                      resetSignal={captchaNonce}
                      executeSignal={captchaExecute}
                      start={captchaStarted}
                    />
                  </View>
                ) : null}
                <TouchableOpacity
                  style={[styles.cta, ctaDisabled && { opacity: 0.6 }]}
                  onPress={handleSubmit}
                  disabled={ctaDisabled}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: ctaDisabled, busy: loading }}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.ctaText}>{submitLabel}</Text>}
                </TouchableOpacity>
                {!captchaReady && !loading ? (
                  <Text style={styles.captchaStatus} accessibilityLiveRegion="polite">
                    {captchaInteractive ? AUTH_PAGE.verificationTapBox : AUTH_PAGE.verificationChecking}
                  </Text>
                ) : null}
              </View>

              {/* Mode switcher — show only the opposite mode, like web .auth-toggle */}
              {mode === 'forgot' ? (
                <View style={styles.modeRow}>
                  <TouchableOpacity onPress={() => switchMode('signin')} accessibilityRole="button">
                    <Text style={styles.modeLink}>{AUTH_PAGE.backToSignIn}</Text>
                  </TouchableOpacity>
                </View>
              ) : mode === 'inbox' ? (
                <>
                  <View style={styles.modeRow}>
                    <Text style={styles.modePrompt}>{AUTH_PAGE.resendPrompt} </Text>
                    <TouchableOpacity onPress={handleResend} accessibilityRole="button">
                      <Text style={styles.modeLink}>{AUTH_PAGE.resendState.idle}</Text>
                    </TouchableOpacity>
                  </View>
                  {resendNote ? <Text style={styles.resendNote} accessibilityLiveRegion="polite">{resendNote}</Text> : null}
                  <TouchableOpacity
                    onPress={() => switchMode(inboxKind === 'signup' ? 'signup' : 'signin')}
                    style={styles.magicLinkBtn}
                    accessibilityRole="button"
                  >
                    <Text style={styles.magicLinkText}>{AUTH_PAGE.inbox.differentEmail}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={styles.modeRow}>
                    <Text style={styles.modePrompt}>
                      {mode === 'signin' ? AUTH_PAGE.noAccountYet : AUTH_PAGE.alreadyHaveAccount}{' '}
                    </Text>
                    <TouchableOpacity onPress={() => switchMode(mode === 'signin' ? 'signup' : 'signin')} accessibilityRole="button">
                      <Text style={styles.modeLink}>{mode === 'signin' ? AUTH_PAGE.signUp : AUTH_PAGE.signIn}</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Magic link */}
                  <TouchableOpacity
                    onPress={handleMagicLink}
                    style={[styles.magicLinkBtn, ctaDisabled && { opacity: 0.5 }]}
                    disabled={ctaDisabled}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: ctaDisabled }}
                  >
                    <Text style={styles.magicLinkText}>{AUTH_PAGE.magicLinkInstead}</Text>
                  </TouchableOpacity>
                </>
              )}
            </LinearGradient>
          </BlurView>
        </View>
      </KeyboardAvoidingView>
      {dialog}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: INK,
  },
  mosaic: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: GAP / 2,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  kav: {
    flex: 1,
    justifyContent: 'space-between',
  },
  wordmarkWrap: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  tagline: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    color: 'rgba(250,250,250,0.5)',
    marginTop: 4,
    letterSpacing: 0.3,
  },
  panelWrap: {
    paddingHorizontal: spacing.lg,
  },
  panel: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  panelInner: {
    padding: spacing.xl,
    borderRadius: 28,
    overflow: 'hidden',
  },
  panelTitle: {
    // Editorial display headline, matching web .auth-header h1 (var(--font-display)).
    fontFamily: fontFamily.display,
    fontSize: fontSize.xxl,
    color: INK,
    marginBottom: 4,
    textAlign: 'center',
  },
  panelSub: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    color: MUTED,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  panelSubStrong: {
    fontFamily: fontFamily.sansMedium,
    color: INK,
  },
  fields: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  appleButtonWrap: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  appleButton: {
    width: '100%',
    height: 48,
  },
  appleButtonLoading: {
    opacity: 0.7,
  },
  // Same pill as the Apple button, outlined: the web .auth-social-btn.
  googleButton: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    backgroundColor: 'rgba(255,255,255,0.7)',
    marginBottom: spacing.md,
  },
  googleText: {
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.md,
    color: INK,
  },
  socialDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  socialDividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderStrong,
  },
  socialDividerText: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  inputWrap: {
    gap: 6,
  },
  inputLabel: {
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.xs,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  forgotUnder: { alignSelf: 'flex-end', marginTop: 2 },
  forgotText: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    color: MUTED,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
    borderRadius: radii.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.md,
    color: INK,
  },
  inputInvalid: {
    borderColor: colors.danger,
  },
  fieldError: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    color: colors.danger,
  },
  codeInput: {
    fontFamily: fontFamily.sansTabular,
    fontSize: fontSize.xl,
    letterSpacing: 6,
    textAlign: 'center',
  },
  resendNote: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    color: MUTED,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  ctaWrap: {
    marginBottom: spacing.lg,
  },
  captcha: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    marginBottom: spacing.xs,
    alignItems: 'center',
  },
  cta: {
    backgroundColor: INK,
    borderRadius: radii.pill,
    paddingVertical: 15,
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.md,
    color: '#fff',
    letterSpacing: 0.2,
  },
  captchaStatus: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    color: MUTED,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modePrompt: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    color: MUTED,
  },
  modeLink: {
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.sm,
    color: INK,
  },
  magicLinkBtn: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  magicLinkText: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    color: QUIET,
  },
});
