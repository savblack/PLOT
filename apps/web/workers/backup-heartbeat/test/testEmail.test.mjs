import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import worker, { TEST_EMAIL } from '../src/index.js';

// No BACKUPS binding: if the test-email branch ever fell through to the real
// check, listing R2 would throw and these tests would fail.
const ENV = {
  HEARTBEAT_TOKEN: 'tok',
  RESEND_API_KEY: 're_test',
  ALERT_FROM: 'Plot <hello@theplot.tv>',
  ALERT_EMAIL: 'ops@example.com',
};
const URL_TEST = 'https://backup-heartbeat.example.workers.dev/?test-email=1';
const req = (url, token) =>
  new Request(url, { headers: token ? { 'x-heartbeat-token': token } : {} });

const realFetch = globalThis.fetch;
let calls;
function stubResend(status, body = '{}') {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(body, { status });
  };
}
afterEach(() => {
  globalThis.fetch = realFetch;
});

test('without the token the test email is not sent and the URL reveals nothing', async () => {
  stubResend(200);
  const res = await worker.fetch(req(URL_TEST, 'wrong'), ENV);
  assert.equal(res.status, 404);
  assert.equal(calls.length, 0);
});

test('?test-email=1 sends one test email on the alarm path, and nothing else', async () => {
  stubResend(200);
  const res = await worker.fetch(req(URL_TEST, 'tok'), ENV);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { sent: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer re_test');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.from, ENV.ALERT_FROM);
  assert.deepEqual(body.to, [ENV.ALERT_EMAIL]);
  assert.equal(body.subject, TEST_EMAIL.subject);
  assert.match(body.subject, /test/i);
});

test('a rejected key comes back as a failure, not a silent success', async () => {
  stubResend(401, '{"message":"API key is invalid"}');
  const original = console.error;
  console.error = () => {};
  try {
    const res = await worker.fetch(req(URL_TEST, 'tok'), ENV);
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { sent: false, error: 'resend 401' });
  } finally {
    console.error = original;
  }
});

test('the test email copy has no em dashes', () => {
  assert.doesNotMatch(TEST_EMAIL.subject + TEST_EMAIL.html, /—/);
});
