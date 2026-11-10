// Temporary service notice at the top of every signed-in app page (AppShell)
// and of the login and signup screens (AuthPage). In the shell it rides in
// the content column and scrolls away with the page, so it needs no dismiss
// control. The sentence lives in the shared catalog; clearing it there hides
// this. Mobile does not render it: that app has not shipped, and the notice
// is expected to be gone before it does.
//
// role="note", not "status": the text never changes, so there is nothing for
// a live region to announce, and pages and tests that look up their own
// status message must keep finding exactly one.
import { APP_SHELL } from '../copy/appShell.js';
import './ServiceNotice.css';

export default function ServiceNotice() {
  if (!APP_SHELL.serviceNotice) return null;
  return (
    <p className="service-notice" role="note">{APP_SHELL.serviceNotice}</p>
  );
}
