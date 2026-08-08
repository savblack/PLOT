/**
 * The signed-in user's own profile, as a static route.
 *
 * Web's tab bar links straight to /u/:username. Mobile can't: pointing a
 * Tabs.Screen at the nested dynamic `u/[username]` route lays its icon out
 * ~16pt higher than the other tabs (confirmed by swapping in a known-good icon
 * — the slot is what moves, not the icon). A static route sits correctly, so
 * the tab uses this and the dynamic route stays for everyone else's profile.
 */
import { useAppData } from '../../contexts/AppDataContext';
import ProfileScreen from './u/[username]';

export default function OwnProfileScreen() {
  const { profile } = useAppData();
  return <ProfileScreen usernameOverride={profile?.username ?? ''} />;
}
