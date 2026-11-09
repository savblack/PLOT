import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Turnstile from '../../../src/components/Turnstile.jsx';

let options;
let executed = false;
let resets = 0;
// A second execute on an already-executed Cloudflare widget does nothing.
// The first challenge stays pending; the next fresh challenge returns a token.
window.turnstile = {
  render: (_target, value) => { options = value; return 'widget'; },
  reset: () => { executed = false; resets++; },
  execute: () => {
    if (executed) return;
    executed = true;
    if (resets > 1) options.callback('retry-token');
  },
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
