/* Homepage search bar: live results under the field.
   Typing two or more characters searches TMDB through the public Worker (which
   admits theplot.tv and rate limits per IP, so this opens nothing new) and
   lists up to six movies and shows. Picking one goes to app /save with
   src=hero_search: after signup the app opens that exact title, and saves
   nothing until they choose to. Pressing Enter without picking still submits
   the form to /signup?q=, where the app opens the title if it is the only
   exact match, or search with the title typed.

   If the Worker refuses (a preview host it does not admit) or fails, the list
   simply stays shut: the form works the same without it. */
(function () {
  var form = document.querySelector('.hero-search');
  var input = document.getElementById('heroSearch');
  var list = document.getElementById('heroResults');
  if (!form || !input || !list || !window.fetch) return;

  var WORKER = 'https://tmdb-proxy.sav-black.workers.dev';
  var IMG = 'https://image.tmdb.org/t/p/w92';
  var MIN_CHARS = 2;
  var MAX_RESULTS = 6;
  var DEBOUNCE_MS = 250;

  var cache = {};
  var seq = 0;
  var timer = null;
  var items = [];
  var active = -1;

  function esc(t) {
    return String(t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function search(q) {
    var key = q.toLowerCase();
    if (!cache[key]) {
      var url = WORKER + '?path=' + encodeURIComponent('search/multi') +
        '&query=' + encodeURIComponent(q) + '&include_adult=false';
      cache[key] = fetch(url).then(function (r) {
        if (!r.ok) throw new Error('search ' + r.status);
        return r.json();
      }).then(function (body) {
        return (body.results || []).filter(function (r) {
          return (r.media_type === 'movie' || r.media_type === 'tv') && Number.isInteger(r.id) && r.id > 0 &&
            typeof r.poster_path === 'string' && /^\/[\w.-]+$/.test(r.poster_path);
        }).slice(0, MAX_RESULTS);
      });
      cache[key].catch(function () { delete cache[key]; });
    }
    return cache[key];
  }

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function setActive(i) {
    var rows = list.querySelectorAll('.hero-result');
    rows.forEach(function (row, n) { row.setAttribute('aria-selected', String(n === i)); });
    active = i;
    if (i >= 0 && rows[i]) {
      input.setAttribute('aria-activedescendant', rows[i].id);
      rows[i].scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function render(results) {
    items = results;
    if (!results.length) { close(); return; }
    list.innerHTML = results.map(function (r, i) {
      var title = r.media_type === 'movie' ? r.title : r.name;
      var year = String(r.media_type === 'movie' ? r.release_date || '' : r.first_air_date || '').slice(0, 4);
      var kind = r.media_type === 'movie' ? 'Movie' : 'TV show';
      var href = 'https://app.theplot.tv/save?media_type=' + r.media_type + '&tmdb_id=' + r.id + '&src=hero_search';
      return '<li role="presentation"><a class="hero-result" role="option" id="heroResult' + i + '" aria-selected="false" ' +
        'href="' + esc(href) + '" data-cta="hero_search_result">' +
        '<img src="' + esc(IMG + r.poster_path) + '" alt="" width="40" height="60" loading="lazy" decoding="async">' +
        '<span class="hero-result-text"><span class="hero-result-title">' + esc(title) + '</span>' +
        '<span class="hero-result-meta">' + esc(year ? year + ' · ' + kind : kind) + '</span></span></a></li>';
    }).join('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    active = -1;
  }

  input.addEventListener('input', function () {
    clearTimeout(timer);
    var q = input.value.trim();
    if (q.length < MIN_CHARS) { seq++; close(); return; }
    timer = setTimeout(function () {
      var mine = ++seq;
      search(q).then(function (results) {
        if (mine === seq) render(results);
      }).catch(function () {
        if (mine === seq) close();
      });
    }, DEBOUNCE_MS);
  });

  input.addEventListener('keydown', function (e) {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(active + 1 >= items.length ? 0 : active + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(active <= 0 ? items.length - 1 : active - 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      var row = document.getElementById('heroResult' + active);
      if (row) row.click();
    }
  });

  // Close on a press anywhere outside the search bar and its list, or when
  // keyboard focus moves to something else on the page. A focusout with no
  // relatedTarget is left alone: iOS Safari sends one when a result is
  // tapped, and closing then would hide the row before its click lands.
  document.addEventListener('pointerdown', function (e) {
    if (!form.parentNode.contains(e.target)) close();
  });
  form.parentNode.addEventListener('focusout', function (e) {
    if (e.relatedTarget && !form.parentNode.contains(e.relatedTarget)) close();
  });
  input.addEventListener('focus', function () {
    if (items.length && input.value.trim().length >= MIN_CHARS) {
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }
  });
})();
