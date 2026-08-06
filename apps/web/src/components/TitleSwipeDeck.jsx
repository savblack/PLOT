import { useEffect, useRef, useState } from 'react';
import { posterUrl } from '../utils/images.js';
import { ONBOARDING_FLOW } from '../copy/onboardingFlow.js';

const SWIPE_THRESHOLD_RATIO = 0.32;
const TINT_FULL_RATIO = 0.28;
const ROTATE_MAX_DEG = 15;
const FALLBACK_WIDTH = 300;

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const titleOf = (item) => item.title || item.name || ONBOARDING_FLOW.untitled;
const yearOf = (item) => {
  const date = item.release_date || item.first_air_date;
  return date ? date.slice(0, 4) : null;
};

function PassIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function HeartIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-6.7-4.35-9.3-8.1C1 10.5 1.2 7.4 3.6 5.7c2-1.4 4.6-1 6.4 1 .6.6 1.4 1.6 2 2.4.6-.8 1.4-1.8 2-2.4 1.8-2 4.4-2.4 6.4-1 2.4 1.7 2.6 4.8.9 7.2C18.7 16.65 12 21 12 21z" />
    </svg>
  );
}

// Tinder-style one-at-a-time swipe deck for onboarding step 2. Swiping (or
// tapping the pass/like buttons) resolves the top card and reveals the next;
// running out of `items` shows an end-of-deck message in place of the card —
// the parent doesn't need to know the deck is empty, since Continue/Skip stay
// available regardless (the like target is a soft goal, never a gate).
export default function TitleSwipeDeck({ items, onResolve }) {
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [exiting, setExiting] = useState(null); // 'like' | 'pass' | null

  const cardRef = useRef(null);
  const dragStartRef = useRef(null);
  const resolvingRef = useRef(false);
  const [motionOff] = useState(reducedMotion);
  const duration = motionOff ? 1 : 220;

  // Read during render for the rotate/tint math below — kept as state (not a
  // ref read in the render body) so it only measures via an effect, on mount
  // and on resize; event handlers (resolve/settle) read the ref directly
  // instead, which is fine since that's outside of render.
  const [measuredWidth, setMeasuredWidth] = useState(FALLBACK_WIDTH);
  const cardWidth = () => cardRef.current?.offsetWidth || FALLBACK_WIDTH;
  useEffect(() => {
    const measure = () => setMeasuredWidth(cardWidth());
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const current = items[index];
  const visible = items.slice(index, index + 2);

  // Driven by a timer rather than a `transitionend` listener: the DOM event
  // doesn't reliably fire for a backgrounded/hidden tab (verified against
  // this app's own Storybook tab — Chromium suppresses it there), and a
  // dropped event would leave resolvingRef stuck forever, freezing the deck.
  // The CSS transition still plays the visible animation; this just owns
  // when the card is considered "done" independent of whether that event
  // arrives.
  const resolve = (direction) => {
    if (resolvingRef.current || !current) return;
    resolvingRef.current = true;
    setIsDragging(false);
    setExiting(direction);
    const width = cardWidth();
    setDragX(direction === 'like' ? width * 3 : -width * 3);
    setTimeout(() => {
      onResolve(current, direction);
      setIndex((i) => i + 1);
      setDragX(0);
      setExiting(null);
      resolvingRef.current = false;
    }, duration);
  };

  const onPointerDown = (e) => {
    if (resolvingRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = { clientX: e.clientX };
    setIsDragging(true);
  };
  const onPointerMove = (e) => {
    if (!dragStartRef.current) return;
    setDragX(e.clientX - dragStartRef.current.clientX);
  };
  const settle = () => {
    if (!dragStartRef.current) return;
    const finalX = dragX;
    dragStartRef.current = null;
    setIsDragging(false);
    if (Math.abs(finalX) > cardWidth() * SWIPE_THRESHOLD_RATIO) {
      resolve(finalX > 0 ? 'like' : 'pass');
    } else {
      setDragX(0);
    }
  };
  const onPointerUp = (e) => {
    settle();
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
  };

  if (!current) {
    return (
      <div className="onboarding-swipe-deck onboarding-swipe-deck-empty">
        <p className="onboarding-swipe-caption">{ONBOARDING_FLOW.step2.deckComplete}</p>
      </div>
    );
  }

  const rotate = Math.max(-ROTATE_MAX_DEG, Math.min(ROTATE_MAX_DEG, (dragX / measuredWidth) * ROTATE_MAX_DEG));
  const tintOpacity = Math.max(0, Math.min(1, Math.abs(dragX) / (measuredWidth * TINT_FULL_RATIO)));
  const direction = dragX > 0 ? 'like' : 'pass';
  const easing = exiting ? 'cubic-bezier(0.4,0,1,1)' : 'cubic-bezier(0.34,1.56,0.64,1)';

  return (
    <div>
      <div className="onboarding-swipe-deck">
        {visible.map((item, i) => {
          const isTop = i === 0;
          const poster = posterUrl(item.poster_path, 'w500');
          return (
            <div
              key={item.id}
              ref={isTop ? cardRef : undefined}
              className={`onboarding-swipe-card${isTop ? '' : ' peek'}`}
              style={isTop ? {
                transform: `translateX(${dragX}px) rotate(${rotate}deg)`,
                transition: isDragging ? 'none' : `transform ${duration}ms ${easing}`,
              } : undefined}
              onPointerDown={isTop ? onPointerDown : undefined}
              onPointerMove={isTop ? onPointerMove : undefined}
              onPointerUp={isTop ? onPointerUp : undefined}
              onPointerCancel={isTop ? onPointerUp : undefined}
            >
              {poster
                ? <img src={poster} alt="" draggable={false} />
                : <div className="onboarding-swipe-card-placeholder" />
              }
              {isTop && dragX !== 0 && (
                <div className={`onboarding-swipe-tint onboarding-swipe-tint-${direction}`} style={{ opacity: tintOpacity }}>
                  {direction === 'like'
                    ? <HeartIcon className="onboarding-swipe-tint-icon" />
                    : <PassIcon className="onboarding-swipe-tint-icon" />}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="onboarding-swipe-caption">
        {titleOf(current)}{yearOf(current) ? ` · ${yearOf(current)}` : ''}
      </p>

      <div className="onboarding-swipe-actions">
        <button
          type="button"
          className="onboarding-swipe-btn onboarding-swipe-btn-pass"
          onClick={() => resolve('pass')}
          aria-label={ONBOARDING_FLOW.step2.passLabel(titleOf(current))}
        >
          <PassIcon />
        </button>
        <button
          type="button"
          className="onboarding-swipe-btn onboarding-swipe-btn-like"
          onClick={() => resolve('like')}
          aria-label={ONBOARDING_FLOW.step2.likeLabel(titleOf(current))}
        >
          <HeartIcon />
        </button>
      </div>
    </div>
  );
}
