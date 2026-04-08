import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import './LandingPage.css';

const SIDE_DATA = [
  { src: '/website-images/hero/challengers.webp',          side: 'left',  vy: 0.51,  showAt:    0, w: 217, h: 325, restX: 16, hold: 1000 },
  { src: '/website-images/hero/saltburn.jpg',              side: 'left',  vy: 0.11,  showAt:   40, w: 259, h: 353, restX: 34, hold: 1000 },
  { src: '/website-images/hero/devil-wears-prada-two.jpg', side: 'right', vy: 0.11,  showAt:   20, w: 230, h: 344, restX: 22, hold: 1000 },
  { src: '/website-images/hero/love-story.webp',           side: 'right', vy: 0.518, showAt:   60, w: 228, h: 342, restX: 58, hold: 1000 },
  { src: '/website-images/hero/the-white-lotus.jpg',       side: 'left',  vy: 0.24,  showAt:  400, w: 228, h: 342, restX: 90 },
  { src: '/website-images/hero/nosferatu.jpg',             side: 'right', vy: 0.22,  showAt:  440, w: 234, h: 351, restX: 85 },
  { src: '/website-images/hero/gone-girl.jpg',             side: 'left',  vy: 0.50,  showAt:  580, w: 221, h: 332, restX: 85 },
  { src: '/website-images/hero/the-bear.jpg',              side: 'right', vy: 0.48,  showAt:  620, w: 228, h: 342, restX: 18 },
  { src: '/website-images/hero/scream.jpg',                side: 'left',  vy: 0.09,  showAt:  760, w: 240, h: 360, restX: 95 },
  { src: '/website-images/hero/squid-game-2.jpg',          side: 'right', vy: 0.11,  showAt:  800, w: 217, h: 325, restX: 90 },
  { src: '/website-images/hero/the-vampire-diaries.jpeg',  side: 'left',  vy: 0.34,  showAt:  940, w: 228, h: 342, restX: 88 },
  { src: '/website-images/hero/the-wolf-of-wall-street.png', side: 'right', vy: 0.30, showAt: 980, w: 240, h: 360, restX: 18 },
  { src: '/website-images/hero/the-conjuring.avif',        side: 'left',  vy: 0.52,  showAt: 1120, w: 221, h: 332, restX: 88 },
  { src: '/website-images/hero/clueless.jpg',              side: 'right', vy: 0.50,  showAt: 1160, w: 217, h: 325, restX: 82 },
  { src: '/website-images/hero/parasite.jpg',              side: 'left',  vy: 0.12,  showAt: 1300, w: 240, h: 360, restX: 92 },
  { src: '/website-images/hero/oppenheimer.webp',          side: 'right', vy: 0.09,  showAt: 1340, w: 228, h: 342, restX: 16 },
  { src: '/website-images/hero/the-substance.avif',        side: 'left',  vy: 0.38,  showAt: 1480, w: 234, h: 351, restX: 92 },
  { src: '/website-images/hero/anniversary.jpg',           side: 'right', vy: 0.36,  showAt: 1520, w: 221, h: 332, restX: 86 },
  { src: '/website-images/hero/past-lives.jpg',            side: 'right', vy: 0.52,  showAt: 1660, w: 228, h: 342, restX: 20 },
  { src: '/website-images/hero/housemaid.jpg',             side: 'left',  vy: 0.50,  showAt: 1700, w: 217, h: 325, restX: 86 },
  { src: '/website-images/hero/aftersun.jpg',              side: 'right', vy: 0.14,  showAt: 1840, w: 240, h: 360, restX: 88 },
  { src: '/website-images/hero/friday-night-lights.jpg',   side: 'left',  vy: 0.11,  showAt: 1880, w: 228, h: 342, restX: 90 },
  { src: '/website-images/hero/the-summer-i-turned-pretty.jpg', side: 'left', vy: 0.38, showAt: 2020, w: 221, h: 332, restX: 90 },
  { src: '/website-images/hero/american-primeval.jpg',     side: 'right', vy: 0.36,  showAt: 2060, w: 234, h: 351, restX: 18 },
];

const EDITORIAL_DATA = [
  { img: '/website-images/lists/fallout.webp',                   label: 'Sci-Fi',   title: 'Weekend watch',       w: 136, h: 204, top:  40, left:  10, rot: -5, z: 2 },
  { img: '/website-images/lists/10-things-i-hate-about-you.jpg', label: 'Romance',  title: 'Date night picks',    w: 149, h: 224, top:  80, left: 145, rot:  4, z: 4 },
  { img: '/website-images/lists/monsters.jpg',                   label: 'Thriller', title: 'Need to watch',       w: 157, h: 236, top:  20, left: 285, rot: -2, z: 5 },
  { img: '/website-images/lists/landman.jpg',                    label: 'Drama',    title: "Can't stop watching", w: 140, h: 211, top:  70, left: 428, rot:  5, z: 3 },
  { img: '/website-images/lists/napoleon-dynamite.jpg',          label: 'Comedy',   title: 'Feel good movies',    w: 128, h: 191, top: 120, left: 552, rot: -3, z: 2 },
];

