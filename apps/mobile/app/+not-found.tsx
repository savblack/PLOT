import { Redirect } from 'expo-router';

/**
 * Any URL the app has no screen for. iOS claims every app.theplot.tv link
 * (associatedDomains), so web-only paths land here. Without this file
 * expo-router shows its own "Unmatched Route" developer screen in Release
 * builds, raw URL and sitemap link included. Home is the right place to land.
 */
export default function NotFound() {
  return <Redirect href="/(app)" />;
}
