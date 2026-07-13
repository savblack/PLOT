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
    headers: { Authorization: `Bearer ${session.access_token}` },
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
