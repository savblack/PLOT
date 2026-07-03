const inferSupabaseUrl = () => {
  const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
  return String(env?.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
};

export const supabaseUrl = inferSupabaseUrl();

export const storageMediaUrl = (path) => {
  const value = String(path || '').trim();
  if (!value) return null;
  if (/^data:image\//i.test(value)) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (!supabaseUrl) return null;
  return `${supabaseUrl}/storage/v1/object/public/marketing/${value}`;
};

export const mediaSourceForItem = (item, preferred = 'portrait') => {
  if (!item) return null;
  if (preferred === 'landscape') {
    return storageMediaUrl(item.landscape_path) || storageMediaUrl(item.portrait_path);
  }
  return storageMediaUrl(item.portrait_path) || storageMediaUrl(item.landscape_path);
};

export const firstMediaForPlatform = (post, platform, preferred = 'portrait') => {
  const media = Array.isArray(post?.media) ? post.media : [];
  const scoped = media.filter((entry) => !entry.channels || entry.channels.includes(platform));
  return mediaSourceForItem(scoped[0] || media[0], preferred);
};
