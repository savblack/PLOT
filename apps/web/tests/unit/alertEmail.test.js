import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALERT_EMAIL_TEXT, APP_ORIGIN, MANAGE_URL, NOTIFICATIONS_URL, REGISTERED_ADDRESS, UNSUBSCRIBE_PAGE_PATH,
  alertLinks, buildAlertEmail, emailSubject, escapeHtml, itemBadge, itemPhrase,
} from '../../../../supabase/functions/_shared/alertEmail.js';
import { titleBadge, titlePhrase } from '../../../../packages/core/copy/notifications.js';

// The email for streaming alerts. Titles and provider names come from TMDB and
// the person's own data, so most of these are about hostile or odd input.
// Titles here are fictional.

const UNSUB = 'https://example.supabase.co/functions/v1/alert-email-unsubscribe?token=abc.def.ghi';
const links = { unsubscribeUrl: UNSUB };
const streaming = { media_title: 'Harbour Lights', release_kind: 'streaming', provider_name: 'Service One', media_poster_path: '/abc123.jpg' };
const free = { media_title: 'Salt Lake Drive', release_kind: 'free', provider_name: 'Service Two', media_poster_path: null };

test('the wording mirrors the in-app notification exactly, for every kind', () => {
  // Edge Functions cannot import packages/core, so the email carries its own
  // copy of this wording; this keeps the two from drifting apart.
  for (const row of [
    { type: 'streaming_arrival', release_kind: 'streaming', provider_name: 'Service One' },
    { type: 'streaming_arrival', release_kind: 'free', provider_name: 'Service Two' },
    { type: 'streaming_arrival', release_kind: 'streaming', provider_name: null },
    { type: 'streaming_arrival', release_kind: 'free', provider_name: null },
    { type: 'streaming_arrival', release_kind: null, provider_name: 'Service One' },
  ]) {
    assert.equal(itemPhrase(row), titlePhrase(row));
    assert.equal(itemBadge(row), titleBadge(row));
  }
});

test('one film gets a subject of its own; several share one subject with the count', () => {
  assert.equal(emailSubject([streaming]), 'Harbour Lights is on Service One now');
  assert.equal(emailSubject([free]), 'Salt Lake Drive is free to watch on Service Two now');
  assert.equal(emailSubject([streaming, free]), '2 films on your watchlist have new streaming news');
  assert.equal(emailSubject([{ ...streaming, media_title: null }]), 'A film on your watchlist is on Service One now');
});

test('a subject can never carry a line break, so a title cannot inject headers', () => {
  const subject = emailSubject([{ ...streaming, media_title: 'Evil\r\nBcc: someone@example.com', provider_name: 'A\nB' }]);
  assert.doesNotMatch(subject, /[\r\n]/);
  assert.match(subject, /Evil Bcc: someone@example.com is on A B now/);
});

test('every value that reaches the HTML is escaped', () => {
  const hostile = { media_title: '<script>alert(1)</script> & "quotes"', release_kind: 'streaming', provider_name: '<img src=x onerror=alert(2)>', media_poster_path: null };
  const { html } = buildAlertEmail([hostile], links);
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;quotes&quot;/);
  assert.equal(escapeHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
  assert.equal(escapeHtml(null), '');
});

test('a poster is only used when its path is a plain TMDB path', () => {
  assert.match(buildAlertEmail([streaming], links).html, /src="https:\/\/image\.tmdb\.org\/t\/p\/w154\/abc123\.jpg"/);
  for (const bad of ['javascript:alert(1)', '/a/b.jpg', 'https://evil.example/x.jpg', '/x" onerror="y', '', null, undefined]) {
    assert.doesNotMatch(buildAlertEmail([{ ...streaming, media_poster_path: bad }], links).html, /<img /);
  }
});

test('the email carries the unsubscribe link, the manage link, the registered address and the TMDB attribution', () => {
  const { html, text } = buildAlertEmail([streaming, free], links);
  for (const body of [html, text]) {
    assert.ok(body.includes(UNSUB.replace(/&/g, body === html ? '&amp;' : '&')) || body.includes(UNSUB), 'unsubscribe link');
    assert.ok(body.includes(MANAGE_URL), 'manage link');
    assert.ok(body.includes(NOTIFICATIONS_URL), 'open link');
    assert.ok(body.includes(REGISTERED_ADDRESS), 'registered address');
    assert.ok(body.includes(ALERT_EMAIL_TEXT.tmdb), 'TMDB attribution');
    assert.ok(body.includes(ALERT_EMAIL_TEXT.reason), 'why they got it');
  }
  assert.match(REGISTERED_ADDRESS, /Surry Hills, NSW 2010/);
});

