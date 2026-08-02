// Mirrors the <nav> markup in apps/website/index.html (nav.css + js/nav.js
// are shared already; the markup itself is duplicated per-page per nav.css's
// header comment). Update this if the real markup changes.

export default {
  title: 'Foundations/Navigation',
  parameters: { layout: 'fullscreen' },
};

export const Default = () => {
  const wrap = document.createElement('div');
  wrap.style.position = 'relative';
  wrap.style.height = '64px';
  wrap.innerHTML = `
    <nav style="position: static;">
      <a href="/" class="nav-logo">PLOT</a>
      <ul class="nav-links">
        <li><a href="/whats-on">What's On</a></li>
        <li><a href="https://app.theplot.tv/login" data-cta="nav">Log in</a></li>
        <li><a href="https://app.theplot.tv/signup" class="nav-cta" data-cta="nav">Sign up</a></li>
      </ul>
      <button class="nav-hamburger" aria-label="Menu" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    </nav>
  `;
  return wrap;
};

export const Scrolled = () => {
  const el = Default();
  el.querySelector('nav').classList.add('scrolled');
  return el;
};
