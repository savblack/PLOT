/**
 * The tab bar's menu button is a tab only so it sits in the bar with the
 * others; pressing it opens the drawer (see _layout.tsx) and never lands
 * here. A link that does reach this route goes Home.
 */
import { Redirect, type Href } from 'expo-router';

export default function MenuRoute() {
  return <Redirect href={'/(app)' as Href} />;
}