test('the links point at the verified app origin and real routes', () => {
  assert.equal(APP_ORIGIN, 'https://app.theplot.tv');
  assert.equal(NOTIFICATIONS_URL, 'https://app.theplot.tv/notifications');
  assert.equal(MANAGE_URL, 'https://app.theplot.tv/settings?section=viewing');
});

test('a link that is not http(s), or not a URL at all, is refused rather than written into the email', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'not a url', '', 'ftp://example.com/x']) {
    assert.throws(() => buildAlertEmail([streaming], { unsubscribeUrl: bad }), /unsubscribeUrl/);
  }
  assert.throws(() => buildAlertEmail([streaming], { unsubscribeUrl: UNSUB, manageUrl: 'javascript:1' }), /manageUrl/);
  assert.throws(() => buildAlertEmail([streaming], { unsubscribeUrl: UNSUB, appUrl: 'x' }), /appUrl/);
});

test('an email with nothing in it is refused', () => {
  assert.throws(() => buildAlertEmail([], links), /at least one/);
  assert.throws(() => buildAlertEmail(undefined, links), /at least one/);
});

test('the copy has no em dashes, and does not promise push or a phone notification', () => {
  const { html, text, subject } = buildAlertEmail([streaming, free], links);
  for (const body of [html, text, subject, ...Object.values(ALERT_EMAIL_TEXT).filter(v => typeof v === 'string')]) {
    assert.doesNotMatch(body, /—/);
    assert.doesNotMatch(body, /\b(push|phone|sms)\b/i);
  }
});

test('the plain-text version lists every film with its badge', () => {
  const { text } = buildAlertEmail([streaming, free], links);
  assert.match(text, /Now streaming: Harbour Lights is on Service One now/);
  assert.match(text, /Now free: Salt Lake Drive is free to watch on Service Two now/);
});

test('alertLinks puts all three links on the app origin, with the visible Unsubscribe link on the web page', () => {
  const links = alertLinks('https://app.theplot.tv', 'abc.def.ghi');
  assert.deepEqual(links, {
    unsubscribeUrl: 'https://app.theplot.tv/email/unsubscribe?token=abc.def.ghi',
    manageUrl: 'https://app.theplot.tv/settings?section=viewing',
    appUrl: 'https://app.theplot.tv/notifications',
  });
  assert.equal(UNSUBSCRIBE_PAGE_PATH, '/email/unsubscribe');
  // The default links agree with the exported constants, so they cannot drift.
  assert.equal(alertLinks(APP_ORIGIN, 't').manageUrl, MANAGE_URL);
  assert.equal(alertLinks(APP_ORIGIN, 't').appUrl, NOTIFICATIONS_URL);
});

test('alertLinks uses only the origin (a stray path or query is dropped), encodes the token, and allows a preview origin', () => {
  const links = alertLinks('https://feat-example.plot-5wr.pages.dev/some/path?x=1', 'a b&c');
  assert.equal(links.unsubscribeUrl, 'https://feat-example.plot-5wr.pages.dev/email/unsubscribe?token=a%20b%26c');
  assert.ok(links.manageUrl.startsWith('https://feat-example.plot-5wr.pages.dev/settings'));
});

test('alertLinks refuses an origin that is not http(s) or not a URL', () => {
  for (const bad of ['javascript:alert(1)', 'ftp://example.com', 'not a url', '', undefined]) {
    assert.throws(() => alertLinks(bad, 't'), /appOrigin/);
  }
});

test('an email built from alertLinks sends the visible Unsubscribe link to the web page, not a function URL', () => {
  const { html, text } = buildAlertEmail([streaming], alertLinks(APP_ORIGIN, 'abc.def.ghi'));
  for (const body of [html, text]) {
    assert.ok(body.includes('https://app.theplot.tv/email/unsubscribe?token=abc.def.ghi'));
    assert.ok(!body.includes('/functions/v1/'), 'no raw function URL in the body');
  }
});
