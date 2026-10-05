// plot's Picks as a rotating row: its cards sit in a scroll-snap track (so
// touch and trackpad swipes just work) and an interval advances it. It stops
// for anyone hovering, focused inside or off-screen, never starts for people
// who ask for reduced motion, and carries a Pause button (WCAG 2.2.2).
// Mobile parity: not shipped on mobile yet; the cards are web-only today.
import { Children, useCallback, useEffect, useRef, useState } from 'react';
import { DISCOVER_VIEW } from '@plot/core/copy/discoverView.js';
import './PicksCarousel.css';

const ADVANCE_MS = 6500;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** @param {{ children: import('react').ReactNode }} props  Each child is one card. */
export default function PicksCarousel({ children }) {
  const COPY = DISCOVER_VIEW.picks;
  const slides = Children.toArray(children);
  const trackRef = useRef(null);
  const [index, setIndex] = useState(0);
  const [pages, setPages] = useState(1);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [userPaused, setUserPaused] = useState(reducedMotion);

  // How many cards fit at once is CSS's call (two-up on desktop, one on a
  // phone), so ask the track rather than hardcode it.
  const measure = useCallback(() => {
    const track = trackRef.current;
    const first = track?.children[0];
    if (!first) return;
    const perView = Math.max(1, Math.round(track.clientWidth / first.offsetWidth));
    setPages(Math.max(1, slides.length - perView + 1));
  }, [slides.length]);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const goTo = useCallback((next) => {
    const track = trackRef.current;
    const target = track?.children[next];
    if (!target) return;
    track.scrollTo({ left: target.offsetLeft - track.children[0].offsetLeft, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, []);

  // Keep the dots honest when someone swipes.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const origin = track.children[0].offsetLeft;
        let nearest = 0;
        for (let i = 0; i < track.children.length; i += 1) {
          if (Math.abs(track.children[i].offsetLeft - origin - track.scrollLeft) < Math.abs(track.children[nearest].offsetLeft - origin - track.scrollLeft)) nearest = i;
        }
        setIndex(nearest);
      });
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => { track.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, []);

  useEffect(() => {
    const node = trackRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.4 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const rotating = pages > 1 && !userPaused && !hovered && !focused && visible;
  useEffect(() => {
    if (!rotating) return undefined;
    const timer = setInterval(() => {
      if (document.hidden) return;
      goTo(index >= pages - 1 ? 0 : index + 1);
    }, ADVANCE_MS);
    return () => clearInterval(timer);
  }, [rotating, index, pages, goTo]);

  return (
    <div
      className="picks-carousel"
      role="group"
      aria-roledescription="carousel"
      aria-label={COPY.cardsLabel}
      onPointerEnter={e => { if (e.pointerType === 'mouse') setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <div className="picks-track" ref={trackRef} aria-live={rotating ? 'off' : 'polite'}>
        {slides.map((slide, i) => (
          <div className="picks-slide" key={slide.key ?? i} role="group" aria-roledescription="slide" aria-label={`${i + 1} / ${slides.length}`}>{slide}</div>
        ))}
      </div>
      {pages > 1 && (
        <div className="picks-controls">
          <div className="picks-dots">
            {Array.from({ length: pages }, (_, i) => (
              <button key={i} type="button" className={`picks-dot${i === index || (index > pages - 1 && i === pages - 1) ? ' is-active' : ''}`}
                aria-label={COPY.showCard(i + 1)} aria-current={i === index ? 'true' : undefined} onClick={() => goTo(i)} />
            ))}
          </div>
          <button type="button" className="picks-pause" onClick={() => setUserPaused(p => !p)}>
            {userPaused ? COPY.play : COPY.pause}
          </button>
        </div>
      )}
    </div>
  );
}
