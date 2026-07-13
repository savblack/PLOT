import { useRef } from 'react';

export function useDragScroll() {
  const ref      = useRef(null);
  const dragging = useRef(false);
  const startX   = useRef(0);
  const scrollLeft = useRef(0);

  const onMouseDown = (e) => {
    if (!ref.current) return;
    dragging.current = true;
    startX.current   = e.pageX - ref.current.getBoundingClientRect().left;
    scrollLeft.current = ref.current.scrollLeft;
    ref.current.style.cursor = 'grabbing';
  };

  const onMouseMove = (e) => {
    if (!dragging.current || !ref.current) return;
    const x = e.pageX - ref.current.getBoundingClientRect().left;
    ref.current.scrollLeft = scrollLeft.current - (x - startX.current) * 1.2;
  };

  const stop = () => {
    dragging.current = false;
    if (ref.current) ref.current.style.cursor = 'grab';
  };

  return {
    ref,
    handlers: {
      onMouseDown,
      onMouseMove,
      onMouseUp:    stop,
      onMouseLeave: stop,
    },
  };
}
