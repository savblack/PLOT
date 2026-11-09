import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './AuthPage.css';
import { track, identifyUser, EVENTS } from '../lib/analytics.js';
import { getAuthCallbackUrl } from '../utils/redirects.js';
import { takeReturnPath } from '../utils/authReturn.js';
import { SHOW_GOOGLE_LOGIN, SHOW_APPLE_LOGIN } from '../launchFeatures.js';
import { HERO_POSTERS } from '../constants/heroPosters.js';
import PlotLoader from '@plot/ui/PlotLoader.jsx';
import Turnstile from '../components/Turnstile.jsx';
import { getPremiumCheckoutIntent, rememberPremiumCheckoutIntent } from '../utils/premiumCheckoutIntent.js';
import { COMMON } from '../copy/common.js';
import { AUTH_PAGE, captchaFailureCopy } from '../copy/authPage.js';
import { authErrorReason } from '@plot/core/authErrors.js';
import { AUTH_REQUEST_TIMEOUT_MS, AUTH_TIMEOUT_MESSAGE, withAuthTimeout } from '@plot/core/authTimeout.js';
import { captchaSubmitPlan, CAPTCHA_SUBMIT_ATTEMPTS, CAPTCHA_TOKEN_WAIT_MS, shouldResetCaptcha } from '@plot/core/captchaGate.js';
import { advanceAuthEpoch, authAttemptIsCurrent } from '../utils/authAttempt.js';
import { createSignupBypassClient } from '@plot/core/signupBypassClient.js';
import { markSignupReferralPending } from '../utils/attribution.js';
import { loadSupabase } from '../utils/loadSupabase.js';
import PlotLogo from '../components/PlotLogo.jsx';
import { loginNeedsConfirmation, shouldMagicLinkViaBypass, shouldResendViaBypass } from '../utils/authBypass.js';
import { rememberPendingBypassSignup, rememberSignupTracked } from '../utils/authCallbackReport.js';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

function friendlyError(msg) {
  if (!msg) return COMMON.genericError;
  if (msg.includes('Invalid login credentials'))    return AUTH_PAGE.incorrectCredentials;
  if (msg.includes('Email not confirmed'))          return AUTH_PAGE.activationEmailWaiting;
  if (msg.includes('User already registered'))      return AUTH_PAGE.accountAlreadyExists;
  if (msg.includes('Password should be at least'))  return AUTH_PAGE.weakPassword;
  // Empty password reaching GoTrue — same user-facing fix as a short password.
  if (msg.includes('Signup requires a valid password')) return AUTH_PAGE.weakPassword;
  if (msg.includes('Anonymous sign-ins are disabled'))  return AUTH_PAGE.weakPassword;
  if (msg.includes('Unable to validate email'))     return AUTH_PAGE.invalidEmail;
  if (msg.includes('rate limit') || msg.includes('too many')) return AUTH_PAGE.rateLimited;
  // A timeout or a request that never reached Supabase. The raw text
  // ("failed to fetch") told people nothing about what to do.
  const reason = authErrorReason(msg);
  if (reason === 'timeout' || reason === 'network') return AUTH_PAGE.connectionFailed;
  return msg;
}

/**
 * Run a Supabase Auth request under the shared time limit and always come back
 * as `{ data, error }`, so a hang or a thrown network error takes the caller's
 * existing error path instead of leaving the button spinning.
 *
 * @template T
 * @param {Promise<{ data: T, error: { message: string } | null }>} request
 */
async function authRequest(request) {
  try {
    return await withAuthTimeout(request);
  } catch (e) {
    return { data: null, error: { message: e?.message || AUTH_TIMEOUT_MESSAGE } };
  }
}

/**
 * Read email/password from the live DOM, not React state.
 *
 * Password managers (and some mobile browsers) fill inputs without firing
 * `onChange`, so controlled state can still be '' while the field looks filled.
 * The form also uses `noValidate`, so HTML5 `required`/`minLength` never catch
 * that. Reading `.value` at submit time is what actually gets sent to Supabase.
 *
 * @param {HTMLFormElement | null} form
 * @returns {{ email: string, password: string }}
 */
function readAuthFormFields(form) {
  const emailEl = form?.querySelector('#auth-email');
  const passwordEl = form?.querySelector('#auth-password');
  return {
    email: (emailEl instanceof HTMLInputElement ? emailEl.value : '').trim(),
    password: passwordEl instanceof HTMLInputElement ? passwordEl.value : '',
  };
}

// Short, stable slugs for signup_submit_failed — group failures in PostHog
// without leaking the raw (occasionally wordy) Supabase error message.
// Stable analytics slugs live in core so web and mobile group failures the
// same way — see @plot/core/authErrors.js.
const errorReason = authErrorReason;

