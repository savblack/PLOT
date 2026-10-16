// Behaviour for the server-rendered What's On pages (theplot.tv/whats-on):
// the scrolled-nav class, the hamburger menu, the newsletter form, and the
// closing banner's poster wall.
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

  // Poster wall behind the closing banner: the same three TMDB sets the
  // homepage used, through the same /api/discover proxy.
  (function () {
    var wall = document.getElementById('wclWall');
    if (!wall) return;
    var IMG = 'https://image.tmdb.org/t/p/w500';
    var MAX = 72;
    var PATHS = ['trending/movie/week', 'movie/now_playing', 'trending/tv/week'];
    Promise.all(PATHS.map(function (path) {
      return fetch('/api/discover?path=' + encodeURIComponent(path))
        .then(function (r) { return r.json(); })
        .catch(function () { return {}; });
    })).then(function (sets) {
      // By title, not poster path: the sets overlap, and a re-release carries
      // different art for the same title.
      var seen = {}, urls = [];
      sets.forEach(function (set) {
        ((set && set.results) || []).forEach(function (r) {
          var key = String(r.title || r.name || '').trim().toLowerCase();
          if (!r.poster_path || !key || seen[key]) return;
          seen[key] = 1;
          urls.push(IMG + r.poster_path);
        });
      });
      for (var i = urls.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = urls[i]; urls[i] = urls[j]; urls[j] = t;
      }
      // Enough rows to fill the banner top to bottom, so no bare band is left
      // above the footer. A short list makes a shorter wall rather than a
      // repeating one.
      var cols = getComputedStyle(wall).gridTemplateColumns.split(' ').length || 9;
      var gap = 12;
      var tileH = ((wall.clientWidth - gap * (cols - 1)) / cols) * 1.5;
      var rows = Math.ceil(wall.clientHeight / (tileH + gap)) + 1;
      var tiles = Math.min(MAX, cols * rows, urls.length);
      for (var k = 0; k < tiles; k++) {
        var tile = document.createElement('div');
        tile.className = 'wcl-tile';
        var img = new Image();
        img.loading = 'lazy';
        img.decoding = 'async';
        img.alt = '';
        img.onload = (function (im) { return function () { im.classList.add('loaded'); }; })(img);
        img.src = urls[k];
        tile.appendChild(img);
        wall.appendChild(tile);
      }
    }).catch(function () {});
  })();
