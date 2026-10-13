// Behaviour for the server-rendered What's On pages (theplot.tv/whats-on):
// the scrolled-nav class, the hamburger menu, and the newsletter form.
// Loaded deferred by supabase/functions/marketing-feed/index.ts; each block
// returns early on a page that lacks its elements.
//
// A file rather than inline <script> blocks: see whats-on-head.js.

  (function () {
    var nav = document.getElementById('topnav');
    var update = function () { nav.classList.toggle('scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', update, { passive: true });
    update();
    var hamburger = document.getElementById('hamburger');
    var navLinks = document.getElementById('navLinks');
    if (hamburger && navLinks) {
      var setOpen = function (open) {
        navLinks.classList.toggle('open', open);
        hamburger.classList.toggle('open', open);
        nav.classList.toggle('nav-open', open);
        hamburger.setAttribute('aria-expanded', String(open));
      };
      hamburger.addEventListener('click', function () { setOpen(!navLinks.classList.contains('open')); });
      navLinks.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
      document.addEventListener('click', function (e) { if (navLinks.classList.contains('open') && !e.target.closest('nav') && !e.target.closest('.nav-links')) { setOpen(false); } });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && navLinks.classList.contains('open')) { setOpen(false); hamburger.focus(); } });
    }
  })();

  (function () {
    var form = document.getElementById('nlForm');
    var msg = document.getElementById('nlMsg');
    if (!form || !msg) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var button = form.querySelector('button');
      button.disabled = true;
      msg.textContent = '';
      fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.elements.email.value,
          website: form.elements.website.value,
          list: 'newsletter',
        }),
      }).then(function (r) {
        if (!r.ok) throw new Error('bad status');
        msg.textContent = "You're in. The next issue lands in your inbox.";
        form.reset();
        if (window.posthog) posthog.capture('newsletter_subscribed', { placement: form.dataset.placement });
      }).catch(function () {
        msg.textContent = 'Something went wrong — try again in a minute.';
      }).finally(function () {
        button.disabled = false;
      });
    });
  })();
