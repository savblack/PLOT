import { MEDIA } from '../copy/media.js';

// The Show rows of the Calendar's and History's filter panels. A plain module
// rather than an export of SideFilters.jsx, which the fast-refresh lint rule
// keeps to components only.
export const TYPE_ROWS = [
  { id: 'tv',     label: MEDIA.tv     },
  { id: 'movie',  label: MEDIA.movies },
  { id: 'cinema', label: MEDIA.cinema },
];
