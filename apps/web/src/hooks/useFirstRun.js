import { useState } from 'react';
import { finishingTouchesVisible } from '@plot/core/finishingTouches.js';
import { readFinishingTouches } from '../utils/finishingTouchesState.js';
import { useApp } from './useApp.js';

/** Whether Home treats this account as first-run: the Finishing touches card (or its finish) is showing. */
export function useFirstRun() {
  const { user } = useApp();
  const [state] = useState(() => readFinishingTouches(user?.id));
  return finishingTouchesVisible(state);
}
