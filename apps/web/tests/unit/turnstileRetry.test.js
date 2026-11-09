import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test, { mock } from 'node:test';
import {
  CAPTCHA_INTERACTIVE_WAIT_MS,
  CAPTCHA_NO_FALLBACK_WAIT_MS,
  CAPTCHA_SUBMIT_ATTEMPTS,
  CAPTCHA_TOKEN_WAIT_MS,
  captchaRetryAfterWait,
  captchaSubmitPlan,
  captchaWaitOver,
  shouldResetCaptcha,
} from '@plot/core/captchaGate.js';

// Run the native WebView's actual embedded script with Cloudflare's execute
// behavior: a widget that already ran produces nothing until it is reset.
function nativeWidget() {
  const source = readFileSync(new URL('../../../mobile/components/Turnstile.tsx', import.meta.url), 'utf8');
  const template = source.slice(source.indexOf('`<!DOCTYPE'), source.indexOf('`;\n\nexport default') + 1);
  const html = new Function('siteKey', `return ${template};`)('test-site');
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  let callbacks;
  let executed = false;
  let resets = 0;
  const messages = [];
  const context = {
    window: {
      ReactNativeWebView: { postMessage: (m) => messages.push(JSON.parse(m)) },
      turnstile: {
        render: (_target, options) => { callbacks = options; return 'widget'; },
        reset: () => { executed = false; resets++; },
        execute: () => {
          if (executed) return;
          executed = true;
          if (resets > 1) callbacks.callback('retry-token');
        },
      },
    },
    document: { getElementById: () => ({ style: {} }) },
    ResizeObserver: class { observe() {} },
  };
  runInNewContext(script, context);
  return { context, messages, get resets() { return resets; } };
}

test('a new submit after a timeout resets the native widget and receives a token', () => {
  const widget = nativeWidget();
  widget.context.window.__execute(1);
  assert.equal(widget.messages.filter(m => m.token).length, 0);
  widget.context.window.__execute(2);
  assert.equal(widget.messages.at(-1).token, 'retry-token');
  assert.equal(widget.resets, 2);
});

test('repeating the same signal does not reset an in-progress challenge', () => {
  const widget = nativeWidget();
  widget.context.window.__execute(1);
  const resets = widget.resets;
  widget.context.window.__execute(1);
  assert.equal(widget.resets, resets);
});

