/* Homepage-only DOM presentation for Plot's planned Premium benefits. */
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
  const buttons = Array.from(switcher.querySelectorAll('.premium-step'));
  const pos = switcher.querySelector('.premium-pos');
  const nextUp = switcher.querySelector('.premium-nextup');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0;
  let timer;
  let visible = false;

  function schedule() {
    window.clearTimeout(timer);
    // The active step's progress bar mirrors this timer, so the sequence reads
    // as a countdown to the next benefit. Pausing (hover, focus) resets it.
    panel.classList.remove('is-timing');
    if (!visible || reduced.matches || document.hidden || panel.matches(':hover') || panel.contains(document.activeElement)) return;
    void panel.offsetWidth;
    panel.classList.add('is-timing');
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
    buttons.forEach(function (button, i) {
      button.setAttribute('aria-pressed', String(i === index));
      button.classList.toggle('is-done', i < index);
    });
    pos.textContent = (index + 1) + ' of ' + copy.length;
    nextUp.textContent = buttons[(index + 1) % copy.length].textContent + ' next';
    schedule();
  }

  switcher.hidden = false;
  nextUp.textContent = buttons[1].textContent + ' next';
  buttons.forEach(function (button, i) {
    button.addEventListener('click', function () { if (i !== index) show(i); });
  });

  panel.addEventListener('mouseenter', function () { window.clearTimeout(timer); panel.classList.remove('is-timing'); });
  panel.addEventListener('mouseleave', schedule);
  panel.addEventListener('focusin', function () { window.clearTimeout(timer); panel.classList.remove('is-timing'); });
  panel.addEventListener('focusout', function () { window.setTimeout(schedule, 0); });
  document.addEventListener('visibilitychange', schedule);
  reduced.addEventListener('change', schedule);
  // Play only once the whole card is on screen. A card taller than the
  // viewport can never be fully inside it, so filling the viewport counts too.
  const stage = panel.querySelector('.premium-layout') || panel;
  new IntersectionObserver(function (entries) {
    const e = entries[entries.length - 1];
    const fills = e.rootBounds && e.intersectionRect.height >= e.rootBounds.height * 0.95;
    visible = e.isIntersecting && (e.intersectionRatio >= 0.95 || fills);
    panel.classList.toggle('is-in-view', visible);
    schedule();
  }, { threshold: [0, 0.25, 0.5, 0.75, 0.95, 1] }).observe(stage);
})();
