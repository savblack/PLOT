import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { TRACKING } from './copy/tracking.js';

/** Free one-time imports require explicit source consent, independently of scheduled sync.
 * @param {string|null|undefined} userId
 */
export function usePlexSource(userId) {
  const [state, setState] = useState(/** @type {{userId?: string|null, servers?: {clientIdentifier:string,name:string}[], profiles?: {accountID:string,name:string}[], serverId?:string, selected?:boolean, error?:string}} */ ({}));
  const [busy, setBusy] = useState(false);
  const scope = useRef(userId);
  const locked = useRef(false);
  useEffect(() => { scope.current = userId; return () => { scope.current = null; }; }, [userId]);
  const choose = async (serverId = '', accountID = '') => {
    if (!userId || locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('media-sync', { body: {
        action: accountID ? 'select-source' : 'sources', serverId, accountID,
      } });
      if (error || data?.error) throw error || new Error(data.error);
      if (scope.current === userId) setState({ userId, servers: data.servers || [], profiles: data.profiles || [], serverId, selected: !!data.selection });
    } catch {
      if (scope.current === userId) setState({ userId, error: TRACKING.sourceError });
    } finally { locked.current = false; setBusy(false); }
  };
  return { ...(state.userId === userId ? state : {}), busy, choose };
}
