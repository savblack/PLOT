import { useLocalSearchParams } from 'expo-router';
import { WatchJoin } from '../../../../components/watch/WatchSession';

export default function TogetherJoinScreen() {
  const { username } = useLocalSearchParams<{ username?: string }>();
  const name = typeof username === 'string' ? username : '';
  return <WatchJoin username={name} />;
}
