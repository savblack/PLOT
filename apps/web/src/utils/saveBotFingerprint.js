// Web-only PostHog admission rule for the October 2026 /save incident.
// It uses browser navigation and screen data, so it does not belong in core.
// Keep every condition narrow: a matching real visitor would lose analytics.
export function isSaveBotFingerprint({ hostname, pathname, userAgent, referrer, screenWidth, screenHeight } = {}) {
  return hostname === 'app.theplot.tv'
    && pathname === '/save'
    && typeof userAgent === 'string'
    && /\bLinux\b/.test(userAgent)
    && /Chrome\/155\.0\.0\.0 Safari\/537\.36$/.test(userAgent)
    && referrer === ''
    && screenWidth === 1920
    && screenHeight === 1080;
}

// Browsers that announce themselves as automated. A person cannot match any of
// these: `navigator.webdriver` is true only under WebDriver/CDP automation, a
// headless or crawler user agent names itself, and a real browser always
// reports at least one language. Kept separate from the October fingerprint
// above because these are signals, not one incident's exact values.
const AUTOMATION_UA = /HeadlessChrome|PhantomJS|Puppeteer|Playwright|Selenium|(?:bot|crawler|spider)\/[\d.]+|compatible;[^)]*(?:bot|crawler|spider)|curl\/|python-requests|Go-http-client/i;

// /save redirects straight to /signup, so a crawler that opens /save lands on
// the signup form too. Checking only /save let the same automated browser
// count as a signup-form visitor one redirect later (November 2026).
const AUTOMATION_CHECKED_PATHS = new Set(['/save', '/signup']);

export function isAutomatedBrowser({ pathname, userAgent, webdriver, languageCount } = {}) {
  if (!AUTOMATION_CHECKED_PATHS.has(pathname)) return false;
  if (webdriver === true) return true;
  if (typeof userAgent === 'string' && AUTOMATION_UA.test(userAgent)) return true;
  return languageCount === 0;
}
