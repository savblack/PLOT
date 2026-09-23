// Tables that make up a user's personal data export. Mirrors the delete-account
// cleanup list, but reads rows instead of deleting them. The `omit` lists strip
// secrets (calendar feed token, encrypted Plex/Trakt OAuth material, device
// token hashes) so they never end up in a downloadable file.
export const EXPORT_STEPS = Object.freeze([
  { table: 'profiles', match: { type: 'eq', column: 'id' }, omit: ['calendar_token'] },
  { table: 'lists', match: { type: 'eq', column: 'user_id' } },
  { table: 'list_items', match: { type: 'eq', column: 'user_id' } },
  { table: 'history', match: { type: 'eq', column: 'user_id' } },
  { table: 'imported_lists', match: { type: 'eq', column: 'user_id' } },
  { table: 'imported_annotations', match: { type: 'eq', column: 'user_id' } },
  { table: 'imported_list_entries', match: { type: 'eq', column: 'user_id' } },
  { table: 'tracking_import_items', match: { type: 'eq', column: 'user_id' } },
  { table: 'tracking_connections', match: { type: 'eq', column: 'user_id' } },
  { table: 'tracking_jobs', match: { type: 'eq', column: 'user_id' }, omit: ['lease_token'] },
  { table: 'tracking_review_items', match: { type: 'eq', column: 'user_id' } },
  { table: 'episode_watch_overrides', match: { type: 'eq', column: 'user_id' } },
  { table: 'watch_events', match: { type: 'eq', column: 'user_id' } },
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
      // Legacy resource blobs may contain provider-issued access tokens.
      'plex_servers',
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
    const rows = [];
    for (let from = 0; ; from += 1000) {
      let query = supabaseClient.from(step.table).select('*');
      query = step.match.type === 'or'
        ? query.or(step.match.columns.map((column) => `${column}.eq.${userId}`).join(','))
        : query.eq(step.match.column, userId);
      // follows has a composite key; every other exported table has an id.
      const order = step.table === 'follows' ? ['follower_id', 'following_id'] : step.table === 'tracking_connections' ? ['integration_id'] : ['id'];
      for (const column of order) query = query.order(column, { ascending: true });
      const result = await query.range(from, from + 999);
      if (result?.error) return { table: step.table, error: result.error };
      rows.push(...(result?.data ?? []).map(row => {
        const clean = stripColumns(row, step.omit);
        if (step.table === 'media_integrations' && clean.selected_server) {
          const source = clean.selected_server;
          clean.selected_server = { clientIdentifier: source.clientIdentifier, accountID: source.accountID, name: source.name, profileName: source.profileName };
        }
        return clean;
      }));
      if (!result?.data || result.data.length < 1000) break;
    }
    data[step.table] = rows;
  }

  return { data };
}
