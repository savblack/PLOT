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

export async function removeAvatarObjects(supabaseAdmin, userId) {
  const avatars = supabaseAdmin.storage.from('avatars');
  while (true) {
    const { data, error } = await avatars.list(userId, { limit: 100 });
    if (error) return error;
    if (!data?.length) return null;
    // Avatars are uploaded directly under the user's UUID folder.
    if (data.some((entry) => entry.id === null)) return new Error('Unexpected folder in profile photos.');
    const paths = data.map((entry) => `${userId}/${entry.name}`);
    const { error: removeError } = await avatars.remove(paths);
    if (removeError) return removeError;
  }
}
