import assert from 'node:assert/strict';
import test from 'node:test';
import { getButtonLikeProps, handleActivationKeyDown } from '../../src/utils/interactive.js';

test('handleActivationKeyDown activates on Enter and Space for the focused surface', () => {
  let activations = 0;
  const currentTarget = {};

  const enterEvent = {
    key: 'Enter',
    currentTarget,
    target: currentTarget,
    defaultPrevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };

  handleActivationKeyDown(enterEvent, () => {
    activations += 1;
  });

  const spaceEvent = {
    key: ' ',
    currentTarget,
    target: currentTarget,
    defaultPrevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };

  handleActivationKeyDown(spaceEvent, () => {
    activations += 1;
  });

  assert.equal(activations, 2);
  assert.equal(enterEvent.prevented, true);
  assert.equal(spaceEvent.prevented, true);
});

test('handleActivationKeyDown ignores nested controls and unrelated keys', () => {
  let activations = 0;
  const currentTarget = {};

  handleActivationKeyDown({
    key: 'Enter',
    currentTarget,
    target: {},
    defaultPrevented: false,
    preventDefault() {},
  }, () => {
    activations += 1;
  });

  handleActivationKeyDown({
    key: 'Escape',
    currentTarget,
    target: currentTarget,
    defaultPrevented: false,
    preventDefault() {},
  }, () => {
    activations += 1;
  });

  assert.equal(activations, 0);
});

test('getButtonLikeProps omits keyboard focusability when disabled', () => {
  const enabled = getButtonLikeProps({ onPress: () => {}, label: 'Open details' });
  const disabled = getButtonLikeProps({ onPress: () => {}, disabled: true, label: 'Open details' });

  assert.equal(enabled.role, 'button');
  assert.equal(enabled.tabIndex, 0);
  assert.equal(typeof enabled.onKeyDown, 'function');
  assert.equal(enabled['aria-label'], 'Open details');

  assert.equal(disabled.role, undefined);
  assert.equal(disabled.tabIndex, undefined);
  assert.equal(disabled.onKeyDown, undefined);
  assert.equal(disabled['aria-disabled'], true);
});
