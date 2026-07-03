export function normalizeCustomListName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function findDuplicateCustomList(lists, name, excludeId = null) {
  const normalizedName = normalizeCustomListName(name);
  if (!normalizedName) return null;

  return (lists || []).find((list) => (
    list.id !== excludeId && normalizeCustomListName(list.name) === normalizedName
  )) || null;
}
