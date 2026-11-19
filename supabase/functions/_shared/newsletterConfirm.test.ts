import { assertEquals, assertMatch, assertNotEquals } from 'jsr:@std/assert@1';
import {
  CONFIRM_RESEND_MS,
  CONFIRM_TTL_MS,
  confirmMail,
  confirmState,
  confirmUrl,
  newConfirmToken,
  reusableToken,
  subscribeAction,
} from './newsletterConfirm.ts';

const NOW = Date.parse('2026-11-18T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const row = (status: string, sentAgo: number | null, token: string | null = 'tok') => ({
  status,
  confirm_sent_at: sentAgo === null ? null : ago(sentAgo),
  confirm_token: token,
});

Deno.test('a new address gets a pending row and a link', () => {
  assertEquals(subscribeAction(null, NOW), 'create');
});

Deno.test('an active or bounced address is never emailed again', () => {
  assertEquals(subscribeAction(row('active', null, null), NOW), 'skip');
  assertEquals(subscribeAction(row('bounced', null, null), NOW), 'skip');
});

Deno.test('pending and unsubscribed addresses get a link, at most once an hour', () => {
  assertEquals(subscribeAction(row('pending', 5 * 60 * 1000), NOW), 'skip');
  assertEquals(subscribeAction(row('pending', CONFIRM_RESEND_MS + 1), NOW), 'send');
  assertEquals(subscribeAction(row('unsubscribed', null, null), NOW), 'send');
  assertEquals(subscribeAction(row('unsubscribed', 60 * 1000), NOW), 'skip');
});

Deno.test('an earlier link keeps working while it is valid', () => {
  assertEquals(reusableToken(row('pending', CONFIRM_RESEND_MS + 1), NOW), 'tok');
  assertEquals(reusableToken(row('pending', CONFIRM_TTL_MS + 1), NOW), null);
  assertEquals(reusableToken(row('pending', null), NOW), null);
  assertEquals(reusableToken(null, NOW), null);
});

Deno.test('confirmState accepts only a live link on a pending or unsubscribed row', () => {
  assertEquals(confirmState(row('pending', 60 * 1000), NOW), 'ok');
  assertEquals(confirmState(row('unsubscribed', 60 * 1000), NOW), 'ok');
  assertEquals(confirmState(row('pending', CONFIRM_TTL_MS), NOW), 'expired');
  assertEquals(confirmState(row('pending', null), NOW), 'expired');
  assertEquals(confirmState(row('bounced', 60 * 1000), NOW), 'invalid');
  assertEquals(confirmState(row('active', 60 * 1000), NOW), 'invalid');
  assertEquals(confirmState(row('pending', 60 * 1000, null), NOW), 'invalid');
  assertEquals(confirmState(null, NOW), 'invalid');
});

Deno.test('tokens are long, hex and unique', () => {
  const a = newConfirmToken();
  assertMatch(a, /^[0-9a-f]{48}$/);
  assertNotEquals(a, newConfirmToken());
});

Deno.test('the link opens the web app page with the token encoded', () => {
  assertEquals(confirmUrl('https://app.theplot.tv/', 'abc'), 'https://app.theplot.tv/newsletter/confirm?token=abc');
  assertEquals(confirmUrl('http://localhost:5177', 'a b'), 'http://localhost:5177/newsletter/confirm?token=a+b');
});

Deno.test('the email carries the link and no em dash', () => {
  const mail = confirmMail('https://app.theplot.tv/newsletter/confirm?token=abc');
  assertEquals(mail.text.includes('https://app.theplot.tv/newsletter/confirm?token=abc'), true);
  assertEquals(/—/.test(mail.subject + mail.text), false);
  assertEquals(mail.subject, 'Confirm your Plot Digest subscription');
  assertEquals(mail.text.startsWith('Someone, hopefully you, asked to get the Plot Digest at this address.'), true);
});
