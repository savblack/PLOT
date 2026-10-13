import { Redirect } from 'expo-router';

/**
 * /save?media_type=movie&tmdb_id=123 (newsletter, share sheet, chart page).
 * MediaPanelProvider already reads the incoming URL and opens the title, so
 * this screen only has to exist: it hands the route to Home and the panel
 * opens on top. Web's SavePage does the same add-or-open dance.
 */
export default function SaveRoute() {
  return <Redirect href="/(app)" />;
}
