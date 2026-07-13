export async function parseExportError(response) {
  const fallback = 'Failed to export your data.';

  try {
    const payload = await response.json();
    if (payload?.error) return payload.error;
  } catch {
    // Fall through to raw text if the response body is not JSON.
  }

  try {
    const text = await response.text();
    if (text) return text;
  } catch {
    // Keep the default message when the response body cannot be read.
  }

  return fallback;
}

export async function fetchUserDataExport({
  supabase,
  fetchImpl,
  exportUrl,
}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return {
      ok: false,
      error: 'Your session has expired. Please sign in again before exporting your data.',
    };
  }

  if (!exportUrl) {
    return {
      ok: false,
      error: 'Data export is not configured in this environment.',
    };
  }

  const response = await fetchImpl(exportUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (!response.ok) {
    return { ok: false, error: await parseExportError(response) };
  }

  const payload = await response.json();
  return { ok: true, payload };
}

export function exportFilename(date = new Date()) {
  const stamp = date.toISOString().slice(0, 10);
  return `plot-data-export-${stamp}.json`;
}

export function downloadDataExport(payload, filename = exportFilename()) {
  const content = JSON.stringify(payload, null, 2);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
