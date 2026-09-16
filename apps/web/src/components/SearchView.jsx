import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';

/* /search used to be a page with Titles / Talent / Friends tabs. Search is now
   the palette (SearchPalette.jsx), so this route only exists for old links and
   the mobile-width header icon's aria-current: it opens the palette over Home
   and gets out of the way. */
export default function SearchView() {
  const { openSearch } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/home', { replace: true });
    openSearch();
  }, [navigate, openSearch]);

  return null;
}
