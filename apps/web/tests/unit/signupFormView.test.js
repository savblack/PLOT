import assert from 'node:assert/strict';
import test from 'node:test';
import { SIGNUP_VIEW_INTERACTIONS, isHumanInteraction, watchForHumanView } from '../../src/utils/signupFormView.js';

function fakeTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
    fire(type, isTrusted = true) { listeners.get(type)?.({ type, isTrusted }); },
  };
}

const trustedOnly = (event) => Boolean(event?.isTrusted);

test('a page load alone never counts as a view', () => {
  const target = fakeTarget();
  const views = [];
  watchForHumanView({ target, onView: (t) => views.push(t), isHuman: trustedOnly });
  assert.deepEqual(views, []);
  assert.equal(target.listeners.size, SIGNUP_VIEW_INTERACTIONS.length);
});

test('the first trusted interaction counts once, then listening stops', () => {
  const target = fakeTarget();
  const views = [];
  watchForHumanView({ target, onView: (t) => views.push(t), isHuman: trustedOnly });
  target.fire('pointermove');
  target.fire('keydown');
  target.fire('touchstart');
  assert.deepEqual(views, ['pointermove']);
  assert.equal(target.listeners.size, 0);
});

test('synthetic events do not count', () => {
  const target = fakeTarget();
  const views = [];
  watchForHumanView({ target, onView: (t) => views.push(t), isHuman: trustedOnly });
  target.fire('pointerdown', false);
  target.fire('keydown', false);
  assert.deepEqual(views, []);
});

test('cleanup before any interaction means no view', () => {
  const target = fakeTarget();
  const views = [];
  const stop = watchForHumanView({ target, onView: (t) => views.push(t), isHuman: trustedOnly });
  stop();
  target.fire('pointerdown');
  assert.deepEqual(views, []);
  assert.equal(target.listeners.size, 0);
});

test('scroll and focus are not treated as a person', () => {
  assert.equal(SIGNUP_VIEW_INTERACTIONS.includes('scroll'), false);
  assert.equal(SIGNUP_VIEW_INTERACTIONS.includes('focusin'), false);
});

test('a hidden tab does not count', () => {
  assert.equal(isHumanInteraction({ isTrusted: true }, 'hidden'), false);
  assert.equal(isHumanInteraction({ isTrusted: true }, 'visible'), true);
  assert.equal(isHumanInteraction({ isTrusted: false }, 'visible'), false);
});

test('no window or no callback is a safe no-op', () => {
  assert.equal(typeof watchForHumanView({ onView: () => {}, target: undefined }), 'function');
  assert.equal(typeof watchForHumanView({ target: fakeTarget() }), 'function');
});
