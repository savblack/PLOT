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
        '<div><p style="font-size:1.5rem;margin:0 0 .5rem"><svg style="display:inline-block;height:.871em;width:1.568em" viewBox="52 -681 1568 871" role="img" aria-label="plot" fill="currentColor"><path d="M52 190V-489H161L176 -440Q233 -501 323 -501Q389 -501 440.0 -468.5Q491 -436 519.5 -378.0Q548 -320 548 -244Q548 -169 519.0 -111.0Q490 -53 439.0 -20.5Q388 12 322 12Q249 12 198 -25V190ZM295 -125Q341 -125 370.0 -158.5Q399 -192 399 -244Q399 -297 370.0 -330.5Q341 -364 295 -364Q251 -364 221.0 -330.5Q191 -297 191 -245Q191 -192 221.0 -158.5Q251 -125 295 -125ZM715.0 5Q678.0 5 647.0 -9.5Q616.0 -24 597.0 -56.0Q578.0 -88 578.0 -141V-681H723.0V-193Q723 -132 768 -134Q796 -137 801 -175L880 -80L910 -18Q850 7 715 5ZM1032.0 12Q955.0 12 897.0 -20.5Q839.0 -53 807.0 -111.0Q775.0 -169 775.0 -244Q775.0 -320 807.0 -378.0Q839.0 -436 897.0 -468.5Q955.0 -501 1032.0 -501Q1108.0 -501 1166.0 -468.5Q1224.0 -436 1256.5 -378.0Q1289.0 -320 1289.0 -244Q1289.0 -169 1256.5 -111.0Q1224.0 -53 1166.0 -20.5Q1108.0 12 1032.0 12ZM1032.0 -130Q1080.0 -130 1110.5 -161.5Q1141.0 -193 1141.0 -245Q1141.0 -296 1110.5 -328.0Q1080.0 -360 1032.0 -360Q983.0 -360 953.0 -328.5Q923.0 -297 923.0 -245Q923.0 -193 953.0 -161.5Q983.0 -130 1032.0 -130ZM1539.0 8Q1457.0 8 1411.0 -32.0Q1365.0 -72 1365.0 -163V-355H1289.0V-489H1363.0L1393.0 -607H1511.0V-489H1620.0V-355H1511.0V-195Q1511.0 -161 1527.0 -146.5Q1543.0 -132 1569.0 -132Q1584.0 -132 1597.5 -134.5Q1611.0 -137 1620.0 -140V-3Q1602.0 2 1583.0 5.0Q1564.0 8 1539.0 8Z"/></svg></p>' +
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
