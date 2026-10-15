import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { TRACKING } from './copy/tracking.js';

/** Free one-time imports require explicit source consent, independently of scheduled sync.
 * @param {string|null|undefined} userId
 * @param {{ autoPick?: boolean }} [options] `autoPick` chooses for the user when
 *   the account has exactly one server and that server exactly one profile (the
 *   common case), so the picker only appears when there is a real choice.
 */
export function usePlexSource(userId, { autoPick = false } = {}) {
  const [state, setState] = useState(/** @type {{userId?: string|null, servers?: {clientIdentifier:string,name:string}[], profiles?: {accountID:string,name:string}[], serverId?:string, selected?:boolean, selection?: {name?:string, profileName?:string}|null, error?:string}} */ ({}));
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
      if (scope.current === userId) setState({ userId, servers: data.servers || [], profiles: data.profiles || [], serverId, selected: !!data.selection, selection: data.selection || null });
    } catch {
      if (scope.current === userId) setState({ userId, error: TRACKING.sourceError });
    } finally { locked.current = false; setBusy(false); }
  };
  // The only server, then its only profile. Each step lands as a new state, so
  // this runs once per step and stops as soon as there is a choice to make.
  const current = state.userId === userId ? state : null;
  const soleServer = !current?.serverId && current?.servers?.length === 1 ? current.servers[0].clientIdentifier : null;
  const soleProfile = current?.serverId && !current.selected && current.profiles?.length === 1 ? current.profiles[0].accountID : null;
  const serverId = current?.serverId || '';
  useEffect(() => {
    if (!autoPick || busy || !userId) return;
    if (soleServer) choose(soleServer);
    else if (soleProfile) choose(serverId, soleProfile);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- choose is recreated every render; the sole ids are the trigger
  }, [autoPick, busy, userId, soleServer, soleProfile, serverId]);
  return { ...(current || {}), busy, choose };
}
