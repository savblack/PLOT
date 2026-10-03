import { useLocalSearchParams } from 'expo-router';
import { ListInviteLanding } from '../../components/watch/ListInviteLanding';

export default function JoinListScreen() {
  const params = useLocalSearchParams<{ key?: string }>();
  const linkKey = typeof params.key === 'string' ? params.key : '';
  return <ListInviteLanding linkKey={linkKey} />;
}
