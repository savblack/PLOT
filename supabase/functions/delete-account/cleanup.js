export const ACCOUNT_CLEANUP_STEPS = Object.freeze([
  { table: 'integration_outbox', match: { type: 'eq', column: 'user_id' } },
  { table: 'integration_items', match: { type: 'eq', column: 'user_id' } },
  { table: 'media_integrations', match: { type: 'eq', column: 'user_id' } },
  { table: 'watching_progress', match: { type: 'eq', column: 'user_id' } },
  { table: 'reminders', match: { type: 'eq', column: 'user_id' } },
  { table: 'user_favourites', match: { type: 'eq', column: 'user_id' } },
  { table: 'user_top_lists', match: { type: 'eq', column: 'user_id' } },
  { table: 'user_custom_list_items', match: { type: 'eq', column: 'user_id' } },
  { table: 'user_custom_lists', match: { type: 'eq', column: 'user_id' } },
  { table: 'feedback', match: { type: 'eq', column: 'user_id' } },
  { table: 'history', match: { type: 'eq', column: 'user_id' } },
  { table: 'list_items', match: { type: 'eq', column: 'user_id' } },
  { table: 'lists', match: { type: 'eq', column: 'user_id' } },
  { table: 'history_board', match: { type: 'eq', column: 'user_id' }, optional: true },
  { table: 'follows', match: { type: 'or', columns: ['follower_id', 'following_id'] } },
  { table: 'profiles', match: { type: 'eq', column: 'id' } },
]);

export async function runAccountCleanup(supabaseClient, userId) {
  for (const step of ACCOUNT_CLEANUP_STEPS) {
    const query = supabaseClient.from(step.table).delete();
    const result = step.match.type === 'or'
      ? await query.or(step.match.columns.map((column) => `${column}.eq.${userId}`).join(','))
      : await query.eq(step.match.column, userId);

    if (result?.error && !(step.optional && ['PGRST205', '42P01'].includes(result.error.code))) {
      return { table: step.table, error: result.error };
    }
  }

  return null;
}

// The app uploads avatars directly under the user's UUID folder, but the insert
// policy only checks the first path segment, so subfolders are walked too.
// Each folder is re-listed after a delete because removal is the pagination.
export const AVATAR_CLEANUP_MAX_PASSES = 200;

export async function removeAvatarObjects(supabaseAdmin, userId) {
  const avatars = supabaseAdmin.storage.from('avatars');
  const pending = [userId];
  for (let pass = 0; pending.length; pass++) {
    if (pass >= AVATAR_CLEANUP_MAX_PASSES) return new Error('Too many profile photos to delete.');
    const folder = pending.pop();
    const { data, error } = await avatars.list(folder, { limit: 100 });
    if (error) return error;
    const entries = data ?? [];
    const paths = entries.filter((entry) => entry.id !== null).map((entry) => `${folder}/${entry.name}`);
    if (paths.length) {
      const { data: removed, error: removeError } = await avatars.remove(paths);
      if (removeError) return removeError;
      // A name that does not round-trip is reported as success with nothing
      // removed; stop rather than list the same page forever.
      if ((removed?.length ?? 0) !== paths.length) return new Error('Some profile photos could not be deleted.');
      pending.push(folder);
    } else {
      for (const entry of entries) pending.push(`${folder}/${entry.name}`);
    }
  }
  return null;
}
