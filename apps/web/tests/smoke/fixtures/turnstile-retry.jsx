import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Turnstile from '../../../src/components/Turnstile.jsx';

let options;
let resets = 0;
// Render-mode Cloudflare widget: render() starts the first challenge, which
// stays pending here. reset() starts a fresh one; the second fresh challenge
// returns a token. execute() is never needed in this mode, so it is counted
// and the spec asserts it stayed at zero.
window.__turnstileCalls = { execute: 0, execution: null };
window.turnstile = {
  render: (_target, value) => { options = value; window.__turnstileCalls.execution = value.execution; return 'widget'; },
  reset: () => {
    resets++;
    if (resets > 1) options.callback('retry-token');
  },
  execute: () => { window.__turnstileCalls.execute++; },
  remove: () => {},
};

export default function Fixture() {
  const [execute, setExecute] = useState(0);
  const [token, setToken] = useState(null);
  return <>
    <button onClick={() => setExecute(n => n + 1)}>Submit auth attempt</button>
    <button onClick={() => options.callback('late-token')}>Finish pending challenge</button>
    <output aria-label="Captcha token">{token || 'Waiting for verification'}</output>
    <Turnstile siteKey="test-site" executeSignal={execute} onToken={setToken} />
  </>;
}

createRoot(document.getElementById('root')).render(<Fixture />);