// Execute the actual form's wait policy without mounting the whole auth page.
function webSubmit({ token = null, firstError = false, interactive = false, erroredBeforeSubmit = false } = {}) {
  const source = readFileSync(new URL('../../src/pages/AuthPage.jsx', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('  const resolveCaptchaPlan = async'), source.indexOf('  // A pricing visitor'));
  let requests = 0;
  let waits = 0;
  const deps = {
    TURNSTILE_SITE_KEY: 'test-site', CAPTCHA_SUBMIT_ATTEMPTS,
    captchaRetryAfterWait, captchaSubmitPlan, shouldResetCaptcha,
    captchaTokenRef: { current: token }, captchaBlockedRef: { current: false }, captchaErroredRef: { current: erroredBeforeSubmit },
    captchaInteractiveRef: { current: false },
    requestCaptcha: () => { requests++; deps.captchaTokenRef.current = null; deps.captchaInteractiveRef.current = false; },
    waitForCaptchaAttempt: async () => {
      waits++;
      deps.captchaErroredRef.current = firstError && waits === 1;
      deps.captchaInteractiveRef.current = interactive;
      return null;
    },
  };
  const submit = new Function('deps', `const { ${Object.keys(deps).join(', ')} } = deps; ${body}; return resolveCaptchaPlan;`)(deps);
  return { submit, get requests() { return requests; }, get waits() { return waits; } };
}

test('a late token is used on the next submit without clearing or resetting it', async () => {
  const form = webSubmit({ token: 'late-token' });
  assert.equal(await form.submit('login'), 'ready');
  assert.equal(form.requests, 0);
  assert.equal(form.waits, 0);
});

test('sign-in waits once on the same challenge, then stops without resetting it', async () => {
  const form = webSubmit();
  assert.equal(await form.submit('login'), 'unavailable');
  // The widget started its check on load. Submit keeps waiting on it.
  assert.equal(form.requests, 0);
  assert.equal(form.waits, 1);
});

test('signup keeps its two short waits before signup-bypass', async () => {
  const form = webSubmit();
  assert.equal(await form.submit('signup'), 'bypass');
  assert.equal(form.requests, 0);
  assert.equal(form.waits, 2);
});

test('an untapped checkbox is not waited on a second time', async () => {
  const form = webSubmit({ interactive: true });
  assert.equal(await form.submit('signup'), 'bypass');
  assert.equal(form.waits, 1);
});

test('a widget error permits a fresh challenge within the same submit', async () => {
  const form = webSubmit({ firstError: true });
  assert.equal(await form.submit('login'), 'unavailable');
  assert.equal(form.requests, 1);
});

test('a widget that errored before the click gets a fresh challenge on the first attempt', async () => {
  const form = webSubmit({ erroredBeforeSubmit: true });
  assert.equal(await form.submit('login'), 'unavailable');
  assert.equal(form.requests, 1);
});

// The page's real wait loop, run against a fake clock.
function webWait() {
  const source = readFileSync(new URL('../../src/pages/AuthPage.jsx', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('  const waitForCaptchaAttempt = '), source.indexOf('  const requestCaptcha = '));
  const deps = {
    captchaWaitOver,
    captchaTokenRef: { current: null }, captchaBlockedRef: { current: false },
    captchaErroredRef: { current: false }, captchaInteractiveRef: { current: false },
  };
  const wait = new Function('deps', `const { ${Object.keys(deps).join(', ')} } = deps; ${body}; return waitForCaptchaAttempt;`)(deps);
  return { wait, deps };
}

async function settled(promise) {
  let done = false;
  promise.then(() => { done = true; });
  await Promise.resolve();
  await Promise.resolve();
  return done;
}

test('sign-in keeps waiting past the old 16 seconds for a slow check', async (t) => {
  mock.timers.enable({ apis: ['setInterval', 'Date'] });
  t.after(() => mock.timers.reset());
  const { wait, deps } = webWait();
  const pending = wait('login');
  mock.timers.tick(CAPTCHA_TOKEN_WAIT_MS * 2 + 4000);
  assert.equal(await settled(pending), false);
  deps.captchaTokenRef.current = 'slow-token';
  mock.timers.tick(50);
  assert.equal(await pending, 'slow-token');
});

test('sign-in gives up after the no-fallback wait when nothing happens', async (t) => {
  mock.timers.enable({ apis: ['setInterval', 'Date'] });
  t.after(() => mock.timers.reset());
  const { wait } = webWait();
  const pending = wait('forgot');
  mock.timers.tick(CAPTCHA_NO_FALLBACK_WAIT_MS + 50);
  assert.equal(await pending, null);
});

test('an on-screen checkbox gets the long wait, even past the sign-in limit', async (t) => {
  mock.timers.enable({ apis: ['setInterval', 'Date'] });
  t.after(() => mock.timers.reset());
  const { wait, deps } = webWait();
  const pending = wait('login');
  deps.captchaInteractiveRef.current = true;
  mock.timers.tick(CAPTCHA_NO_FALLBACK_WAIT_MS + 10000);
  assert.equal(await settled(pending), false);
  mock.timers.tick(CAPTCHA_INTERACTIVE_WAIT_MS);
  assert.equal(await pending, null);
});

test('signup still stops after the short wait', async (t) => {
  mock.timers.enable({ apis: ['setInterval', 'Date'] });
  t.after(() => mock.timers.reset());
  const { wait } = webWait();
  const pending = wait('signup');
  mock.timers.tick(CAPTCHA_TOKEN_WAIT_MS + 50);
  assert.equal(await pending, null);
});
