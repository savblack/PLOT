// Startup guard for app.theplot.tv. Loaded by index.html before the React
// entry module, as a plain classic script: it has to be in place before the
// entry graph fails, and it cannot import anything.
//
// A file rather than an inline <script> on purpose. The app's CSP allows no
// inline script at all (functions/_middleware.js), which is what makes an
// escaping slip in a server-rendered page a broken page rather than XSS.
// Served from /boot/ with a short cache (apps/web/public/_headers).
(function () {
  // A deploy can invalidate JS this page already asked for (Cloudflare
  // doesn't keep old builds' hashed files around — a stale request gets
  // the SPA-fallback HTML back instead of the script). A failed entry or
  // vendor script/modulepreload happens before React mounts, so no error
  // boundary ever sees it — this is the only place that can catch it.
  //
  // Shares the reload budget (sessionStorage key + window) with
  // src/utils/chunkError.js so the two never fight over how many reloads
  // are allowed. The constants below are duplicated there because this
  // script runs before any module can be imported; a unit test asserts
  // the two copies stay identical rather than trusting this comment.
  // Deliberately inline-styled and dependency-free: the stylesheet may
  // have failed the same way the script did.
  function showFallback() {
    try {
      var root = document.getElementById('root');
      if (!root || (root.firstChild && !root.querySelector('[data-initial-app-loader]'))) return;
      root.innerHTML =
        '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;' +
        'padding:1.5rem;font-family:Georgia,serif;color:#1a1a1a;background:#faf9f7;text-align:center">' +
        '<div><p style="font-size:1.5rem;margin:0 0 .5rem">plot</p>' +
        '<p style="font-family:system-ui,sans-serif;font-size:.9rem;line-height:1.5;color:#6b6b6b;margin:0 0 1.25rem">' +
        'Couldn\u2019t finish loading. This usually means an update landed mid-visit.</p>' +
        '<button type="button" data-plot-reload style="font:inherit;font-family:system-ui,sans-serif;font-size:.85rem;' +
        'padding:.5rem 1rem;border:1px solid #1a1a1a;border-radius:999px;background:none;cursor:pointer">' +
        'Reload</button></div></div>';
      // A listener, not an inline onclick: the CSP allows no inline script,
      // so an onclick attribute here would be a button that does nothing.
      var reload = root.querySelector('[data-plot-reload]');
      if (reload) reload.addEventListener('click', function () { location.reload(); });
    } catch (e) {}
  }
  window.__plotShowStartupFallback = showFallback;

  try {
    window.addEventListener('error', function (event) {
      var el = event.target;
      if (!el || !el.tagName) return;
      var tag = el.tagName.toLowerCase();
      var isEntryScript = tag === 'script' && el.getAttribute('type') === 'module';
      var isPreload = tag === 'link' && el.getAttribute('rel') === 'modulepreload';
      if (!isEntryScript && !isPreload) return;
      var url = el.src || el.href || '';
      if (url.indexOf('/assets/') === -1) return;

      var KEY = 'plot_chunk_reload';
      var WINDOW_MS = 20000;
      var MAX = 2;
      var parts = (sessionStorage.getItem(KEY) || '').split(',');
      var count = Number(parts[0]) || 0;
      var ts = Number(parts[1]) || 0;
      if (count >= MAX && Date.now() - ts < WINDOW_MS) {
        // Out of budget: the reloads didn't help, so this is a genuinely
        // broken deploy rather than a race. There is no app crash screen
        // to fall back to — that's a React boundary, and React never
        // mounted — so #root would just stay empty. Say something.
        showFallback();
        return;
      }
      var next = Date.now() - ts < WINDOW_MS ? count + 1 : 1;
      sessionStorage.setItem(KEY, next + ',' + Date.now());
      window.location.reload();
    }, true);
  } catch (e) {}
})();
