/* A horizontal rail: the scroll container, its drag handlers, and nothing else.

   The scroll state lives in useRailScroll and is passed in, because the
   controls are not here — they sit in the section header as <RailArrows>,
   beside the collapse toggle. This used to render its own chevrons floating
   over the first and last card; they were only ever a workaround for the
   header being a single <button> that could not contain them. */

/** @param {{
 *    className?: string,
 *    style?: object,
 *    rail: ReturnType<import('../hooks/useRailScroll.js').useRailScroll>,
 *    children: React.ReactNode,
 *  }} props
 */
export default function ScrollRail({ className = 'rail-scroll', style, rail, children }) {
  // Destructured rather than read as rail.ref inline: the lint rule against
  // touching refs during render does not see through the property access.
  const { ref, handlers } = rail;

  return (
    <div className={className} ref={ref} style={style} {...handlers}>
      {children}
    </div>
  );
}
