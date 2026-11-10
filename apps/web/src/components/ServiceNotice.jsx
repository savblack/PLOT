// Temporary service notice at the top of every app page. It rides in the
// content column and scrolls away with the page, so it needs no dismiss
// control. The sentence lives in the shared catalog; clearing it there hides
// this. Mobile does not render it: that app has not shipped, and the notice
// is expected to be gone before it does.
import { APP_SHELL } from '../copy/appShell.js';
import './ServiceNotice.css';

export default function ServiceNotice() {
  if (!APP_SHELL.serviceNotice) return null;
  return (
    <p className="service-notice" role="status">{APP_SHELL.serviceNotice}</p>
  );
}
