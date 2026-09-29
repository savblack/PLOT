import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/* Web-only: react-router's search params. The ?share=<card> deep link that
   opens the share sheet on a given card (docs/design/share-cards.md). Read
   it, then clear it so a refresh does not reopen the sheet. Mobile reads
   the same parameter from its route params in expo-router. */

/** @returns {[string|null, () => void]} the card id, and a function that removes it from the URL */
export function useSharePreset() {
  const [searchParams, setSearchParams] = useSearchParams();
  const preset = searchParams.get('share');
  const clear = useCallback(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('share');
      return next;
    }, { replace: true });
  }, [setSearchParams]);
  return [preset, clear];
}