function browserStore() {
  return {
    get: (key) => {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    set: (key, value) => {
      try { localStorage.setItem(key, value); } catch { /* private mode */ }
    },
    remove: (key) => {
      try { localStorage.removeItem(key); } catch { /* private mode */ }
    },
  };
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.583-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.705a5.41 5.41 0 0 1-.282-1.705c0-.593.102-1.17.282-1.705V4.963H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.037l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.963L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" fill="currentColor">
      <path d="M13.03 9.56c-.02-1.86 1.52-2.75 1.59-2.79-.87-1.27-2.22-1.44-2.7-1.46-1.15-.12-2.24.68-2.83.68-.58 0-1.48-.66-2.43-.64-1.25.02-2.4.73-3.04 1.85-1.3 2.25-.33 5.58.93 7.41.62.9 1.36 1.9 2.32 1.86.93-.04 1.29-.6 2.41-.6 1.13 0 1.45.6 2.43.58 1.0-.02 1.64-.91 2.25-1.81.71-1.04 1.0-2.05 1.02-2.1-.02-.01-1.95-.75-1.97-2.97zM11.2 4.03c.51-.62.86-1.48.76-2.34-.74.03-1.63.49-2.16 1.11-.47.55-.89 1.43-.78 2.27.82.06 1.67-.42 2.18-1.04z"/>
    </svg>
  );
}

