// Upload rendered media to the public 'marketing' storage bucket.
import { getSupabase, supabaseUrl } from './supabase.mjs';

const BUCKET = 'marketing';

export const uploadMedia = async (storagePath, buffer) => {
  const supabase = getSupabase();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`Storage upload failed for ${storagePath}: ${error.message}`);
  return storagePath;
};

export const publicUrl = (storagePath) =>
  `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${storagePath}`;
