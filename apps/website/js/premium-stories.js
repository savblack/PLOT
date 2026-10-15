// Premium stories — one benefit at a time, auto-advancing every 6s.
// Clicking a step jumps to it and restarts the clock. Reduced motion
// turns off the auto-advance; the steps still work by click.
(function () {
  var steps = document.querySelectorAll('#storiesSteps .stories-step');
  var slides = document.querySelectorAll('#storiesStage .stories-slide');
  var visuals = document.querySelectorAll('#storiesVisuals .vis');
  if (!steps.length) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var current = 0, timer;
  function show(n) {
    current = n % steps.length;
    steps.forEach(function (step, k) {
      var on = k === current;
      step.setAttribute('aria-pressed', String(on));
      var bar = step.querySelector('.stories-bar i');
      bar.style.transition = 'none';
      bar.style.width = '0';
      void bar.offsetWidth;
      bar.style.transition = '';
      bar.style.width = on ? '100%' : '0';
    });
    slides.forEach(function (slide, k) {
      slide.classList.toggle('is-active', k === current);
      if (k === current) slide.removeAttribute('aria-hidden'); else slide.setAttribute('aria-hidden', 'true');
    });
    visuals.forEach(function (vis, k) {
      var wasActive = vis.classList.contains('is-active');
      if (k === current) {
        // Restart the card's own sequence (a display flip resets every
        // descendant animation), then fade it in.
        if (!wasActive) { vis.style.display = 'none'; void vis.offsetWidth; vis.style.display = ''; }
        vis.classList.remove('is-leaving');
        vis.classList.add('is-active');
        vis.removeAttribute('aria-hidden');
      } else {
        vis.classList.remove('is-active');
        vis.classList.toggle('is-leaving', wasActive);
        vis.setAttribute('aria-hidden', 'true');
      }
    });
    countUp(visuals[current]);
    clearTimeout(timer);
    if (!reduce) timer = setTimeout(function () { show(current + 1); }, 6000);
  }
  // Numbers that count up when their card appears ([data-count]). The
  // text is already the final value, so reduced motion changes nothing.
  var counters = [];
  function countUp(vis) {
    counters.forEach(function (c) { cancelAnimationFrame(c); });
    counters = [];
    if (reduce) return;
    vis.querySelectorAll('[data-count]').forEach(function (el) {
      var end = Number(el.getAttribute('data-count'));
      var delay = Number(el.getAttribute('data-delay') || 0);
      var dur = Number(el.getAttribute('data-duration') || 900);
      var suffix = el.getAttribute('data-suffix') || '';
      var start = null;
      el.textContent = '0' + suffix;
      function tick(now) {
        if (start === null) start = now + delay;
        var t = Math.min(1, Math.max(0, (now - start) / dur));
        var eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(end * eased) + suffix;
        if (t < 1) counters.push(requestAnimationFrame(tick));
      }
      counters.push(requestAnimationFrame(tick));
    });
  }
  // Hovering a card pauses the clock so people can read it.
  var stage = document.getElementById('storiesVisuals');
  stage.addEventListener('mouseenter', function () { clearTimeout(timer); });
  stage.addEventListener('mouseleave', function () {
    clearTimeout(timer);
    if (!reduce) timer = setTimeout(function () { show(current + 1); }, 3000);
  });
  steps.forEach(function (step, k) { step.addEventListener('click', function () { show(k); }); });
  show(0);
})();
