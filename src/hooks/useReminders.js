import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../api/supabase.js';

export function useReminders(userId) {
  const [reminders, setReminders] = useState([]);
  const [loading,   setLoading]   = useState(true);

  /* ── Load all reminders for this user ── */
  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('reminders')
      .select('*')
      .eq('user_id', userId)
      .order('air_date', { ascending: true });
    if (error) console.error('[useReminders] load failed:', error);
    setReminders(data || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  /* ── Check membership by TVMaze episode id ── */
  const hasReminder = useCallback(
    (tvmazeEpId) => reminders.some(r => r.tvmaze_ep_id === tvmazeEpId),
    [reminders]
  );

  /* ── Add a reminder.
     prog shape: { id, showName, channelName, airtime, runtime, airDate }
     where airDate is YYYY-MM-DD (the EPG date being viewed) ── */
  const addReminder = useCallback(async (prog) => {
    if (!userId) return;
    const row = {
      user_id:      userId,
      tvmaze_ep_id: prog.id,
      show_name:    prog.showName,
      network_name: prog.channelName || null,
      air_date:     prog.airDate,
      air_time:     prog.airtime   || null,
      runtime:      prog.runtime   || null,
    };
    const { data, error } = await supabase
      .from('reminders')
      .insert(row)
      .select()
      .single();
    if (error) { console.error('[useReminders] insert failed:', error); return; }
    if (data) setReminders(prev => [...prev, data]);
    return data;
  }, [userId]);

  /* ── Remove a reminder ── */
  const removeReminder = useCallback(async (tvmazeEpId) => {
    if (!userId) return;
    const { error } = await supabase
      .from('reminders')
      .delete()
      .eq('user_id', userId)
      .eq('tvmaze_ep_id', tvmazeEpId);
    if (error) { console.error('[useReminders] delete failed:', error); return; }
    setReminders(prev => prev.filter(r => r.tvmaze_ep_id !== tvmazeEpId));
  }, [userId]);

  /* ── Toggle reminder for a programme ── */
  const toggleReminder = useCallback(async (prog) => {
    if (hasReminder(prog.id)) await removeReminder(prog.id);
    else                      await addReminder(prog);
  }, [hasReminder, addReminder, removeReminder]);

  return { reminders, loading, hasReminder, addReminder, removeReminder, toggleReminder };
}
