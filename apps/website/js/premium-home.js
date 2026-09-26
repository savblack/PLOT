/* Homepage-only DOM presentation for PLOT's planned Premium benefits. */
(function () {
  const panel = document.getElementById('premium');
  if (!panel) return;
  panel.querySelectorAll('img[data-premium-art]').forEach(function (image) {
    // Preserve the styled fallback if the external image is unavailable.
    image.addEventListener('error', function () { image.hidden = true; });
    if (image.complete && !image.naturalWidth) image.hidden = true;
  });
  const copy = Array.from(panel.querySelectorAll('.premium-copy-slide'));
  const visuals = Array.from(panel.querySelectorAll('.premium-visual-slide'));
  const switcher = panel.querySelector('.premium-switcher');
  const buttons = Array.from(switcher.querySelectorAll('button'));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0;
  let timer;
  let visible = false;

  function schedule() {
    window.clearTimeout(timer);
    if (!visible || reduced.matches || document.hidden || panel.matches(':hover') || panel.contains(document.activeElement)) return;
    timer = window.setTimeout(function () { show((index + 1) % copy.length); }, 7000);
  }

  function show(next) {
    [copy[index], visuals[index]].forEach(function (slide) {
      slide.classList.remove('is-active');
      slide.setAttribute('aria-hidden', 'true');
      slide.inert = true;
    });
    index = next;
    [copy[index], visuals[index]].forEach(function (slide) {
      slide.classList.add('is-active');
      slide.removeAttribute('aria-hidden');
      slide.inert = false;
      if (!reduced.matches) slide.animate([{ opacity: .35 }, { opacity: 1 }], { duration: 300 });
    });
    buttons.forEach(function (button, i) { button.setAttribute('aria-pressed', String(i === index)); });
    schedule();
  }

  switcher.hidden = false;
  buttons.forEach(function (button, i) {
    button.addEventListener('click', function () { if (i !== index) show(i); });
  });

  panel.addEventListener('mouseenter', function () { window.clearTimeout(timer); });
  panel.addEventListener('mouseleave', schedule);
  panel.addEventListener('focusin', function () { window.clearTimeout(timer); });
  panel.addEventListener('focusout', function () { window.setTimeout(schedule, 0); });
  document.addEventListener('visibilitychange', schedule);
  reduced.addEventListener('change', schedule);
  new IntersectionObserver(function (entries) {
    visible = entries[0].isIntersecting;
    panel.classList.toggle('is-in-view', visible);
    schedule();
  }).observe(panel);
})();
