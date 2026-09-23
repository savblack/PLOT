import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { premiumPlansPath, safeAppReturnPath } from '../../src/utils/premiumExplore.js';

describe('safeAppReturnPath', () => {
  it('keeps rooted app paths', () => {
    assert.equal(safeAppReturnPath('/my-lists'), '/my-lists');
    assert.equal(safeAppReturnPath('/settings?section=billing'), '/settings?section=billing');
  });

  it('rejects external or protocol-relative targets', () => {
    assert.equal(safeAppReturnPath('https://evil.example/x'), '/');
    assert.equal(safeAppReturnPath('//evil.example/x'), '/');
    assert.equal(safeAppReturnPath('javascript:alert(1)'), '/');
    assert.equal(safeAppReturnPath('settings'), '/');
  });

  it('honours a null fallback for optional return links', () => {
    assert.equal(safeAppReturnPath(null, null), null);
    assert.equal(safeAppReturnPath('nope', null), null);
  });
});

describe('premiumPlansPath', () => {
  it('omits from when absent or unsafe', () => {
    assert.equal(premiumPlansPath(), '/plans');
    assert.equal(premiumPlansPath('https://evil.example'), '/plans');
  });

  it('encodes a safe return path', () => {
    assert.equal(
      premiumPlansPath('/settings?section=connections'),
      '/plans?from=%2Fsettings%3Fsection%3Dconnections',
    );
  });
});
