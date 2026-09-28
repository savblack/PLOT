// Shared copy: used by the web app and mobile's app/(auth)/index.tsx.
// Lives in @plot/core/copy so the two platforms can't drift word by word;
// apps/web/src/copy/authPage.js re-exports it so src/copy stays the single place
// the web app and the Storybook Content page look for copy.

export const AUTH_PAGE = {
  incorrectCredentials: 'Oops! Incorrect email or password.',
  activationEmailWaiting: '__warning__Almost in! Your activation email is waiting in your inbox.',
  accountAlreadyExists: 'An account with this email already exists. Try signing in instead.',
  weakPassword: 'Password must be at least 6 characters.',
  invalidEmail: 'Please enter a valid email address.',
  rateLimited: 'Too many attempts. Please wait a moment and try again.',

  heading: {
    signup: 'Create your account',
    login: 'Welcome back',
    forgot: 'Reset your password',
  },
  subheading: {
    signup: 'For people who think about what they watch.',
    login: 'Good to see you again.',
    forgot: "We'll send a link to your inbox.",
  },
  submitLabel: {
    signup: 'Create account',
    login: 'Sign in',
    forgot: 'Send reset link',
  },

  passwordPlaceholder: {
    signup: 'At least 6 characters',
    login: 'Your password',
  },
  emailLabel: 'Email',
  passwordLabel: 'Password',
  showPassword: 'Show password',
  hidePassword: 'Hide password',
  show: 'Show',
  hide: 'Hide',
  forgotPassword: 'Forgot password?',
  continueWithApple: 'Continue with Apple',
  socialDivider: 'or',
  appleSignInFailed: "We couldn't sign you in with Apple. Please try again.",

  // Split around the emailed {email}, which the page renders inside <strong>.
  almostThereTitle: 'Almost there!',
  almostThereBefore: 'We sent a confirmation link to ',
  almostThereAfter: '. Click it to activate your account, then come back to sign in.',
  linkSentTitle: 'Link sent',
  linkSentBefore: 'Check ',
  linkSentAfter: "for a password reset link. It'll expire in an hour.",
  checkInboxTitle: 'Check your inbox',
  checkInboxBefore: 'We sent a one-time sign-in link to ',
  checkInboxAfter: "Open it on this device and you're straight in, no password needed.",

  backToSignIn: 'Back to sign in',
  back: 'Back',
  magicLinkInstead: 'Email me a magic link instead',
  resendPrompt: "Didn't get it? Check spam or",
  resendState: {
    sending: 'sending',
    sent: 'sent',
    error: 'try again',
    idle: 'resend',
  },
  alreadyHaveAccount: 'Already have an account?',
  signIn: 'Sign in',
  noAccountYet: "Don't have an account?",
  signUp: 'Sign up',
  termsAgreement: 'By continuing you agree to our',
  terms: 'Terms',
  and: 'and',
  privacyPolicy: 'Privacy Policy',

  // Shown under the Turnstile widget when it errors. Login, password reset,
  // and magic link have no bypass, so the shared wording stays neutral.
  verificationFailed: 'Verification failed to load. Wait a moment and try again.',
  verificationBlocked: 'Still blocked. An ad blocker or privacy setting is the usual cause. Wait a moment and try again.',
  // Signup still submits: that attempt goes through signup-bypass.
  verificationFailedSignup: 'Verification failed to load. You can still create your account.',
  verificationBlockedSignup: 'Still blocked. An ad blocker or privacy setting is the usual cause. You can still create your account.',
  verificationRetry: 'Retry',
  // Login, reset, and magic link have no bypass. Said when the widget
  // never returns a token and the submit itself has to stop.
  verificationUnavailable: 'The security check did not finish. Wait a moment and try again.',
};

/**
 * Copy for a Turnstile failure. Signup is the only mode that can continue
 * without a token, so it is the only mode that may say the account can
 * still be created.
 *
 * @param {'signup'|'login'|'forgot'|'magic'|string} mode
 * @returns {{ failed: string, blocked: string }}
 */
export function captchaFailureCopy(mode) {
  if (mode === 'signup') {
    return {
      failed: AUTH_PAGE.verificationFailedSignup,
      blocked: AUTH_PAGE.verificationBlockedSignup,
    };
  }
  return {
    failed: AUTH_PAGE.verificationFailed,
    blocked: AUTH_PAGE.verificationBlocked,
  };
}
