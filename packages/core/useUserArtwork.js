// The provider returns JSX. Vite will not parse that in a .js file, and
// createElement makes the hooks lint treat the context object as a ref read.
export { ArtworkProvider } from './useUserArtwork.jsx';
export { useUserArtwork } from './userArtworkContext.js';
