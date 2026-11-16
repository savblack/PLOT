// Web only: this follows the page's scroll with IntersectionObserver and
// scrollIntoView, which are DOM APIs, so it cannot live in @plot/core.
import { useEffect, useState } from 'react';

const sectionId = key => `new-releases-${key}`;

/**
 * Which section of the page is in view, and a way to scroll to one. One
 * instance drives both the desktop card and the phone bar, so they agree.
 *
 * @param {Array<{key: string}>} rails
 * @returns {[string | undefined, (key: string) => void]}
 */
export function useActiveRail(rails) {
  const [activeKey, setActiveKey] = useState(rails[0]?.key);
  const currentKey = rails.some(rail => rail.key === activeKey) ? activeKey : rails[0]?.key;

  useEffect(() => {
    const nodes = rails.map(rail => document.getElementById(sectionId(rail.key))).filter(Boolean);
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActiveKey(visible[0].target.id.replace('new-releases-', ''));
    }, { rootMargin: '-15% 0px -65% 0px' });
    nodes.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [rails]);

  const jumpTo = (key) => {
    setActiveKey(key);
    document.getElementById(sectionId(key))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return [currentKey, jumpTo];
}
