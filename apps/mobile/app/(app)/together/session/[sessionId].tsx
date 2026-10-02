import { useLocalSearchParams } from 'expo-router';
import { WatchSession } from '../../../../components/watch/WatchSession';

export default function TogetherSessionScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();
  return <WatchSession sessionId={typeof sessionId === 'string' ? sessionId : ''} />;
}
