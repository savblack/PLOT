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
