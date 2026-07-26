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
  { table: 'history_board', match: { type: 'eq', column: 'user_id' } },
  { table: 'follows', match: { type: 'or', columns: ['follower_id', 'following_id'] } },
  { table: 'profiles', match: { type: 'eq', column: 'id' } },
]);

export async function runAccountCleanup(supabaseClient, userId) {
  for (const step of ACCOUNT_CLEANUP_STEPS) {
    const query = supabaseClient.from(step.table).delete();
    const result = step.match.type === 'or'
      ? await query.or(step.match.columns.map((column) => `${column}.eq.${userId}`).join(','))
      : await query.eq(step.match.column, userId);

    if (result?.error) {
      return { table: step.table, error: result.error };
    }
  }

  return null;
}