const SLIDE_IN  = 320;
const HOLD      = 600;
const SLIDE_OUT = 280;

function easeOutQuint(t) { return 1 - Math.pow(1 - t, 5); }
function easeInCubic(t)  { return t * t * t; }

const FEATURES = [
  {
    id: 'discover',
    num: '01',
    title: 'Discover',
    body: "Know what's new, trending, and coming soon — and find out where you can watch it, all in one place. PLOT is your starting point for finding something to watch tonight.",
  },
  {
    id: 'journal',
    num: '02',
    title: 'Journal',
    body: "Save it. Rate it. Write about it. Every film and series you watch becomes part of your timeline — look back and see it take shape like a story you didn't know you were writing.",
  },
  {
    id: 'personalise',
    num: '03',
    title: 'Personalise',
    body: "No two feeds look the same, and they shouldn't. Yours is shaped by every film you've rated, every series you've logged and every list you've made. The more you use PLOT, the more it gets you.",
  },
  {
    id: 'share',
    num: '04',
    title: 'Share',
    body: "Drop your top ten list in the group chat. Check if your flatmate's TV taste is grounds for moving out. Share your profile like a love letter. Or a warning. What's the point of great taste if nobody knows?",
  },
];

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeFeature, setActiveFeature] = useState('discover');
  const navRef        = useRef(null);
  const posterSideRef = useRef(null);
  const posterElsRef  = useRef([]);
  const plotDoesRef   = useRef(null);
  const smoothScrollY = useRef(window.scrollY);
  const rafRef        = useRef(null);

  // Smooth scroll for the landing page
  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => { document.documentElement.style.scrollBehavior = ''; };
  }, []);

  // Navbar scroll shadow
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll reveal via IntersectionObserver
  useEffect(() => {
    const els = document.querySelectorAll('.landing-page .reveal');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    els.forEach(el => observer.observe(el));
    // Hero elements visible immediately
    document.querySelectorAll('.landing-page #hero .reveal').forEach(el => {
      el.classList.add('visible');
    });
    return () => observer.disconnect();
  }, []);

  // Manifesto scroll-driven fade
  useEffect(() => {
    const lines = [...document.querySelectorAll('.landing-page .manifesto-line')];
    const update = () => {
      const threshold = window.innerHeight * 0.52;
      lines.forEach(line => {
        const rect = line.getBoundingClientRect();
        line.classList.toggle('passed', rect.bottom < threshold);
      });
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
    return () => window.removeEventListener('scroll', update);
  }, []);

  // Side-slide poster rAF loop
  useEffect(() => {
    const container = posterSideRef.current;
    if (!container) return;

    // Build poster elements
    posterElsRef.current = SIDE_DATA.map(data => {
      const el = document.createElement('div');
      el.className = 'side-poster';
      el.style.width           = data.w + 'px';
      el.style.height          = data.h + 'px';
      el.style.backgroundImage = `url('${data.src}')`;
      container.appendChild(el);
      return { el, data };
    });

    const loop = () => {
      smoothScrollY.current += (window.scrollY - smoothScrollY.current) * 0.05;
      const scrollY = smoothScrollY.current;
      const vh      = window.innerHeight;

      // Global fade as user approaches "PLOT does."
      const plotDoes = plotDoesRef.current;
      const plotDoesPageY = plotDoes
        ? plotDoes.getBoundingClientRect().top + window.scrollY
        : 999999;
      const gFadeStart = plotDoesPageY - vh * 0.9;
      const gFadeEnd   = plotDoesPageY - vh * 0.15;
      const globalOp   = Math.max(0, Math.min(1, 1 - (window.scrollY - gFadeStart) / (gFadeEnd - gFadeStart)));
      container.style.opacity = globalOp;

      posterElsRef.current.forEach(({ el, data }) => {
        const { side, vy, showAt, w, restX } = data;
        const hold     = data.hold !== undefined ? data.hold : HOLD;
        const total    = SLIDE_IN + hold + SLIDE_OUT;
        const progress = scrollY - showAt;
        const slideAmt = restX + w + 40;
        const dir      = side === 'left' ? -1 : 1;

        let opacity, tx;

        if (progress <= 0) {
          opacity = 0;
          tx = dir * slideAmt;
        } else if (progress < SLIDE_IN) {
          const e = easeOutQuint(progress / SLIDE_IN);
          opacity = Math.min(1, e * 1.4);
          tx = dir * slideAmt * (1 - e);
        } else if (progress < SLIDE_IN + hold) {
          opacity = 1;
          tx = 0;
        } else if (progress < total) {
          const e = easeInCubic((progress - SLIDE_IN - hold) / SLIDE_OUT);
          opacity = 1 - e;
          tx = dir * slideAmt * e;
        } else {
          opacity = 0;
          tx = dir * slideAmt;
        }

        el.style.top       = `${vy * vh}px`;
        el.style.opacity   = opacity;
        el.style.transform = `translateX(${tx.toFixed(1)}px)`;

        if (side === 'left') {
          el.style.left  = `${restX}px`;
          el.style.right = '';
        } else {
          el.style.right = `${restX}px`;
          el.style.left  = '';
        }
      });

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      // Clean up DOM elements
      posterElsRef.current.forEach(({ el }) => el.remove());
      posterElsRef.current = [];
    };
  }, []);

  return (
    <div className="landing-page">
      {/* Poster side-slides */}
      <div className="poster-side" ref={posterSideRef} />

      {/* Navbar */}
      <nav ref={navRef}>
        <Link to="/" className="nav-logo">PLOT</Link>
        <ul className={`nav-links${menuOpen ? ' open' : ''}`}>
          <li><Link to="/login" onClick={() => setMenuOpen(false)}>Log in</Link></li>
          <li>
            <Link to="/signup" className="btn btn-primary" style={{ color: '#fff' }} onClick={() => setMenuOpen(false)}>
              Sign up
            </Link>
          </li>
        </ul>
        <button
          className="nav-hamburger"
          aria-label="Menu"
          onClick={() => setMenuOpen(v => !v)}
        >
          <span /><span /><span />
        </button>
      </nav>

      {/* Hero */}
      <section id="hero">
        <div className="hero-content">
          <h1 className="hero-headline reveal" style={{ whiteSpace: 'nowrap', textAlign: 'center', width: '100%' }}>
            Your <span style={{ letterSpacing: '-0.13em' }}>fi</span>lm and TV journal
          </h1>
          <p className="hero-sub reveal reveal-delay-2">The beautiful way to track what you watch.</p>
          <div className="hero-actions reveal reveal-delay-3">
            <Link to="/signup" className="btn btn-primary btn-large">Start your journal →</Link>
          </div>
        </div>
      </section>

      {/* Manifesto */}
      <section id="manifesto">
        <p className="manifesto-line reveal">You don't just watch things.</p>
        <p className="manifesto-line reveal">You think about them.</p>
        <p className="manifesto-line reveal">You talk about them.</p>
        <p className="manifesto-line reveal">You carry them with you.</p>
        <p className="manifesto-line reveal">But no app has ever cared<br />as much as you do.</p>
        <p className="manifesto-line no-fade reveal" id="plotDoes" ref={plotDoesRef} style={{ marginTop: '20rem', marginBottom: '14rem' }}>
          PLOT <em>does.</em>
        </p>
      </section>

      {/* Features */}
      <section id="features">
        <div className="features-header reveal">
          <h2 className="section-title">Designed for your<br />viewing habits</h2>
        </div>
        <div className="features-split">
          <div className="feat-visual reveal">
            {FEATURES.map(f => (
              <div
                key={f.id}
                className={`feat-img${activeFeature === f.id ? ' active' : ''}`}
                style={{ backgroundImage: "url('/plot-product.png')" }}
              />
            ))}
          </div>
          <div className="feat-accordion reveal reveal-delay-2">
            {FEATURES.map(f => (
              <div
                key={f.id}
                className={`feat-item${activeFeature === f.id ? ' active' : ''}`}
                onMouseEnter={() => setActiveFeature(f.id)}
              >
                <div className="feat-header">
                  <span className="feat-num">{f.num}</span>
                  <span className="feat-title">{f.title}</span>
                </div>
                <div className="feat-body">
                  <p>{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For the Plot */}
      <section id="for-the-plot">
        <div className="ftp-inner">
          <div className="ftp-left reveal">
            <h2 className="ftp-headline">Your journal.<br />Your rules.</h2>
            <p className="ftp-body">Your top ten. All the series you binged in a weekend. The one dropping next month you've already cleared your schedule for. Make a list for anything.</p>
            <Link to="/signup" className="btn btn-primary btn-large">Make it yours →</Link>
          </div>
          <div className="editorial-wrap" id="editorialWrap">
            {EDITORIAL_DATA.map((item, i) => (
              <div
                key={i}
                className="ed-poster"
                style={{
                  width:           item.w,
                  height:          item.h,
                  top:             item.top,
                  left:            item.left,
                  zIndex:          item.z,
                  backgroundImage: `url('${item.img}')`,
                  transform:       `rotate(${item.rot}deg)`,
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = `rotate(${item.rot}deg) translateY(-8px) scale(1.04)`; }}
                onMouseLeave={e => { e.currentTarget.style.transform = `rotate(${item.rot}deg)`; }}
              >
                <div className="ed-label">
                  <span>{item.label}</span>
                  <strong>{item.title}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section id="timeline-section">
        <h2 className="timeline-headline reveal">A timeline as rich<br />as your taste.</h2>
        <p className="ftp-body reveal reveal-delay-2" style={{ marginTop: '2rem' }}>
          One day you'll scroll back and see the exact week you discovered your favourite director.<br />
          Remember the month you watched nothing but comfort rewatches and the series that kept you up until 2am.
        </p>

        <div className="timeline-entries">
          <div className="tl-entry">
            <div className="tl-empty" />
            <div className="tl-poster-wrap">
              <div className="tl-poster reveal" style={{ backgroundImage: "url('/website-images/hero/aftersun.jpg')" }} />
            </div>
            <div className="tl-note tl-note-right reveal reveal-delay-2">
              <div className="tl-date">October 2023</div>
              <p>Still not over this one.<br />Probably never will be.</p>
            </div>
          </div>

          <div className="tl-entry">
            <div className="tl-note tl-note-left reveal reveal-delay-2">
              <div className="tl-date">February 2024</div>
              <p>Watched this twice<br />in one sitting.</p>
            </div>
            <div className="tl-poster-wrap">
              <div className="tl-poster reveal" style={{ backgroundImage: "url('/website-images/hero/past-lives.jpg')" }} />
            </div>
            <div className="tl-empty" />
          </div>

          <div className="tl-entry">
            <div className="tl-empty" />
            <div className="tl-poster-wrap">
              <div className="tl-poster reveal" style={{ backgroundImage: "url('/website-images/hero/saltburn.jpg')" }} />
            </div>
            <div className="tl-note tl-note-right reveal reveal-delay-2">
              <div className="tl-date">June 2024</div>
              <p>Unhinged in all<br />the right ways.</p>
            </div>
          </div>

          <div className="tl-entry">
            <div className="tl-note tl-note-left reveal reveal-delay-2">
              <div className="tl-date">August 2024</div>
              <p>The twist I did not<br />see coming.</p>
            </div>
            <div className="tl-poster-wrap">
              <div className="tl-poster reveal" style={{ backgroundImage: "url('/website-images/hero/parasite.jpg')" }} />
            </div>
            <div className="tl-empty" />
          </div>

          <div className="tl-entry">
            <div className="tl-empty" />
            <div className="tl-poster-wrap">
              <div className="tl-poster reveal" style={{ backgroundImage: "url('/website-images/hero/the-substance.avif')" }} />
            </div>
            <div className="tl-note tl-note-right reveal reveal-delay-2">
              <div className="tl-date">December 2024</div>
              <p>Nothing could have<br />prepared me for this.</p>
            </div>
          </div>

          <div className="tl-entry">
            <div className="tl-note tl-note-left reveal reveal-delay-2">
              <div className="tl-date">March 2025</div>
              <p>My top ten.<br />Number one. Always.</p>
            </div>
            <div className="tl-poster-wrap">
              <div className="tl-poster reveal" style={{ backgroundImage: "url('/website-images/hero/gone-girl.jpg')" }} />
            </div>
            <div className="tl-empty" />
          </div>

          <div className="tl-entry">
            <div className="tl-empty" />
            <div className="tl-poster-wrap">
              <div className="tl-poster reveal" style={{ backgroundImage: "url('/website-images/hero/the-summer-i-turned-pretty.jpg')" }} />
            </div>
            <div className="tl-note tl-note-right reveal reveal-delay-2">
              <div className="tl-date">September 2025</div>
              <p>Team Conrad. Always.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section id="cta">
        <div className="cta-inner">
          <div className="cta-text">
            <h2 className="cta-headline reveal">You are what you watch</h2>
            <p className="cta-sub reveal reveal-delay-1">And every story needs a PLOT.</p>
          </div>
          <div className="reveal reveal-delay-2" style={{ flexShrink: 0, marginTop: '1rem' }}>
            <Link to="/signup" className="btn btn-large" style={{ background: '#fff', color: '#0e0e0e' }}>
              Create your PLOT →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer>
        <div className="footer-wordmark">PLOT</div>
        <div className="footer-meta">
          <span className="footer-tagline">YOUR FILM & TV JOURNAL</span>
          <ul className="footer-links">
            <li><a href="#">X</a></li>
            <li><a href="#">Instagram</a></li>
            <li><a href="/privacy">Privacy</a></li>
            <li><a href="/terms">Terms</a></li>
          </ul>
          <span className="footer-copy">© 2026 PLOT</span>
        </div>
      </footer>
    </div>
  );
}
