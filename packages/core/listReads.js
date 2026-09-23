import { supabase } from './supabase.js';

/** Read every owned list item, including imports larger than PostgREST's cap.
 * Never return a successful partial collection when a later page fails.
 * @param {{ userId:string, listId:string, custom?:boolean }} input
 */
export async function readListItems({ userId, listId, custom = false }) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from(custom ? 'user_custom_list_items' : 'list_items')
      .select('*').eq('user_id',userId).eq('list_id',listId).order('id').range(offset,offset + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}
