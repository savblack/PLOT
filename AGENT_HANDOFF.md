# Handoff: Calendar suggest card

Status: paused (ready for review). Updated 2026-11-18.

What changed: the pink "Add upcoming" button at the top of the web Calendar is gone. A card under the mini calendar now opens the "Fill your calendar" sheet, and its words change with the person's calendar (nothing saved yet / saved shows with no dates ahead / dates already on it). The sheet's own copy was rewritten.

- Branch: agent/2026-11-18-calendar-suggest-panel
- Worktree: ~/Developer/PLOT-worktrees/2026-11-18-calendar-suggest-panel
- Checks: `pnpm run check` and `pnpm run test:unit` pass. Checked in Storybook (Views/CalendarMyDates Stream, Empty, NothingAhead; Components/UpcomingSuggestions Ready).
- Not checked: the real signed-in Calendar page.
- Next: Savannah reviews; open a PR when asked.
- Note: below 1024px the side column is hidden, so phones/tablets only get the sheet from the empty-state button (and the once-per-session auto-open).
