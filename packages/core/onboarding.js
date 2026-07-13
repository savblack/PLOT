import { saveListItem } from './userMedia.js';

const DEFAULT_LIST_NAME = 'My List';

export async function getOrCreateMyListId({ supabase, userId, logger = console }) {
  if (!supabase || !userId) return null;

  const readList = async () => {
    const { data, error } = await supabase.from('lists')
      .select('id')
      .eq('user_id', userId)
      .eq('name', DEFAULT_LIST_NAME)
      .maybeSingle();

    return { listId: data?.id ?? null, error };
  };

  const existing = await readList();
  if (existing.error) {
    logger.warn('[onboarding] read My List failed:', existing.error);
    return null;
  }
  if (existing.listId) return existing.listId;

  const { data, error } = await supabase.from('lists')
    .insert({ user_id: userId, name: DEFAULT_LIST_NAME, is_public: false })
    .select('id')
    .single();

  if (!error && data?.id) return data.id;

  // Another flow may have created the default list between the read and insert.
  if (error?.code === '23505') {
    const retry = await readList();
    if (retry.error) {
      logger.warn('[onboarding] retry read My List failed:', retry.error);
      return null;
    }
    return retry.listId;
  }

  logger.warn('[onboarding] create My List failed:', error);
  return null;
}

export async function saveOnboardingSeedTitles({
  supabase,
  userId,
  items,
  saveItem = saveListItem,
  logger = console,
}) {
  if (!supabase || !userId || !Array.isArray(items) || items.length === 0) return 0;

  const listId = await getOrCreateMyListId({ supabase, userId, logger });
  if (!listId) return 0;

  const results = await Promise.all(items.map(async (item) => {
    const { error } = await saveItem({ listId, userId, item });

    // Re-running onboarding can legitimately hit duplicate list items.
    if (!error || error.code === '23505') return true;

    logger.warn('[onboarding] save seed title failed:', error);
    return false;
  }));

  return results.filter(Boolean).length;
}
