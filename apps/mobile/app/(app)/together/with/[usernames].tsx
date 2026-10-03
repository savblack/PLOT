import { useLocalSearchParams } from 'expo-router';
import { WatchOverlap } from '../../../../components/watch/WatchOverlap';

function namesFrom(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(',') : value || '';
  return raw.split(',').flatMap(part => {
    try {
      const name = decodeURIComponent(part);
      return name ? [name] : [];
    } catch {
      return part ? [part] : [];
    }
  });
}

export default function TogetherWithScreen() {
  const { usernames } = useLocalSearchParams<{ usernames?: string | string[] }>();
  return <WatchOverlap usernames={namesFrom(usernames)} />;
}