export default function AuthPage({ initialMode = 'signup' }) {
  const [mode, setMode]               = useState(initialMode);
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [success, setSuccess]         = useState(false);
  const [magicSent, setMagicSent]     = useState(false);
  const [resendStatus, setResendStatus] = useState(null); // null | 'sending' | 'sent' | 'error'
  const [captchaNonce, setCaptchaNonce] = useState(0); // bump to drop a used Turnstile token
  const [captchaExecute, setCaptchaExecute] = useState(0); // bump to run the challenge
  // Kept in a ref so a submit handler can see a token that arrived during
  // the short wait, without waiting for another render.
  const captchaTokenRef = useRef(null);
  const captchaBlockedRef = useRef(false);
  // Set when the widget itself errors during the current attempt. A timeout
  // leaves this false so the next wait does not call turnstile.reset().
  const captchaErroredRef = useRef(false);
  const [formStarted, setFormStarted] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot — real users never see or fill this
  // Form token, minimum form age, and the POSTs to signup-bypass. Shared
  // with mobile (see @plot/core/signupBypassClient.js).
  const [bypassClient] = useState(() => createSignupBypassClient({ getSupabase: loadSupabase }));
  // Password submit, magic link, OAuth, and mode switches all advance this.
  // An attempt that loses the epoch must not keep going after an await.
  const authEpochRef = useRef(0);
  // Latched while an OAuth handoff is under way: the browser is leaving, and a
  // second /authorize seconds later would do real damage (see beginOAuth). It
  // releases on a failure, after AUTH_REQUEST_TIMEOUT_MS if the page never
  // left, or when Back restores this page from the bfcache.
  const oauthStartingRef = useRef(false);
  // Fires if the page is still here long after an OAuth handoff said it was
  // leaving (see beginOAuth). Cleared when the page actually goes.
  const oauthStallTimerRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Fires once per visit, the first time someone actually starts signup.
  // Keystrokes cover the email form. Google, Apple, magic link, and a
  // submit that autofill never reported as a change used to skip it.
  const markFormStarted = () => {
    if (mode === 'signup' && !formStarted) {
      setFormStarted(true);
      track(EVENTS.SIGNUP_FORM_STARTED);
    }
  };

  // Only offered when Turnstile has genuinely, repeatedly failed in this
  // browser (see Turnstile.jsx's onPersistentlyBlocked) — the normal signup
  // path is untouched for everyone else.
  const handleCaptchaToken = (token) => {
    captchaTokenRef.current = token;
  };

  const handleCaptchaPersistentlyBlocked = (blocked) => {
    captchaBlockedRef.current = blocked;
  };

  // One attempt. A widget error ends the wait early so the retry can run.
  // A timeout does not: the challenge may still be in flight.
  const waitForCaptchaAttempt = (ms) => {
    const blockedAtStart = captchaBlockedRef.current;
    if (captchaTokenRef.current) return Promise.resolve(captchaTokenRef.current);
    return new Promise((resolve) => {
      const started = Date.now();
      const id = setInterval(() => {
        const token = captchaTokenRef.current;
        const failedNow = captchaErroredRef.current || (captchaBlockedRef.current && !blockedAtStart);
        if (token || failedNow || Date.now() - started >= ms) {
          clearInterval(id);
          resolve(token);
        }
      }, 50);
    });
  };

  const requestCaptcha = () => {
    captchaTokenRef.current = null;
    setCaptchaExecute((n) => n + 1);
  };

  const beginAuthAttempt = () => {
    authEpochRef.current = advanceAuthEpoch(authEpochRef.current);
    return authEpochRef.current;
  };

  const attemptIsCurrent = (epoch) => authAttemptIsCurrent(epoch, authEpochRef.current);

  const resolveCaptchaPlan = async (authMode) => {
    if (!TURNSTILE_SITE_KEY) {
      return captchaSubmitPlan({ siteKey: TURNSTILE_SITE_KEY, token: null, mode: authMode });
    }
    // A challenge may finish after the previous submit stopped waiting.
    if (captchaTokenRef.current) return 'ready';
    let plan = 'wait';
    let widgetErrored = false;
    for (let attempt = 1; attempt <= CAPTCHA_SUBMIT_ATTEMPTS; attempt += 1) {
      // Reset only after a widget error. A timeout means someone may still
      // be solving the challenge, and reset() throws that away.
      if (shouldResetCaptcha({ attempt, widgetErrored })) requestCaptcha();
      captchaErroredRef.current = false;
      const token = await waitForCaptchaAttempt(CAPTCHA_TOKEN_WAIT_MS);
      widgetErrored = captchaErroredRef.current;
      plan = captchaSubmitPlan({
        siteKey: TURNSTILE_SITE_KEY,
        token,
        mode: authMode,
        blocked: captchaBlockedRef.current,
        waited: !token,
      });
      if (plan === 'ready') return plan;
    }
    return plan;
  };

  // A pricing visitor must not lose their selected billing period while they
  // create an account, confirm their email, and complete onboarding.
  useEffect(() => {
    rememberPremiumCheckoutIntent(location.search);
  }, [location.search]);

  // Turnstile tokens are single-use; clear and re-issue after every auth attempt.
  const resetCaptcha = () => {
    captchaTokenRef.current = null;
    setCaptchaNonce((n) => n + 1);
  };

  // Auto-redirect if already logged in
  const [hasSession, setHasSession] = useState(null); // null = still checking
  useEffect(() => {
    loadSupabase().then((supabase) => supabase.auth.getSession()).then(({ data: { session } }) => {
      if (session) {
        const plan = getPremiumCheckoutIntent();
        navigate(plan ? `/pricing?billing=${plan}` : takeReturnPath('/app'), { replace: true });
      } else {
        setHasSession(false);
      }
    });
  }, [navigate]);

  // Localizes drop-off between the marketing-site signup_click and
  // user_signed_up: without this, PostHog can't tell "never reached the
  // in-app form" from "reached it but didn't finish." Gated on hasSession
  // === false so an already-logged-in visitor auto-redirecting away doesn't
  // count as having viewed the form.
  useEffect(() => {
    if (mode === 'signup' && hasSession === false) {
      track(EVENTS.SIGNUP_FORM_VIEWED);
      // Fetched unconditionally (not just once Turnstile fails) so the token's
      // age reflects real time-on-page even if bypass turns out to be needed
      // later. No side effects server-side. Safe to call every visit.
      bypassClient.loadFormToken();
    }
  }, [mode, hasSession, bypassClient]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (mode === 'signup') markFormStarted();

    // Prefer the live input values over React state. Password managers often
    // fill the DOM without firing onChange; with `noValidate` on the form,
    // that used to ship an empty password to GoTrue and show up in PostHog as
    // signup_submit_failed reason=unknown ("Signup requires a valid password"
    // / "Anonymous sign-ins are disabled").
    const fields = readAuthFormFields(e.currentTarget);
    const submittedEmail = fields.email;
    const submittedPassword = fields.password;
    setEmail(submittedEmail);
    setPassword(submittedPassword);
    // Captured now. A mode switch during the captcha wait must not change
    // which request this handler sends, and must not let it finish.
    const submittedMode = mode;

    if (!submittedEmail) {
      setError(AUTH_PAGE.invalidEmail);
      return;
    }
    if (submittedMode !== 'forgot') {
      if (!submittedPassword || (submittedMode === 'signup' && submittedPassword.length < 6)) {
        setError(AUTH_PAGE.weakPassword);
        return;
      }
    }

    const epoch = beginAuthAttempt();
    setLoading(true);
    // Before the Turnstile wait. Closing the tab during those seconds used
    // to drop the click, so the funnel could not tell a wait from a bounce.
    if (submittedMode === 'signup') track(EVENTS.SIGNUP_SUBMIT_CLICKED);
    const plan = await resolveCaptchaPlan(submittedMode);
    if (!attemptIsCurrent(epoch)) return;
    if (plan === 'unavailable') {
      setError(AUTH_PAGE.verificationUnavailable);
      setLoading(false);
      return;
    }
    const supabase = await loadSupabase();
    if (!attemptIsCurrent(epoch)) return;
    const tokenForRequest = captchaTokenRef.current;

    if (submittedMode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(submittedEmail, {
        redirectTo: getAuthCallbackUrl(),
        captchaToken: tokenForRequest,
      });
      if (!attemptIsCurrent(epoch)) return;
      if (error) { setError(friendlyError(error.message)); setLoading(false); resetCaptcha(); }
      else {
        track(EVENTS.PASSWORD_RESET_REQUESTED);
        setSuccess(true);
      }
      return;
    }

    if (submittedMode === 'login') {
      const { data, error } = await authRequest(supabase.auth.signInWithPassword({
        email: submittedEmail,
        password: submittedPassword,
        options: { captchaToken: tokenForRequest },
      }));
      if (!attemptIsCurrent(epoch)) return;
      if (error) {
        // Sign-in failures are their own funnel — deliberately not folded into
        // signup_submit_failed, which would inflate every signup-attempt metric.
        track(EVENTS.LOGIN_SUBMIT_FAILED, { reason: errorReason(error.message) });
        setLoading(false);
        resetCaptcha();
        // An unconfirmed bypass account that hits Back to sign in used to
        // stop on the warning, with no way to send the email again.
        if (loginNeedsConfirmation(error.message)) {
          setError(null);
          setResendStatus(null);
          setMode('signup');
          setSuccess(true);
        } else {
          setError(friendlyError(error.message));
        }
      } else {
        identifyUser(data.user.id);
        track(EVENTS.USER_LOGGED_IN);
        const plan = getPremiumCheckoutIntent();
        navigate(plan ? `/pricing?billing=${plan}` : takeReturnPath('/app'));
      }
    } else {
      // No Turnstile token. signup-bypass creates the account without one.
      // A healthy widget still takes the signUp() call below: a token
      // resolves the plan to 'ready' before we get here.
      if (plan === 'bypass') {
        if (!captchaBlockedRef.current) {
          track(EVENTS.SIGNUP_CAPTCHA_BLOCKED, { attempt: 0, reason: 'timeout' });
          setError(AUTH_PAGE.verificationFailedSignup);
        }
        track(EVENTS.SIGNUP_BYPASS_OFFERED);
        await submitViaBypass(submittedEmail, submittedPassword, epoch);
        return;
      }

      // Time-limited: on 2026-10-31 this request hung for about 90 seconds
      // before the browser gave up with "failed to fetch".
      const { data, error } = await authRequest(supabase.auth.signUp({
        email: submittedEmail,
        password: submittedPassword,
        options: { emailRedirectTo: getAuthCallbackUrl(), captchaToken: tokenForRequest },
      }));
      if (!attemptIsCurrent(epoch)) return;
      if (error) {
        setError(friendlyError(error.message));
        setLoading(false);
        resetCaptcha();
        track(EVENTS.SIGNUP_SUBMIT_FAILED, { reason: errorReason(error.message) });
      }
      else {
        // Identify on signup (not just login) so the anonymous pre-signup
        // session — carrying first-touch attribution — stitches to this user.
        identifyUser(data.user?.id);
        track(EVENTS.USER_SIGNED_UP, { method: 'email' });
        // The confirmation click must not count this person a second time.
        if (data.user?.id) rememberSignupTracked(data.user.id, browserStore());
        // Supabase returns an obfuscated user with no identities when the email
        // already exists. Only a genuinely new account may authorize the
        // referral follow mutation after signup.
        if (data.user?.identities?.length) markSignupReferralPending(data.user.email || submittedEmail);
        // Confirm email is off, so signUp returns a live session immediately —
        // let them straight into the app instead of gating on the inbox click.
        // Users still get the confirmation email and can verify any time from
        // Settings. If a session ever isn't present (e.g. confirmation gets
        // re-enabled later), fall back to the "check your inbox" screen.
        if (data.session) {
          const plan = getPremiumCheckoutIntent();
          navigate(plan ? `/pricing?billing=${plan}` : '/onboarding');
        } else {
          setSuccess(true);
        }
      }
    }
  };

  // Fallback signup path for browsers where Turnstile has persistently
  // failed: the Edge Function does its own bot mitigation (honeypot, submit
  // timing, per-IP rate limit) and creates the account via the Admin API,
  // bypassing the need for a Turnstile token. On success it hands back a
  // confirmation link delivered only to the supplied mailbox.
  const submitViaBypass = async (submittedEmail, submittedPassword, epoch) => {
    const result = await bypassClient.signUp({
      email: submittedEmail,
      password: submittedPassword,
      website,
      isCurrent: () => attemptIsCurrent(epoch),
    });
    if (!result.ok && result.superseded) return;
    if (!result.ok) {
      setError(result.message);
      setLoading(false);
      track(EVENTS.SIGNUP_SUBMIT_FAILED, {
        reason: result.analyticsReason,
        ...(result.status ? { status: result.status } : {}),
      });
      return;
    }
    if (!result.created) {
      // Honeypot, or a submit that arrived sooner than the server minimum.
      // signup-bypass answers { ok: true } and creates nothing, so those
      // cases look like success on purpose. An expired form token used to
      // land here too. The client refreshes before that 15-minute cap,
      // and a failed refresh does not post the old token.
      setLoading(false);
      setSuccess(true);
      return;
    }
    // The account is unconfirmed. user_signed_up fires on /auth/callback,
    // when the confirmation link is opened, including a different tab.
    markSignupReferralPending(submittedEmail);
    rememberPendingBypassSignup(submittedEmail, browserStore());
    try { sessionStorage.setItem('plot_auth_method', 'email'); } catch { /* ignore */ }
    setLoading(false);
    setSuccess(true);
  };

  // Resend and magic link share this. The function rate-limits and sends
  // through Resend. A fake { ok: true } (honeypot, or a submit that was too
  // fast) is still success on purpose.
  const sendBypassAuthLink = (action, submittedEmail, epoch, { confirmSignup = false } = {}) => (
    bypassClient.sendLink({
      action,
      email: submittedEmail,
      website,
      confirmSignup,
      isCurrent: () => attemptIsCurrent(epoch),
    })
  );

  // OAuth: hand off to the provider. We can't fire the signup/login event here
  // (the page redirects away), so we stash the method in sessionStorage and let
  // AuthCallbackPage report it once the session comes back (see reportAuth there).
  const beginOAuth = async (provider) => {
    // Re-entry guard. The button's `disabled={loading}` was doing nothing here,
    // because this was the one auth path that never set `loading` — and even with
    // it set, setLoading is async, so a fast double-tap can clear the check twice
    // before React re-renders. A ref is the only thing that latches synchronously.
    //
    // This matters more than a duplicate request: under PKCE every
    // signInWithOAuth call overwrites the code_verifier in localStorage while
    // leaving its own /authorize behind, so if the browser ends up following an
    // earlier redirect than the last verifier written, the code exchange fails
    // against a verifier that no longer matches. The user lands on /auth/callback
    // with a confirmed account, no session, and no way forward. That is the
    // 2026-08-07 signup, and auth.flow_state still shows bursts of up to eight
    // /authorize calls inside four seconds from a single tap-happy device.
    if (oauthStartingRef.current) return;
    oauthStartingRef.current = true;
    const authMode = mode;
    if (authMode === 'signup') markFormStarted();
    // Cancels a password submit that is still inside the captcha wait.
    const epoch = beginAuthAttempt();
    setLoading(true);
    setError(null);
    try { sessionStorage.setItem('plot_auth_method', provider); } catch { /* ignore */ }

    // Every failure path means we never navigated away, so undo everything the
    // handoff set up — including the guard, or they could never retry.
    const abandon = (err, { stalled = false } = {}) => {
      clearTimeout(oauthStallTimerRef.current);
      oauthStallTimerRef.current = null;
      setError(friendlyError(err?.message));
      setLoading(false);
      oauthStartingRef.current = false;
      // A stalled navigation may still finish. Keep the method so the callback
      // can report it; a retry writes it again anyway.
      if (!stalled) {
        try { sessionStorage.removeItem('plot_auth_method'); } catch { /* ignore */ }
      }
      // These failures used to leave no trace: two recordings in November 2026
      // show a Google tap that did nothing, and PostHog had no event for either.
      track(authMode === 'signup' ? EVENTS.SIGNUP_SUBMIT_FAILED : EVENTS.LOGIN_SUBMIT_FAILED, {
        reason: errorReason(err?.message),
        method: provider,
      });
    };

    try {
      const { error } = await withAuthTimeout((async () => {
        const supabase = await loadSupabase();
        return supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: getAuthCallbackUrl() },
        });
      })());
      if (error) { abandon(error); return; }
      // No error means the browser was told to leave for the provider. If the
      // provider never loads (Supabase unreachable from this network), the
      // page just sits here, so stop waiting after the same limit. A later tap
      // replaces the stalled navigation and writes a fresh verifier, so it
      // cannot cause the PKCE mismatch the guard above exists to prevent;
      // that came from taps seconds apart, not a retry after this long.
      oauthStallTimerRef.current = setTimeout(() => {
        oauthStallTimerRef.current = null;
        // Another attempt took over (an email submit, say). Release the guard
        // quietly so this button works again, without overwriting that
        // attempt's state.
        if (!attemptIsCurrent(epoch)) { oauthStartingRef.current = false; return; }
        abandon(new Error(AUTH_TIMEOUT_MESSAGE), { stalled: true });
      }, AUTH_REQUEST_TIMEOUT_MS);
    } catch (e) {
      // A throw (offline, client misconfigured) or a timeout would otherwise
      // leave the guard latched and every auth button dead until a reload.
      abandon(e);
    }
  };

  // The page is leaving for the provider: the stall timer must not fire if
  // the browser keeps this page and later restores it. Coming back with Back
  // (a bfcache restore) means the handoff is over, so unlock the buttons
  // instead of leaving them latched from the earlier tap.
  useEffect(() => {
    const onPageHide = () => {
      clearTimeout(oauthStallTimerRef.current);
      oauthStallTimerRef.current = null;
    };
    const onPageShow = (e) => {
      if (!e.persisted || !oauthStartingRef.current) return;
      oauthStartingRef.current = false;
      setLoading(false);
      try { sessionStorage.removeItem('plot_auth_method'); } catch { /* ignore */ }
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      clearTimeout(oauthStallTimerRef.current);
    };
  }, []);

  // Passwordless: email a one-time sign-in link. Works for new and returning
  // users alike; the callback completes auth and reports the method.
  // When Turnstile times out, or GoTrue's mailer fails the captcha / SMTP
  // check, signup-bypass sends the same link through Resend.
  const sendMagicLink = async () => {
    if (mode === 'signup') markFormStarted();
    // Same autofill caveat as handleSubmit — read the live email field.
    const emailEl = document.getElementById('auth-email');
    const submittedEmail = (
      emailEl instanceof HTMLInputElement ? emailEl.value : email
    ).trim();
    setEmail(submittedEmail);
    if (!submittedEmail) { setError('Enter your email address first, then request a link.'); return; }
    const epoch = beginAuthAttempt();
    setLoading(true);
    setError(null);
    const plan = await resolveCaptchaPlan('magic');
    if (!attemptIsCurrent(epoch)) return;
    const captchaRequired = Boolean(TURNSTILE_SITE_KEY);
    const token = captchaTokenRef.current;
    try { sessionStorage.setItem('plot_auth_method', 'magic_link'); } catch { /* ignore */ }
    let otpError = null;
    if (!shouldMagicLinkViaBypass({ captchaRequired, captchaToken: token, plan })) {
      const supabase = await loadSupabase();
      if (!attemptIsCurrent(epoch)) return;
      const { error } = await supabase.auth.signInWithOtp({
        email: submittedEmail,
        options: { emailRedirectTo: getAuthCallbackUrl(), captchaToken: token },
      });
      if (!attemptIsCurrent(epoch)) return;
      if (!error) {
        setLoading(false);
        setMagicSent(true);
        return;
      }
      otpError = error;
      if (!shouldMagicLinkViaBypass({ captchaRequired, captchaToken: token, plan, error })) {
        track(EVENTS.LOGIN_SUBMIT_FAILED, { method: 'magic_link', reason: errorReason(error.message) });
        setError(friendlyError(error.message));
        setLoading(false);
        resetCaptcha();
        try { sessionStorage.removeItem('plot_auth_method'); } catch { /* ignore */ }
        return;
      }
    }
    const bypass = await sendBypassAuthLink('magiclink', submittedEmail, epoch, { confirmSignup: mode === 'signup' });
    if (!attemptIsCurrent(epoch)) return;
    setLoading(false);
    if (bypass.ok) {
      if (mode === 'signup') {
        rememberPendingBypassSignup(submittedEmail, browserStore());
        try { sessionStorage.setItem('plot_auth_method', 'email'); } catch { /* ignore */ }
      }
      setMagicSent(true);
      return;
    }
    if (bypass.reason === 'superseded') return;
    track(EVENTS.LOGIN_SUBMIT_FAILED, {
      method: 'magic_link',
      reason: otpError ? errorReason(otpError.message) : (bypass.reason || 'captcha_failed'),
    });
    setError(bypass.message || (otpError ? friendlyError(otpError.message) : COMMON.genericError));
    resetCaptcha();
    try { sessionStorage.removeItem('plot_auth_method'); } catch { /* ignore */ }
  };

  const switchMode = (next) => {
    // Invalidates a submit that is still waiting on Turnstile, and drops any
    // form token so the next signup view fetches a new one.
    authEpochRef.current = advanceAuthEpoch(authEpochRef.current);
    bypassClient.reset();
    setMode(next);
    setError(null);
    setSuccess(false);
    setMagicSent(false);
    setResendStatus(null);
    setFormStarted(false);
    setLoading(false);
  };

  const handleResend = async () => {
    if (resendStatus === 'sending' || resendStatus === 'sent') return;
    setResendStatus('sending');
    const epoch = beginAuthAttempt();
    const captchaRequired = Boolean(TURNSTILE_SITE_KEY);
    const token = captchaTokenRef.current;
    // A token still goes to GoTrue first. No token, or a captcha / SMTP
    // failure, goes through signup-bypass so the inbox actually gets a link.
    if (!shouldResendViaBypass({ captchaRequired, captchaToken: token })) {
      const supabase = await loadSupabase();
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: getAuthCallbackUrl(), captchaToken: token },
      });
      if (!error) { setResendStatus('sent'); return; }
      if (!shouldResendViaBypass({ captchaRequired, captchaToken: token, error })) {
        setResendStatus('error');
        return;
      }
    }
    const bypass = await sendBypassAuthLink('resend', email, epoch);
    if (!attemptIsCurrent(epoch)) return;
    setResendStatus(bypass.ok ? 'sent' : 'error');
  };

  const scrollPosters = [...HERO_POSTERS, ...HERO_POSTERS];

  const headings = AUTH_PAGE.heading;
  const subheadings = AUTH_PAGE.subheading;
  const ctaLabels = AUTH_PAGE.submitLabel;
  const captchaCopy = captchaFailureCopy(mode);

  return (
    <div className={`auth-page auth-page--${mode}`}>

      {/* ── Left: living poster wall ── */}
      <div className="auth-visual" aria-hidden="true">
        <div className="poster-track">
          {scrollPosters.map((src, i) => (
            <div key={i} className="poster-cell" style={{ backgroundImage: `url('${src}')` }} />
          ))}
        </div>
        <div className="auth-visual-gradient" />
        <div className="auth-visual-brand">
          <span className="auth-visual-logo"><PlotLogo inherit /></span>
          <span className="auth-visual-tagline">Your movie &amp; TV companion</span>
        </div>
      </div>

      {/* ── Right: form panel ── */}
      <div className="auth-panel">
        <Link to="/" className="auth-panel-logo" aria-label="plot">
          plot
        </Link>

        <div className="auth-panel-body">

          {success && mode === 'signup' && (
            <div className="auth-success">
              <div className="auth-success-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <polyline points="2 4 12 13 22 4"/>
                </svg>
              </div>
              <h1>{AUTH_PAGE.almostThereTitle}</h1>
              <p>{AUTH_PAGE.almostThereBefore}<strong>{email}</strong>{AUTH_PAGE.almostThereAfter}</p>
              <button className="auth-cta auth-cta--outline" onClick={() => switchMode('login')}>{AUTH_PAGE.backToSignIn}</button>
              <p className="auth-success-resend">
                {AUTH_PAGE.resendPrompt}{' '}
                <button
                  className={`auth-resend-btn${resendStatus === 'sent' ? ' auth-resend-btn--sent' : ''}`}
                  onClick={handleResend}
                  disabled={resendStatus === 'sending' || resendStatus === 'sent'}
                >
                  {resendStatus === 'sending' ? AUTH_PAGE.resendState.sending : resendStatus === 'sent' ? AUTH_PAGE.resendState.sent : resendStatus === 'error' ? AUTH_PAGE.resendState.error : AUTH_PAGE.resendState.idle}
                </button>.</p>
            </div>
          )}

          {success && mode === 'forgot' && (
            <div className="auth-success">
              <div className="auth-success-icon">✓</div>
              <h1>{AUTH_PAGE.linkSentTitle}</h1>
              <p>{AUTH_PAGE.linkSentBefore}<strong>{email}</strong> {AUTH_PAGE.linkSentAfter}</p>
              <button className="auth-cta" onClick={() => switchMode('login')}>{AUTH_PAGE.backToSignIn}</button>
            </div>
          )}

          {magicSent && (
            <div className="auth-success">
              <div className="auth-success-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <polyline points="2 4 12 13 22 4"/>
                </svg>
              </div>
              <h1>{AUTH_PAGE.checkInboxTitle}</h1>
              <p>{AUTH_PAGE.checkInboxBefore}<strong>{email}</strong>. {AUTH_PAGE.checkInboxAfter}</p>
              <button className="auth-cta auth-cta--outline" onClick={() => { setMagicSent(false); resetCaptcha(); }}>{AUTH_PAGE.back}</button>
            </div>
          )}

          {!success && !magicSent && (
            <>
              <div className="auth-header">
                <h1>{headings[mode]}</h1>
                <p>{subheadings[mode]}</p>
              </div>

              {mode !== 'forgot' && (SHOW_GOOGLE_LOGIN || SHOW_APPLE_LOGIN) && (
                <>
                  <div className="auth-social">
                    {SHOW_GOOGLE_LOGIN && (
                      <button type="button" className="auth-social-btn" onClick={() => beginOAuth('google')} disabled={loading} aria-busy={loading}>
                        <GoogleIcon /> Continue with Google
                      </button>
                    )}
                    {SHOW_APPLE_LOGIN && (
                      <button type="button" className="auth-social-btn" onClick={() => beginOAuth('apple')} disabled={loading} aria-busy={loading}>
                        <AppleIcon /> {AUTH_PAGE.continueWithApple}
                      </button>
                    )}
                  </div>
                  <div className="auth-divider"><span>{AUTH_PAGE.socialDivider}</span></div>
                </>
              )}

              <form onSubmit={handleSubmit} className="auth-form" noValidate>
                {/* noValidate: we show branded errors instead of native tooltips.
                    Client-side checks in handleSubmit replace required/minLength,
                    and read the live DOM so password-manager autofill is not lost. */}
                {error && (
                  <div className={error.startsWith('__warning__') ? 'auth-warning' : 'auth-error'}>
                    {error.replace('__warning__', '')}
                  </div>
                )}

                <div className="auth-field">
                  <label htmlFor="auth-email">{AUTH_PAGE.emailLabel}</label>
                  <input
                    id="auth-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => { setEmail(e.target.value); markFormStarted(); }}
                    required
                    autoFocus
                    autoComplete="email"
                  />
                </div>

                {mode === 'signup' && (
                  <input
                    type="text"
                    name="website"
                    value={website}
                    onChange={e => setWebsite(e.target.value)}
                    className="fn-website"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                  />
                )}

                {mode !== 'forgot' && (
                  <div className="auth-field">
                    <label htmlFor="auth-password">{AUTH_PAGE.passwordLabel}</label>
                    <div className="auth-password-wrap">
                      <input
                        id="auth-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder={mode === 'signup' ? AUTH_PAGE.passwordPlaceholder.signup : AUTH_PAGE.passwordPlaceholder.login}
                        value={password}
                        onChange={e => { setPassword(e.target.value); markFormStarted(); }}
                        required
                        minLength={6}
                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      />
                      <button
                        type="button"
                        className="auth-show-pw"
                        onClick={() => setShowPassword(v => !v)}
                        aria-label={showPassword ? AUTH_PAGE.hidePassword : AUTH_PAGE.showPassword}
                        aria-pressed={showPassword}
                        title={showPassword ? AUTH_PAGE.hidePassword : AUTH_PAGE.showPassword}
                      >
                        {showPassword ? AUTH_PAGE.hide : AUTH_PAGE.show}
                      </button>
                    </div>
                    {mode === 'login' && (
                      <button type="button" className="auth-forgot-link" onClick={() => switchMode('forgot')} disabled={loading}>
                        {AUTH_PAGE.forgotPassword}
                      </button>
                    )}
                  </div>
                )}

                <Turnstile
                  siteKey={TURNSTILE_SITE_KEY}
                  onToken={handleCaptchaToken}
                  resetSignal={captchaNonce}
                  executeSignal={captchaExecute}
                  failureMessage={captchaCopy.failed}
                  blockedMessage={captchaCopy.blocked}
                  onBlocked={(attempt) => {
                    captchaErroredRef.current = true;
                    captchaBlockedRef.current = true;
                    if (mode === 'signup') track(EVENTS.SIGNUP_CAPTCHA_BLOCKED, { attempt });
                  }}
                  onPersistentlyBlocked={mode === 'signup' ? handleCaptchaPersistentlyBlocked : undefined}
                />

                <button
                  type="submit"
                  className="auth-cta"
                  disabled={loading}
                  aria-busy={loading}
                  aria-label={loading ? `${ctaLabels[mode]} in progress` : ctaLabels[mode]}
                >
                  {loading ? <PlotLoader size="button" tone="dark" ariaHidden /> : ctaLabels[mode]}
                </button>
              </form>

              {mode !== 'forgot' && (
                <button
                  type="button"
                  className="auth-magiclink"
                  onClick={sendMagicLink}
                  disabled={loading}
                >
                  {AUTH_PAGE.magicLinkInstead}
                </button>
              )}

              <div className="auth-toggle">
                {mode === 'forgot' ? (
                  <button type="button" onClick={() => switchMode('login')} disabled={loading}>{AUTH_PAGE.backToSignIn}</button>
                ) : mode === 'signup' ? (
                  <p>{AUTH_PAGE.alreadyHaveAccount} <button type="button" onClick={() => switchMode('login')} disabled={loading}>{AUTH_PAGE.signIn}</button></p>
                ) : (
                  <p>{AUTH_PAGE.noAccountYet} <button type="button" onClick={() => switchMode('signup')} disabled={loading}>{AUTH_PAGE.signUp}</button></p>
                )}
              </div>
            </>
          )}
        </div>

        <p className="auth-panel-footer">
          {AUTH_PAGE.termsAgreement} <Link to="/terms">{AUTH_PAGE.terms}</Link>, <Link to="/community">{COMMON.communityStandards}</Link> {AUTH_PAGE.and} <Link to="/privacy">{COMMON.privacyPolicy}</Link>.
        </p>
      </div>
    </div>
  );
}
