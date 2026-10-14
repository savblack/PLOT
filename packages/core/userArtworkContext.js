import { createContext, useContext } from 'react';

/**
 * @typedef {object} UserArtwork
 * @property {boolean} premium
 * @property {boolean} ready
 * @property {string | null} error
 * @property {(subjectType: string, tmdbId?: number | null, kind?: string, seasonNumber?: number) => string | null} path
 * @property {(item: any) => any} apply
 * @property {(choice: any) => Promise<boolean>} save
 * @property {(choice: any) => Promise<boolean>} clear
 * @property {() => void} reload
 */

/** @type {UserArtwork} */
const IDLE = {
  premium: false,
  ready: false,
  error: null,
  path: () => null,
  apply: (item) => item,
  save: async () => false,
  clear: async () => false,
  reload: () => {},
};

export const ArtworkContext = createContext(/** @type {UserArtwork | null} */ (null));

/**
 * Idle outside the provider, so a poster can render before the app shell mounts.
 * @returns {UserArtwork}
 */
export function useUserArtwork() {
  return useContext(ArtworkContext) ?? IDLE;
}
