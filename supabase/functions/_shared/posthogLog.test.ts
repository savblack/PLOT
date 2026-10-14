import { errorText, otlpLogsBody, reportLog } from './posthogLog.ts';

function equal(actual: unknown, expected: unknown) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Expected ${right}, got ${left}`);
}

type AnyValue = { stringValue?: string; intValue?: string; boolValue?: boolean };

function recordOf(service: string, level: 'warn' | 'error', message: string, options?: {
  distinctId?: string | null;
  attributes?: Record<string, string | number | boolean | null | undefined>;
}) {
  const body = otlpLogsBody(service, level, message, options, '1000');
  const resourceLogs = body.resourceLogs[0] as {
    resource: { attributes: { key: string; value: AnyValue }[] };
    scopeLogs: { logRecords: { severityNumber: number; severityText: string; body: AnyValue; attributes: { key: string; value: AnyValue }[] }[] }[];
  };
  return {
    resource: Object.fromEntries(resourceLogs.resource.attributes.map((item) => [item.key, item.value.stringValue])),
    record: resourceLogs.scopeLogs[0].logRecords[0],
  };
}

Deno.test('error text stays a short string', () => {
  equal(errorText(new Error('stripe down')), 'stripe down');
  equal(errorText({ message: 'db down' }), 'db down');
  equal(errorText({}), 'unknown error');
  equal(errorText('already text'), 'already text');
});

Deno.test('a log record names the function and the person', () => {
  const { resource, record } = recordOf('stripe-webhook', 'error', 'Handler failed', {
    distinctId: 'user-1',
    attributes: { event_type: 'invoice.paid', empty: null },
  });
  equal(resource['service.name'], 'stripe-webhook');
  if (!['production', 'staging', 'unknown'].includes(resource['deployment.environment.name'] ?? '')) {
    throw new Error(`Unexpected environment ${resource['deployment.environment.name']}`);
  }
  equal(record.severityNumber, 17);
  equal(record.severityText, 'ERROR');
  equal(record.body.stringValue, 'Handler failed');
  equal(record.attributes.map((item) => item.key), ['posthogDistinctId', 'event_type']);
  equal(record.attributes[0].value.stringValue, 'user-1');
  equal(record.attributes[1].value.stringValue, 'invoice.paid');
});

Deno.test('warn uses the warn severity', () => {
  const { record } = recordOf('brevo-lifecycle', 'warn', 'lookup failed');
  equal(record.severityNumber, 13);
  equal(record.severityText, 'WARN');
});

Deno.test('an email is not accepted as a person or an attribute', () => {
  const { record } = recordOf('newsletter-subscribe', 'error', 'Subscribe failed', {
    distinctId: 'reader@example.com',
    attributes: { detail: 'reader@example.com' },
  });
  equal(record.attributes, []);
});

Deno.test('reportLog mirrors the line and survives a delivery failure', async () => {
  const errors: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  const originalFetch = globalThis.fetch;
  let url = '';
  let authorization = '';
  globalThis.fetch = (input, init) => {
    url = String(input);
    authorization = new Headers(init?.headers).get('Authorization') ?? '';
    return Promise.reject(new Error('down'));
  };
  const waits: Promise<unknown>[] = [];
  const runtime = globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } };
  const originalRuntime = runtime.EdgeRuntime;
  runtime.EdgeRuntime = { waitUntil(p) { waits.push(p); } };
  try {
    reportLog('kofi-webhook', 'error', 'record failed', { distinctId: 'user-1' });
    equal(errors, [['record failed']]);
    equal(url, 'https://us.i.posthog.com/i/v1/logs');
    if (!authorization.startsWith('Bearer phc_')) throw new Error('Missing project token');
    equal(waits.length, 1);
    await waits[0];
  } finally {
    console.error = originalError;
    globalThis.fetch = originalFetch;
    runtime.EdgeRuntime = originalRuntime;
  }
});
