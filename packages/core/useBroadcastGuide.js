import { useEffect, useState } from 'react';
import { validateGuideSnapshot } from './broadcastGuide.js';

/** Shared loading lifecycle. Endpoint is injected by the host app.
 * @param {string} endpoint @param {string} region @param {number} revision
 */
export function useBroadcastGuide(endpoint, region, revision = 0) {
  const [state, setState] = useState({ region: '', data: null, error: false, loading: true });
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 245_000);
    let active = true;
    fetch(`${endpoint}?region=${encodeURIComponent(region)}`, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Guide unavailable');
        return response.json();
      })
      .then(data => validateGuideSnapshot(data, region))
      .then(data => { if (active) setState({ region, data, error: false, loading: false }); })
      .catch(() => {
        if (active) setState(previous => ({ region, data: previous.region === region ? previous.data : null, error: true, loading: false }));
      })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [endpoint, region, revision]);
  return state.region === region ? state : { region, data: null, error: false, loading: true };
}
