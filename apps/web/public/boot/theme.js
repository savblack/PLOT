// Theme pre-paint for app.theplot.tv. Loaded by index.html as a plain classic
// script in <head> so the stored theme is on <html> before first paint.
//
// A file rather than an inline <script> on purpose: see boot/startup-guard.js.
// The family and legacy lists between @palettes:start / @palettes:end are
// generated from packages/core/tokens.js and themes.js by `pnpm run
// tokens:build`; do not edit them by hand.
(function () {
  try {
    // Mode ('plot-theme': light | dark | system) plus family
    // ('plot-theme-family'). A retired single theme id in 'plot-theme'
    // migrates. Both lists are generated from packages/core/tokens.js and
    // themes.js by `npm run tokens:build`. The Premium check happens once
    // React has the profile; this only paints the stored choice.
    // @palettes:start
    var families = { 'sage': 1, 'mist': 1, 'blush': 1, 'plum': 1, 'ink': 1 };
    var legacy = { 'sage': ['sage', 'light'], 'cinema': ['sage', 'dark'], 'mist': ['mist', 'light'], 'midnight': ['mist', 'dark'], 'ink': ['ink', 'light'], 'linen': ['default', 'light'], 'espresso': ['default', 'dark'], 'clay': ['default', 'dark'], 'burgundy': ['default', 'dark'], 'rose': ['blush', 'light'] };
    var familyAliases = { 'rose': 'blush' };
    // @palettes:end
    var mode = window.localStorage.getItem('plot-theme') || 'light';
    var family = window.localStorage.getItem('plot-theme-family') || 'default';
    if (Object.prototype.hasOwnProperty.call(familyAliases, family)) family = familyAliases[family];
    if (Object.prototype.hasOwnProperty.call(legacy, mode)) { family = legacy[mode][0]; mode = legacy[mode][1]; }
    var dark = mode === 'dark' || (mode === 'system' && !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches));
    var root = document.documentElement;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    if (Object.prototype.hasOwnProperty.call(families, family)) root.setAttribute('data-palette', family);
  } catch (e) {}
})();
