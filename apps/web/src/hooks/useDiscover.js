// Moved to @plot/core/useDiscover.js (shared, platform-agnostic core).
//
// Not a bare re-export: core takes `hideKids` as an argument rather than
// reaching into app context, so this wrapper is the seam that supplies web's
// `useApp()` profile. Mobile passes its own. Call sites here are unchanged.
import { useDiscover as useCoreDiscover } from '@plot/core/useDiscover.js';
import { useApp } from '../App.jsx';

export function useDiscover() {
  const { profile } = useApp();
  return useCoreDiscover({ hideKids: !(profile?.include_kids_content ?? true) });
}
