/* Shared marketing-site nav behaviour: scroll-glass + mobile hamburger.
   Mirrors the inline copy on index.html. No-ops safely if the nav (or its
   parts) aren't on the page. */
(function () {
  var navbar = document.getElementById('navbar');
  if (!navbar) return;

  // Glass background once the page has scrolled a little.
  window.addEventListener('scroll', function () {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
  navbar.classList.toggle('scrolled', window.scrollY > 20);

  var hamburger = document.getElementById('hamburger');
  var navLinks = document.getElementById('navLinks');
  if (!hamburger || !navLinks) return;

  function setNavOpen(open) {
    navLinks.classList.toggle('open', open);
    hamburger.classList.toggle('open', open);
    navbar.classList.toggle('nav-open', open);
    hamburger.setAttribute('aria-expanded', String(open));
  }

  hamburger.addEventListener('click', function () {
    setNavOpen(!navLinks.classList.contains('open'));
  });

  // Close on link tap.
  navLinks.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () { setNavOpen(false); });
  });

  // Close on tap outside the nav / menu panel.
  document.addEventListener('click', function (e) {
    if (navLinks.classList.contains('open') && !e.target.closest('nav') && !e.target.closest('.nav-links')) {
      setNavOpen(false);
    }
  });

  // Close on Escape and return focus to the toggle.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && navLinks.classList.contains('open')) {
      setNavOpen(false);
      hamburger.focus();
    }
  });
})();
