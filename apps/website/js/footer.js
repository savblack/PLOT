/* Shared footer behaviour: the wordmark's foil sheen tilts with the pointer.
   Loaded by _partials/footer.html on every page that carries the footer
   (static pages and the edge-rendered ones), so it must no-op safely when
   the wordmark is absent. The sheen itself fades in with CSS on hover; this
   only steers the gradient, so without JS the hover still shows a still foil. */
(function () {
  var link = document.querySelector('.footer-wordmark');
  var grad = link && link.querySelector('#footer-foil');
  var svg = link && link.querySelector('svg');
  if (!grad || !svg) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  function clamp(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

  function tilt(e) {
    var p = e.touches ? e.touches[0] : e;
    var r = svg.getBoundingClientRect();
    var fx = clamp((p.clientX - r.left) / r.width);
    var fy = clamp((p.clientY - r.top) / r.height);
    // Angle swings 60–180deg across the width; the band slides with the pointer.
    var angle = 60 + fx * 80 + fy * 40;
    var shift = (fx - 0.5) * 0.5;
    grad.setAttribute('gradientTransform', 'rotate(' + angle.toFixed(1) + ' 0.5 0.5) translate(' + shift.toFixed(3) + ' 0)');
  }

  link.addEventListener('pointermove', tilt);

  // Touch: a finger dragged across the mark shows the sheen while it moves.
  var touchTimer;
  link.addEventListener('touchstart', function (e) {
    clearTimeout(touchTimer);
    link.classList.add('is-touching');
    tilt(e);
  }, { passive: true });
  link.addEventListener('touchmove', tilt, { passive: true });
  link.addEventListener('touchend', function () {
    touchTimer = setTimeout(function () { link.classList.remove('is-touching'); }, 900);
  });
})();
