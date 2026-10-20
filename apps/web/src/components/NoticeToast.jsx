import { useEffect, useState } from 'react';
import { on, NOTICE_EVENT } from '@plot/core/events.js';
import './UndoToast.css';

/* A short confirmation ("You'll get notified when…"): anything can show one
   with emit(NOTICE_EVENT, { message }). Same place and look as the undo toast;
   it has no action, so it just fades after a few seconds. Mobile listens in
   apps/mobile/components/NoticeToast.tsx. */

const SHOW_MS = 4000;

export default function NoticeToast() {
  const [notice, setNotice] = useState(null);

  useEffect(() => on(NOTICE_EVENT, (payload) => {
    if (payload?.message) setNotice({ message: payload.message, at: Date.now() });
  }), []);

  useEffect(() => {
    if (!notice) return undefined;
    const id = setTimeout(() => setNotice(null), SHOW_MS);
    return () => clearTimeout(id);
  }, [notice]);

  if (!notice) return null;
  return (
    <div key={notice.at} className="undo-toast notice-toast" role="status" aria-live="polite">
      <span className="undo-toast-message">{notice.message}</span>
    </div>
  );
}
