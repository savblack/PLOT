// Tables that make up a user's personal data export. Mirrors the delete-account
// cleanup list, but reads rows instead of deleting them. The `omit` lists strip
// secrets (calendar feed token, encrypted Plex/Trakt OAuth material, device
// token hashes) so they never end up in a downloadable file.
export const EXPORT_STEPS = Object.freeze([
  { table: 'profiles', match: { type: 'eq', column: 'id' }, omit: ['calendar_token'] },
  { table: 'lists', match: { type: 'eq', column: 'user_id' } },
  { table: 'list_items', match: { type: 'eq', column: 'user_id' } },
  { table: 'journal', match: { type: 'eq', column: 'user_id' } },
  { table: 'journal_board', match: { type: 'eq', column: 'user_id' } },
  { table: 'watching_progress', match: { type: 'eq', column: 'user_id' } },
  { table: 'reminders', match: { type: 'eq', column: 'user_id' } },
  { table: 'user_favourites', match: { type: 'eq', column: 'user_id' } },
  { table: 'user_top_lists', match: { type: 'eq', column: 'user_id' } },
  { table: 'user_custom_lists', match: { type: 'eq', column: 'user_id' } },
  { table: 'user_custom_list_items', match: { type: 'eq', column: 'user_id' } },
  {
    table: 'media_integrations',
    match: { type: 'eq', column: 'user_id' },
    omit: [
      'device_token_hash',
      'plex_token_ciphertext',
      'plex_token_iv',
      'auth_pin_id',
      'auth_pin_code',
      'trakt_token_ciphertext',
      'trakt_token_iv',
      'trakt_refresh_ciphertext',
      'trakt_refresh_iv',
    ],
  },
  { table: 'integration_items', match: { type: 'eq', column: 'user_id' } },
  { table: 'integration_outbox', match: { type: 'eq', column: 'user_id' } },
  { table: 'follows', match: { type: 'or', columns: ['follower_id', 'following_id'] } },
  { table: 'feedback', match: { type: 'eq', column: 'user_id' } },
]);

function stripColumns(row, omit) {
  if (!omit || omit.length === 0) return row;
  const clean = { ...row };
  for (const column of omit) delete clean[column];
  return clean;
}

export async function runDataExport(supabaseClient, userId) {
  const data = {};

  for (const step of EXPORT_STEPS) {
    const query = supabaseClient.from(step.table).select('*');
    const result = step.match.type === 'or'
      ? await query.or(step.match.columns.map((column) => `${column}.eq.${userId}`).join(','))
      : await query.eq(step.match.column, userId);

    if (result?.error) {
      return { table: step.table, error: result.error };
    }

    data[step.table] = (result?.data ?? []).map((row) => stripColumns(row, step.omit));
  }

  return { data };
}
