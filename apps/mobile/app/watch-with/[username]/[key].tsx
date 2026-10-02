import { useLocalSearchParams } from 'expo-router';
import { WatchLink } from '../../../components/watch/WatchLink';

export default function WatchWithScreen() {
  const params = useLocalSearchParams<{ username?: string; key?: string }>();
  const username = typeof params.username === 'string' ? params.username : '';
  const linkKey = typeof params.key === 'string' ? params.key : '';
  return <WatchLink username={username} linkKey={linkKey} />;
}
