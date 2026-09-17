import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../../../website/js/premium-home.js', import.meta.url), 'utf8');

function fixture({ reducedMotion = false } = {}) {
  const element = () => ({
    listeners: {}, attrs: {}, inert: false,
    classList: { add() {}, remove() {} },
    setAttribute(name, value) { this.attrs[name] = value; },
    removeAttribute(name) { delete this.attrs[name]; },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    animate() {},
  });
  const copies = Array.from({ length: 3 }, element);
  const visuals = Array.from({ length: 3 }, element);
  const buttons = Array.from({ length: 3 }, element);
  const switcher = { hidden: true, querySelectorAll: () => buttons };
  const panel = Object.assign(element(), {
    hovered: false,
    querySelectorAll: selector => selector.startsWith('img') ? [] : selector.includes('copy') ? copies : visuals,
    querySelector: () => switcher,
    matches() { return this.hovered; },
    contains: el => buttons.includes(el),
  });
  const document = Object.assign(element(), { hidden: false, activeElement: null, getElementById: () => panel });
  const media = Object.assign(element(), { matches: reducedMotion });
  const timers = new Map();
  let sequence = 0;
  let intersection;
  runInNewContext(script, {
    document,
    window: {
      matchMedia: () => media,
      setTimeout: callback => { timers.set(++sequence, callback); return sequence; },
      clearTimeout: id => timers.delete(id),
    },
    IntersectionObserver: class {
      constructor(callback) { intersection = callback; }
      observe() {}
    },
  });
  return { buttons, copies, visuals, panel, document, media, switcher, timers,
    visible(value) { intersection([{ isIntersecting: value }]); },
    tick() { const [id, callback] = timers.entries().next().value; timers.delete(id); callback(); },
  };
}

test('Premium rotation synchronizes copy, visual, selection and wraps', () => {
  const f = fixture();
  assert.equal(f.switcher.hidden, false);
  assert.equal(f.timers.size, 0);
  f.visible(true);
  for (const index of [1, 2, 0]) {
    f.tick();
    assert.equal(f.buttons[index].attrs['aria-pressed'], 'true');
    assert.equal(f.copies[index].inert, false);
    assert.equal(f.visuals[index].inert, false);
    assert.equal(f.copies[(index + 2) % 3].attrs['aria-hidden'], 'true');
    assert.equal(f.timers.size, 1);
  }
});

test('Hover, keyboard focus, hidden tab and offscreen stop rotation', () => {
  const f = fixture();
  f.visible(true);
  f.panel.hovered = true;
  f.panel.listeners.mouseenter();
  assert.equal(f.timers.size, 0);
  f.buttons[2].listeners.click();
  assert.equal(f.buttons[2].attrs['aria-pressed'], 'true');
  assert.equal(f.timers.size, 0);
  f.panel.hovered = false;
  f.panel.listeners.mouseleave();
  assert.equal(f.timers.size, 1);
  f.document.activeElement = f.buttons[2];
  f.panel.listeners.focusin();
  assert.equal(f.timers.size, 0);
  f.document.activeElement = null;
  f.document.hidden = true;
  f.document.listeners.visibilitychange();
  assert.equal(f.timers.size, 0);
  f.document.hidden = false;
  f.document.listeners.visibilitychange();
  assert.equal(f.timers.size, 1);
  f.visible(false);
  assert.equal(f.timers.size, 0);
});

test('Reduced motion keeps manual navigation without automatic switching', () => {
  const f = fixture({ reducedMotion: true });
  f.visible(true);
  assert.equal(f.timers.size, 0);
  f.buttons[1].listeners.click();
  assert.equal(f.buttons[1].attrs['aria-pressed'], 'true');
  assert.equal(f.visuals[1].inert, false);
  assert.equal(f.timers.size, 0);
});

test('Marketing film example matches its verified Australian filters', () => {
  const evidence = JSON.parse(readFileSync(new URL('../../../../docs/research/premium-example-evidence.json', import.meta.url), 'utf8'));
  const html = readFileSync(new URL('../../../website/index.html', import.meta.url), 'utf8');
  assert.equal(evidence.region, 'AU');
  assert.ok(evidence.tonight.runtime <= 120);
  assert.ok(evidence.tonight.genres.some(genre => genre.name === 'Comedy'));
  assert.ok(evidence.tonight.providers.some(provider => provider.provider_name === 'Disney Plus'));
  // The redesigned picker (#942) marks the chosen option with .premium-on and
  // states the verification in the storyboard's aria-label rather than a caption.
  assert.ok(html.includes('<span class="premium-on"><b class="premium-k">120 min</b>'));
  assert.ok(html.includes('<span class="premium-on"><b class="premium-k">Disney+</b>'));
  assert.ok(html.includes(`${evidence.tonight.runtime} min · Disney+`));
  assert.ok(html.includes(evidence.tonight.poster_path));
  assert.ok(html.includes('Australian example verified 17 September 2026'));
  for (const person of ['Cillian Murphy', 'Greta Gerwig']) {
    assert.ok(html.includes(evidence.artwork[person].profile_path));
  }
  assert.equal(evidence.following.actor[0].character, 'Tommy Shelby');
  assert.equal(evidence.following.director[0].job, 'Director');
  assert.ok(html.includes(evidence.following.actor[0].title));
  assert.ok(html.includes('Example alert'));
});
