export function itemMatchesPlatformFilters(item, platformFilters) {
  if (!platformFilters.length) return true;

  const providerIds = Array.isArray(item?.provider_ids) ? item.provider_ids : [];
  if (!providerIds.length) return false;

  return providerIds.some(id => platformFilters.includes(id));
}
