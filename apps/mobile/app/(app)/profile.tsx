/**
 * The signed-in user's own profile, as a static route.
 *
 * The tab bar no longer shows it (History takes that slot, matching web's
 * primary nav). The drawer opens /u/:username. This route stays so a direct
 * /profile link still renders the signed-in profile.
 */
import { useAppData } from '../../contexts/AppDataContext';
import ProfileScreen from './u/[username]';

export default function OwnProfileScreen() {
  const { profile } = useAppData();
  return <ProfileScreen usernameOverride={profile?.username ?? ''} />;
}
