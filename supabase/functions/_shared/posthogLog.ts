/**
 * Best-effort warn and error lines for PostHog Logs.
 *
 * One OTLP/HTTP JSON record goes to the US logs endpoint, and the same string
 * is written to the function log. Delivery is scheduled with EdgeRuntime.waitUntil
 * when the runtime provides it. A PostHog failure is swallowed and never changes
 * the response the function was already going to send.
 *
 * Callers own the message. Do not pass emails, tokens, request bodies, or
 * payment payloads. distinctId is the Plot user id when the function already
 * has one. It is sent as posthogDistinctId so the line shows on that person.
 * An address is never accepted as a distinct id.
 */
const POSTHOG_TOKEN = 'phc_uS3JEJC7s6T2WdsQToCZA3eRjLNakgc3EF3YPbza9Q6U';
const LOGS_ENDPOINT = 'https://us.i.posthog.com/i/v1/logs';

const SEVERITY = {
  warn: { number: 13, text: 'WARN' },
  error: { number: 17, text: 'ERROR' },
} as const;

export type LogLevel = keyof typeof SEVERITY;
export type LogAttribute = string | number | boolean;

type LogOptions = {
  distinctId?: string | null;
  attributes?: Record<string, LogAttribute | null | undefined>;
};

type AnyValue =
  | { stringValue: string }
  | { boolValue: boolean }
  | { intValue: string }
  | { doubleValue: number };

export function errorText(value: unknown): string {
  if (typeof value === 'string' && value) return value.slice(0, 500);
  if (value instanceof Error && value.message) return value.message.slice(0, 500);
  if (value && typeof value === 'object' && 'message' in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message.slice(0, 500);
  }
  return 'unknown error';
}

function deploymentEnvironment(): string {
  let url = '';
  try {
    url = Deno.env.get('SUPABASE_URL') ?? '';
  } catch {
    url = '';
  }
  if (url.includes('mkegtssedjyqldysvzga')) return 'production';
  if (url.includes('uzrhfivnhdcfieuaxzip')) return 'staging';
  return 'unknown';
}

function personId(value: string | null | undefined): string | null {
  if (!value) return null;
  const id = value.trim();
  if (!id || id.length > 80 || /\s|@/.test(id)) return null;
  return id;
}

function attributeValue(value: LogAttribute): AnyValue | null {
  if (typeof value === 'boolean') return { boolValue: value };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    if (Number.isInteger(value)) return { intValue: String(value) };
    return { doubleValue: value };
  }
  const text = value.trim().slice(0, 500);
  if (!text || text.includes('@')) return null;
  return { stringValue: text };
}

export function otlpLogsBody(
  service: string,
  level: LogLevel,
  message: string,
  options: LogOptions = {},
  timeUnixNano = `${BigInt(Date.now()) * 1000000n}`,
): { resourceLogs: unknown[] } {
  const severity = SEVERITY[level];
  const attributes: { key: string; value: AnyValue }[] = [];
  const distinctId = personId(options.distinctId);
  if (distinctId) attributes.push({ key: 'posthogDistinctId', value: { stringValue: distinctId } });
  for (const [key, raw] of Object.entries(options.attributes ?? {})) {
    if (attributes.length >= 12) break;
    if (!/^[a-zA-Z][a-zA-Z0-9_.]{0,40}$/.test(key)) continue;
    if (raw === null || raw === undefined) continue;
    const value = attributeValue(raw);
    if (value) attributes.push({ key, value });
  }
  const serviceName = /^[a-z0-9-]{1,64}$/.test(service) ? service : 'plot-edge';
  return {
    resourceLogs: [{
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: serviceName } },
          { key: 'deployment.environment.name', value: { stringValue: deploymentEnvironment() } },
        ],
      },
      scopeLogs: [{
        logRecords: [{
          timeUnixNano,
          severityNumber: severity.number,
          severityText: severity.text,
          body: { stringValue: message.slice(0, 2000) },
          attributes,
        }],
      }],
    }],
  };
}

function schedule(task: Promise<void>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (typeof runtime?.waitUntil === 'function') runtime.waitUntil(task);
  else void task;
}

export function reportLog(service: string, level: LogLevel, message: string, options?: LogOptions) {
  if (level === 'warn') console.warn(message);
  else console.error(message);
  try {
    const body = JSON.stringify(otlpLogsBody(service, level, message, options));
    const send = fetch(LOGS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${POSTHOG_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body,
      signal: AbortSignal.timeout(3000),
    }).then((response) => {
      void response.body?.cancel();
    }).catch(() => {});
    schedule(send);
  } catch {
    // The function log above already has the line. Delivery must not change the response.
  }
}
