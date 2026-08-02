/* ── Sample data ─────────────────────── */
export const mockUser = {
  id: 'mock-user-id',
  email: 'preview@theplot.tv',
};

export const mockProfile = {
  id: 'mock-user-id',
  username: 'previewer',
  display_name: 'Preview User',
  avatar_url: null,
  timezone: 'America/New_York',
  region: 'US',
};

/*
 * Default shape for every value real code pulls off `useApp()`. Mirrors the
 * `ctx` object App.jsx builds and hands to AppContext.Provider — see
 * App.jsx's `ctx = {...}` for the source of truth if these hooks' return
 * shapes change.
 */
export const mockAppContextValue = {
  user: mockUser,
  profile: mockProfile,
  theme: 'dark',
  setTheme: () => {},
  openPanel: () => {},
  closePanel: () => {},
  navigateTo: () => {},
  watchlist: {
    items: [], loading: false, error: null,
    isInList: () => false,
    addToList: async () => {},
    removeFromList: async () => {},
    toggle: async () => {},
    reload: () => {},
  },
  watching: {
    items: [], loading: false, error: false,
    startWatching: async () => {},
    markEpisodeWatched: async () => ({ ok: true }),
    stopWatching: async () => {},
    setProgress: async () => {},
    fetchSeason: async () => null,
    isWatching: () => false,
    getProgress: () => null,
    reload: () => {},
  },
  reminders: {
    reminders: [], loading: false,
    hasReminder: () => false,
    addReminder: async () => {},
    removeReminder: async () => {},
    toggleReminder: async () => {},
  },
  topLists: {
    lists: { movies: [], tv: [] }, loading: false, error: false,
    reload: () => {},
    setSlot: async () => true,
    removeSlot: async () => true,
    moveUp: async () => true,
    moveDown: async () => true,
  },
  favorites: {
    favorites: [], loading: false,
    isFavorite: () => false,
    toggleFavorite: async () => {},
  },
  customLists: {
    lists: [], loading: false,
    createList: async () => {},
    deleteList: async () => {},
    renameList: async () => {},
    setListPublic: async () => {},
    addItem: async () => {},
    removeItem: async () => {},
    isInList: () => false,
  },
  refreshProfile: () => {},
};
