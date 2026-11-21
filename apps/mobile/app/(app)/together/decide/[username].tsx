import { useLocalSearchParams } from 'expo-router';
import { WatchMood } from '../../../../components/watch/WatchMood';

export default function TogetherDecideScreen() {
  const { username } = useLocalSearchParams<{ username?: string }>();
  const name = typeof username === 'string' ? username : '';
  return <WatchMood username={name} />;
}
