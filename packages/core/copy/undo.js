/* The undo toast (web UndoToast.jsx, mobile UndoToast.tsx). */
import { favoriteWords } from '../spelling.js';

export const UNDO = {
  button: 'Undo',
  dismiss: 'Dismiss',
  restored: 'Restored.',
  failed: 'Could not undo that. Please try again.',
  /**
   * The toast's message for an offer from undo.js.
   * @param {{ action: string, count: number, title?: string, meta?: Record<string, any> }} offer
   * @param {string} [region] the viewer's own profile region, for favourite/favorite
   */
  message(offer, region) {
    const { action, count, title, meta = {} } = offer;
    const one = count === 1 && title;
    const titles = `${count} titles`;
    switch (action) {
      case 'watchlist_remove':
        return one ? `Removed ${title} from Want to Watch.` : `Removed ${titles} from Want to Watch.`;
      case 'list_item_remove': {
        const list = meta.listName || 'your list';
        return one ? `Removed ${title} from ${list}.` : `Removed ${titles} from ${list}.`;
      }
      case 'favourite_remove': {
        const favourites = favoriteWords(region).pluralLower;
        return one ? `Removed ${title} from ${favourites}.` : `Removed ${titles} from ${favourites}.`;
      }
      case 'history_remove':
        return one ? `Removed ${title} from your history.` : `Removed ${titles} from your history.`;
      case 'watching_stop':
        return one ? `Stopped watching ${title}.` : `Stopped watching ${count} shows.`;
      case 'watch_progress':
        return meta.season && meta.episode
          ? `${title || 'Progress'} is now on S${meta.season} E${meta.episode}.`
          : `Updated your progress on ${title || 'this show'}.`;
      default:
        return 'Change saved.';
    }
  },
};
