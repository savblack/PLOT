import { useRef } from 'react';

export function useDragScroll() {
  const ref      = useRef(null);
  const dragging = useRef(false);
  const moved    = useRef(false);
  const startX   = useRef(0);
  const scrollLeft = useRef(0);
  const pointerId = useRef(null);

  const onPointerDown = (e) => {
    if (!ref.current) return;
    if (e.target.closest('button, a, input, select, textarea, [role="button"]')) return;
    dragging.current = true;
    moved.current = false;
    pointerId.current = e.pointerId;
    startX.current   = e.clientX - ref.current.getBoundingClientRect().left;
    scrollLeft.current = ref.current.scrollLeft;
    ref.current.style.cursor = 'grabbing';
    ref.current.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragging.current || !ref.current) return;
    const x = e.clientX - ref.current.getBoundingClientRect().left;
    const delta = x - startX.current;
    if (Math.abs(delta) > 3) moved.current = true;
    ref.current.scrollLeft = scrollLeft.current - delta * 1.2;
    if (moved.current) e.preventDefault();
  };

  const stop = (e) => {
    dragging.current = false;
    if (ref.current) {
      ref.current.style.cursor = 'grab';
      if (pointerId.current != null) ref.current.releasePointerCapture?.(pointerId.current);
    }
    pointerId.current = null;
    e?.stopPropagation?.();
  };

  const onClickCapture = (e) => {
    if (!moved.current) return;
    moved.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  return {
    ref,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp:     stop,
      onPointerCancel: stop,
      onClickCapture,
    },
  };
}
