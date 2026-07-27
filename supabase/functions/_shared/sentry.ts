// Minimal Sentry capture over plain fetch — the official SDKs assume Node/
// browser globals that don't reliably exist in this Deno edge runtime, and
// these functions only need "tell me when it broke," not full tracing.
export async function captureSentryError(source: string, error: unknown, extra?: Record<string, unknown>) {
  const dsn = Deno.env.get('SENTRY_DSN')
  if (!dsn) return
  const match = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(.+)$/)
  if (!match) return
  const [, publicKey, host, projectId] = match
  try {
    await fetch(`https://${host}/api/${projectId}/store/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=plot-edge-function/1.0`,
      },
      body: JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
        level: 'error',
        extra,
        tags: { runtime: 'supabase-edge-function', function: source },
      }),
    })
  } catch { /* telemetry is best-effort; never let it fail the job */ }
}
