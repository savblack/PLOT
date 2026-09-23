import { TRACKING } from './copy/tracking.js';

/** Shared PIN polling protocol; browser opening remains platform-specific.
 * @param {{ request:()=>Promise<any>, onAuthorized:()=>void, onError:(message:string)=>void, intervalMs?:number, timeoutMs?:number }} options
 * @returns {()=>void} Cancel also fences a response already in flight.
 */
export function pollPlexAuthorization({ request, onAuthorized, onError, intervalMs = 3000, timeoutMs = 300000 }) {
  let stopped = false;
  let timer;
  const cancel = () => { stopped = true; clearTimeout(timer); clearTimeout(deadline); };
  const deadline = setTimeout(() => { cancel(); onError(TRACKING.authExpired); },timeoutMs);
  const tick = async () => {
    try {
      const result = await request();
      if (stopped) return;
      if (result?.status === 'authorized' || result?.status === 'active') { cancel(); onAuthorized(); return; }
      if (result?.status !== 'pending') { cancel(); onError(TRACKING.authExpired); return; }
      timer = setTimeout(tick,intervalMs);
    } catch { if (!stopped) { cancel(); onError(TRACKING.authFailed); } }
  };
  void tick();
  return cancel;
}
