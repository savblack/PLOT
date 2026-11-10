/* Temporary service notice: a strip at the very top of every page that carries
   the shared footer (the footer partial loads this file, so static pages and
   the edge-rendered ones all get it).

   The strip sits in the page flow and scrolls away. The site nav is
   position: fixed at the top of the screen, so while any of the strip is
   still visible the nav is pushed down by that much (--site-notice-offset)
   instead of covering it.

   The sentence matches APP_SHELL.serviceNotice in
   packages/core/copy/appShell.js, which this no-build site cannot import:
   change both. To take the notice down, delete this file and its <script>
   line in _partials/footer.html, then run `pnpm run footer`. */
(function () {
  var MESSAGE = "We're seeing more traffic than usual and are upgrading our systems to keep up. You may run into issues importing your watch history or saving titles in the app while we do. Thanks for your patience.";
  if (!MESSAGE || !document.body || document.getElementById('site-notice')) return;

  var style = document.createElement('style');
  style.textContent =
    '#site-notice{margin:0;padding:10px 16px;background:var(--surface,#f1e9dc);' +
    'border-bottom:1px solid var(--rule,rgba(41,41,36,0.12));color:var(--text,#292924);' +
    "font-family:var(--sans,'DM Sans',system-ui,sans-serif);font-size:0.85rem;line-height:1.45;" +
    'text-align:center;text-wrap:pretty;}' +
    '#navbar,#topnav{margin-top:var(--site-notice-offset,0px);}';
  document.head.appendChild(style);

  var notice = document.createElement('p');
  notice.id = 'site-notice';
  notice.setAttribute('role', 'note');
  notice.textContent = MESSAGE;
  document.body.insertBefore(notice, document.body.firstChild);

  function sync() {
    var visible = Math.max(0, Math.round(notice.getBoundingClientRect().bottom));
    document.documentElement.style.setProperty('--site-notice-offset', visible + 'px');
  }
  window.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  sync();
})();
