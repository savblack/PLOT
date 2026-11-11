import { createContext } from 'react';

/* My Lists lets a section be folded shut. The page wraps each section in this
   context and `ListSection` reads it, so Watching and Top 5 (which draw their
   own frame) fold the same way without being told how. Anywhere else there is
   no provider, and a section is a plain section.

   Web-only rendering; the rules are in @plot/core/uiPrefs.js. */

/** @type {import('react').Context<{ collapsed: boolean, onToggle: () => void, hint: string } | null>} */
export const SectionFoldContext = createContext(null);
