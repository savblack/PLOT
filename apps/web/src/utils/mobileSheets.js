export const FILTER_SHEET_COLLAPSED_RATIO = 0.5;
export const FILTER_SHEET_EXPANDED_RATIO = 0.67;
export const MEDIA_SHEET_COLLAPSED_RATIO = 0.67;

export function groupIsActive(group) {
  const defaults = group.defaultValue ?? (group.mode === 'single' ? group.value : []);
  if (group.mode === 'single') return group.value !== defaults;
  const values = Array.isArray(group.value) ? group.value : [];
  const defaultValues = Array.isArray(defaults) ? defaults : [];
  return values.length !== defaultValues.length || values.some(value => !defaultValues.includes(value));
}

export function activeFilterGroupCount(groups = []) {
  return groups.filter(group => group.options?.length > 0 && groupIsActive(group)).length;
}

export function nextSheetSnap({ snap, delta, velocity, expandThreshold = 56, dismissThreshold = 110 }) {
  if (snap === 'expanded') {
    if (delta > expandThreshold || velocity > 0.45) return 'collapsed';
    return 'expanded';
  }
  if (delta < -expandThreshold || velocity < -0.45) return 'expanded';
  if (delta > dismissThreshold || velocity > 0.65) return 'dismissed';
  return 'collapsed';
}
