import { useState, useEffect, useRef, useCallback } from 'react';
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
import { captchaSubmitPlan, CAPTCHA_SUBMIT_ATTEMPTS, CAPTCHA_TOKEN_WAIT_MS } from '@plot/core/captchaGate.js';
import { advanceAuthEpoch, authAttemptIsCurrent } from '../utils/authAttempt.js';
import { signupFormTokenIsStale } from '../utils/signupFormToken.js';
import { markSignupReferralPending } from '../utils/attribution.js';
import { loadSupabase } from '../utils/loadSupabase.js';

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
  return msg;
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

// signup-bypass rejects posts younger than its server minimum, measured from
// form-token issuance. Waiting here keeps a fast click from landing on a
// success screen for an account the server never created.
function waitOutMinimum(startedAt, minMs) {
  if (!startedAt) return Promise.resolve();
  const since = Date.now() - startedAt;
  if (since >= minMs) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, minMs - since));
}

// Short, stable slugs for signup_submit_failed — group failures in PostHog
// without leaking the raw (occasionally wordy) Supabase error message.
// Stable analytics slugs live in core so web and mobile group failures the
// same way — see @plot/core/authErrors.js.
const errorReason = authErrorReason;

// Friendly copy for the signup-bypass Edge Function's structured error
// reasons (distinct from friendlyError/errorReason above, which parse raw
// Supabase Auth messages — the bypass path returns its own reason strings).
function bypassErrorMessage(reason) {
  if (reason === 'rate_limited') return AUTH_PAGE.rateLimited;
  if (reason === 'already_registered') return AUTH_PAGE.accountAlreadyExists;
  return COMMON.genericError;
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
  const [formStarted, setFormStarted] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot — real users never see or fill this
  // Signed {iat} token from signup-bypass's GET endpoint — a server-observed
  // clock the bypass path checks submission timing against, since a raw
  // client-supplied timestamp could just be claimed, not proven.
  const formTokenRef = useRef(null);
  // When the current form token was issued. signup-bypass rejects (as a fake
  // success) anything posted sooner than its server-side minimum, measured
  // from that issuance. A fast click has to wait out the window or the
  // success screen would describe an account that was never created.
  // The same timestamp decides when the token is too old to reuse. Past
  // signup-bypass's 15-minute cap the function again returns { ok: true }
  // and creates nothing.
  const formTokenAtRef = useRef(0);
  // Bumped on every fetch so a slow GET cannot overwrite a newer token.
  const formTokenFetchGen = useRef(0);
  // Password submit, magic link, OAuth, and mode switches all advance this.
  // An attempt that loses the epoch must not keep going after an await.
  const authEpochRef = useRef(0);
  // Latched for the lifetime of this page, never reset on success: once an OAuth
  // handoff is under way the browser is leaving, and a second /authorize would do
  // real damage (see beginOAuth).
  const oauthStartingRef = useRef(false);
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
        const failedNow = captchaBlockedRef.current && !blockedAtStart;
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

  // signup-bypass's MIN_SUBMIT_MS is 1200. Stay above it so a real person
  // who clicks immediately is not shown a success screen for an account
  // the server declined to create.
  const BYPASS_MIN_PAGE_MS = 1500;

  const loadFormToken = useCallback(async () => {
    const gen = ++formTokenFetchGen.current;
    try {
      const supabase = await loadSupabase();
      const { data } = await supabase.functions.invoke('signup-bypass', { method: 'GET' });
      if (gen !== formTokenFetchGen.current || !data?.formToken) return formTokenRef.current;
      formTokenRef.current = data.formToken;
      formTokenAtRef.current = Date.now();
    } catch { /* bypass simply won't be available if this fails */ }
    return formTokenRef.current;
  }, []);

  const ensureFormToken = async () => {
    if (formTokenRef.current && !signupFormTokenIsStale(formTokenAtRef.current)) {
      return formTokenRef.current;
    }
    // Drop the expired token before the fetch. A failed refresh must not
    // fall back to it and paint a confirmation for an account that was
    // never created.
    formTokenRef.current = null;
    formTokenAtRef.current = 0;
    return loadFormToken();
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
    let plan = 'wait';
    for (let attempt = 1; attempt <= CAPTCHA_SUBMIT_ATTEMPTS; attempt += 1) {
      requestCaptcha();
      const token = await waitForCaptchaAttempt(CAPTCHA_TOKEN_WAIT_MS);
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
      loadFormToken();
    }
  }, [mode, hasSession, loadFormToken]);

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
      const { data, error } = await supabase.auth.signInWithPassword({
        email: submittedEmail,
        password: submittedPassword,
        options: { captchaToken: tokenForRequest },
      });
      if (!attemptIsCurrent(epoch)) return;
      if (error) {
        // Sign-in failures are their own funnel — deliberately not folded into
        // signup_submit_failed, which would inflate every signup-attempt metric.
        track(EVENTS.LOGIN_SUBMIT_FAILED, { reason: errorReason(error.message) });
        setError(friendlyError(error.message)); setLoading(false); resetCaptcha();
      } else {
        identifyUser(data.user.id, { email: data.user.email });
        track(EVENTS.USER_LOGGED_IN);
        const plan = getPremiumCheckoutIntent();
        navigate(plan ? `/pricing?billing=${plan}` : takeReturnPath('/app'));
      }
    } else {
      track(EVENTS.SIGNUP_SUBMIT_CLICKED);

      // No Turnstile token. signup-bypass creates the account without one.
      // A healthy widget still takes the signUp() call below: a token
      // resolves the plan to 'ready' before we get here.
      if (plan === 'bypass') {
        if (!captchaBlockedRef.current) {
          track(EVENTS.SIGNUP_CAPTCHA_BLOCKED, { attempt: 0, reason: 'timeout' });
          setError(AUTH_PAGE.verificationFailedSignup);
        }
        track(EVENTS.SIGNUP_BYPASS_OFFERED);
        const formToken = await ensureFormToken();
        if (!attemptIsCurrent(epoch)) return;
        if (!formToken) {
          setError(COMMON.genericError);
          setLoading(false);
          track(EVENTS.SIGNUP_SUBMIT_FAILED, { reason: 'bypass_no_form_token' });
          return;
        }
        await waitOutMinimum(formTokenAtRef.current, BYPASS_MIN_PAGE_MS);
        if (!attemptIsCurrent(epoch)) return;
        await submitViaBypass(submittedEmail, submittedPassword, epoch);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: submittedEmail,
        password: submittedPassword,
        options: { emailRedirectTo: getAuthCallbackUrl(), captchaToken: tokenForRequest },
      });
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
        identifyUser(data.user?.id, { email: data.user?.email || submittedEmail });
        track(EVENTS.USER_SIGNED_UP, { method: 'email' });
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
    const supabase = await loadSupabase();
    if (!attemptIsCurrent(epoch)) return;
    const { data, error } = await supabase.functions.invoke('signup-bypass', {
      method: 'POST',
      body: {
        email: submittedEmail,
        password: submittedPassword,
        website,
        formToken: formTokenRef.current,
      },
    });
    if (!attemptIsCurrent(epoch)) return;
    if (error) {
      setError(COMMON.genericError);
      setLoading(false);
      track(EVENTS.SIGNUP_SUBMIT_FAILED, { reason: 'bypass_create_failed' });
      return;
    }
    if (data?.error) {
      setError(bypassErrorMessage(data.reason));
      setLoading(false);
      track(EVENTS.SIGNUP_SUBMIT_FAILED, { reason: `bypass_${data.reason || 'unknown'}` });
      return;
    }
    if (!data?.requires_email_confirmation) {
      // Honeypot, or a submit that arrived sooner than the server minimum.
      // signup-bypass answers { ok: true } and creates nothing, so those
      // cases look like success on purpose. An expired form token used to
      // land here too. ensureFormToken refreshes before that 15-minute cap,
      // and a failed refresh does not post the old token.
      setLoading(false);
      setSuccess(true);
      return;
    }
    markSignupReferralPending(submittedEmail);
    setLoading(false);
    setSuccess(true);
  };

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
    if (mode === 'signup') markFormStarted();
    // Cancels a password submit that is still inside the captcha wait.
    beginAuthAttempt();
    setLoading(true);
    setError(null);
    try { sessionStorage.setItem('plot_auth_method', provider); } catch { /* ignore */ }

    // Either failure path means we never navigated away, so undo everything the
    // handoff set up — including the guard, or they could never retry.
    const abandon = (err) => {
      setError(friendlyError(err?.message));
      setLoading(false);
      oauthStartingRef.current = false;
      try { sessionStorage.removeItem('plot_auth_method'); } catch { /* ignore */ }
    };

    try {
      const supabase = await loadSupabase();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: getAuthCallbackUrl() },
      });
      // No error means the redirect is under way and this page is on its way out.
      if (error) abandon(error);
    } catch (e) {
      // A throw (offline, client misconfigured) would otherwise leave the guard
      // latched and every auth button dead until a manual reload.
      abandon(e);
    }
  };

  // Passwordless: email a one-time sign-in link. Works for new and returning
  // users alike; the callback completes auth and reports the method.
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
    if (plan === 'unavailable') {
      setError(AUTH_PAGE.verificationUnavailable);
      setLoading(false);
      return;
    }
    try { sessionStorage.setItem('plot_auth_method', 'magic_link'); } catch { /* ignore */ }
    const supabase = await loadSupabase();
    if (!attemptIsCurrent(epoch)) return;
    const { error } = await supabase.auth.signInWithOtp({
      email: submittedEmail,
      options: { emailRedirectTo: getAuthCallbackUrl(), captchaToken: captchaTokenRef.current },
    });
    if (!attemptIsCurrent(epoch)) return;
    setLoading(false);
    if (error) { setError(friendlyError(error.message)); resetCaptcha(); }
    else setMagicSent(true);
  };

  const switchMode = (next) => {
    // Invalidates a submit that is still waiting on Turnstile, and drops any
    // form token so the next signup view fetches a new one.
    authEpochRef.current = advanceAuthEpoch(authEpochRef.current);
    formTokenFetchGen.current += 1;
    setMode(next);
    setError(null);
    setSuccess(false);
    setMagicSent(false);
    setResendStatus(null);
    setFormStarted(false);
    setLoading(false);
    formTokenRef.current = null;
    formTokenAtRef.current = 0;
  };

  const handleResend = async () => {
    if (resendStatus === 'sending' || resendStatus === 'sent') return;
    setResendStatus('sending');
    const supabase = await loadSupabase();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: getAuthCallbackUrl(), captchaToken: captchaTokenRef.current },
    });
    setResendStatus(error ? 'error' : 'sent');
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
          <span className="auth-visual-logo">plot</span>
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
                  onBlocked={mode === 'signup'
                    ? (attempt) => track(EVENTS.SIGNUP_CAPTCHA_BLOCKED, { attempt })
                    : undefined}
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
