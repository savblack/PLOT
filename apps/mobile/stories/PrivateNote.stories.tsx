import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { PrivateNoteEditor } from '../components/PrivateNote';
// Verified response fixture: apps/web/tests/unit/publicListSharing.test.js.
export function Preview() {
  const [rows, setRows] = useState({});
  const store = {
    rows, loading: false, error: '', reload: async () => true,
    save: async ({ text, revision }: { text: string; revision: number }) => {
      const row = { note: text.trim(), revision: revision + 1 };
      setRows({ 'tv:95396': row });
      return row;
    },
  };
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }}>
    <Text>Severance</Text><PrivateNoteEditor id={95396} type="tv" title="Severance" store={store} />
  </ScrollView>;
}
export default { title: 'Lists/PrivateNote', component: Preview };
export const Inline = {};
