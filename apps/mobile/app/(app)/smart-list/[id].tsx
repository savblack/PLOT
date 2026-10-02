import { useLocalSearchParams } from 'expo-router';
import SmartListView from '../../../components/smart/SmartListView';

export default function SmartListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listId = typeof id === 'string' ? id : '';
  return <SmartListView listId={listId} />;
}
