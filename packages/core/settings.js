import { SETTINGS_VIEW } from './copy/settingsView.js';

// Shared information architecture and selection summaries for web and mobile.
const keywords = {
  account: 'name photo avatar username email appearance theme light dark system digest',
  viewing: 'streaming platforms providers channels region timezone genres kids',
  connections: 'plex trakt sync import watch history calendar feed ics',
  billing: 'premium subscription plan payment invoice checkout support tip ko-fi kofi',
  privacy: 'public private profile blocked accounts share invite export json csv clear lists history delete',
  help: 'feedback bug support terms privacy policy credits tmdb tvmaze omdb',
};

export const SETTINGS_SECTIONS = Object.entries(SETTINGS_VIEW.page.sections).map(([id, copy]) => ({
  id, ...copy, keywords: keywords[id],
}));

/** @param {string} query */
export function searchSettingsSections(query) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return SETTINGS_SECTIONS.filter(section => terms.every(term =>
    `${section.title} ${section.description} ${section.keywords}`.toLowerCase().includes(term)));
}

/**
 * Show at most four saved names; count every remaining selection, including
 * older records missing metadata. Never guess a provider from an opaque id.
 * @param {Array<{name?: string} | string> | null | undefined} items
 * @returns {string}
 */
export function settingsSelectionSummary(items) {
  if (!items?.length) return SETTINGS_VIEW.page.noneSelected;
  const names = items.slice(0, 4).map(item =>
    (typeof item === 'string' ? item : item?.name)?.trim() || SETTINGS_VIEW.page.unnamedSelection);
  return names.join(', ') + (items.length > 4 ? ` ${SETTINGS_VIEW.page.moreSelected(items.length - 4)}` : '');
}
