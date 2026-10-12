/**
 * Asks the alert-brevo-event function to record a Brevo event after an alert
 * write has already landed. The function reads the account email from the
 * session and builds the app.theplot.tv link. A failure here does not undo
 * the alert.
 *
 * Event names must match supabase/functions/_shared/alertBrevoEvent.ts.
 */
import { supabase } from './supabase.js';
import { callAuthenticatedFunction } from './functions.js';

export const STREAMING_ALERT_SET = 'streaming_alert_set';
export const EPISODE_ALERT_SET = 'episode_alert_set';

const WAIT_MS = 4000;

/**
 * @param {{
 *   event: 'streaming_alert_set' | 'episode_alert_set',
 *   title: string | null | undefined,
 *   titleId: number | null | undefined,
 *   mediaType: 'movie' | 'tv',
 * }} args
 */
export async function reportBrevoAlertSet({ event, title, titleId, mediaType }) {
  try {
    const name = String(title ?? '').trim().slice(0, 300);
    const id = Number(titleId);
    if (event !== STREAMING_ALERT_SET && event !== EPISODE_ALERT_SET) return;
    if (!name || !Number.isInteger(id) || id < 1) return;
    if (event === STREAMING_ALERT_SET && mediaType !== 'movie') return;
    if (event === EPISODE_ALERT_SET && mediaType !== 'tv') return;
    const { data: { session } } = await supabase.auth.getSession();
    let timer = 0;
    const timeout = new Promise((resolve) => { timer = setTimeout(resolve, WAIT_MS); });
    try {
      await Promise.race([
        callAuthenticatedFunction('alert-brevo-event', session, {
          event,
          title: name,
          title_id: id,
          media_type: mediaType,
        }),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // The mute is already gone. Brevo being down does not put the prompt back.
  }
}
