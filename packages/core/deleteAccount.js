/* Account deletion, shared by both apps.
 *
 * The `delete-account` edge function requires `confirmationPhrase` in the body
 * and 400s without it — a deliberate server-side guard so a misclick or a UI
 * bug can't delete an account, and so it can't be skipped by calling the API
 * directly. Mobile previously POSTed with no body at all and therefore always
 * hit that 400, showing "Delete failed" no matter what the user did.
 *
 * Callers inject `supabase`, `fetchImpl` and `deleteAccountUrl` so this stays
 * platform-agnostic and testable without a live client.
 */

/** @param {{ json: () => Promise<any>, text: () => Promise<string> }} response */
export async function parseDeleteAccountError(response) {
  let message = 'Failed to delete your account.';

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

  return message;
}

export async function deleteAccountAndSignOut({
  supabase,
  fetchImpl,
  deleteAccountUrl,
  confirmationPhrase,
  onDeleted = async () => {},
}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return {
      ok: false,
      error: 'Your session has expired. Please sign in again before deleting your account.',
    };
  }

  if (!deleteAccountUrl) {
    return {
      ok: false,
      error: 'Delete account is not configured in this environment.',
    };
  }

  const response = await fetchImpl(deleteAccountUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmationPhrase }),
  });

  if (!response.ok) {
    return {
      ok: false,
      error: await parseDeleteAccountError(response),
    };
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    return {
      ok: false,
      error: error.message || 'Your account was deleted, but sign out did not complete cleanly.',
    };
  }

  await onDeleted();
  return { ok: true };
}
