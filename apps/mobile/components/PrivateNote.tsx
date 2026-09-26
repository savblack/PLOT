// Native inline rendering. Draft/storage logic and copy are shared with web.
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAppData } from '../contexts/AppDataContext';
import { useTheme } from '../contexts/ThemeContext';
import type { usePrivateNotes } from '@plot/core/usePrivateNotes.js';
import { usePrivateNoteEditor } from '@plot/core/usePrivateNoteEditor.js';
import { noteLength, PRIVATE_NOTE_LIMIT } from '@plot/core/privateNotes.js';
import { PRIVATE_NOTES as COPY } from '@plot/core/copy/privateNotes.js';
import { COMMON } from '@plot/core/copy/common.js';

type Props = { id: number; type: 'movie' | 'tv'; title: string };
export default function PrivateNote(props: Props) {
  const { userId, privateNotes } = useAppData();
  if (!userId) return null;
  return <PrivateNoteEditor store={privateNotes} key={`${userId}:${props.type}:${props.id}`} {...props} />;
}
export function PrivateNoteEditor({ id, type, title, store }: Props & { store: ReturnType<typeof usePrivateNotes> }) {
  const { colors } = useTheme();
  const editor = usePrivateNoteEditor(store, id, type, title);
  const button = (label: string, onPress: () => void, disabled = false) => (
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={{ padding: 10, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ color: colors.textPrimary }}>{label}</Text>
    </TouchableOpacity>
  );
  return (
    <View style={{ marginVertical: 10, gap: 8 }}>
      {store.loading ? <Text style={{ color: colors.textMuted }}>{COPY.loading}</Text> : store.error ? <>
        <Text accessibilityRole="alert" style={{ color: colors.textSecondary }}>{store.error}</Text>
        {button(COPY.reload, store.reload)}
      </> : editor.editing ? <>
        <Text style={{ color: colors.textSecondary }}>{COPY.label}</Text>
        <TextInput accessibilityLabel={COPY.label} multiline autoFocus value={editor.draft} onChangeText={editor.setDraft} editable={!editor.busy}
          placeholder={COPY.placeholder} placeholderTextColor={colors.textMuted} textAlignVertical="top"
          style={{ minHeight: 110, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.textPrimary, fontSize: 16 }} />
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{COPY.privacy} {noteLength(editor.draft)}/{PRIVATE_NOTE_LIMIT}</Text>
        {!!editor.error && <Text accessibilityRole="alert" style={{ color: colors.textSecondary }}>{editor.error}</Text>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {!!editor.note && button(COMMON.delete, () => { void editor.save(true); }, editor.busy || editor.conflict)}
          {button(COMMON.cancel, editor.cancel, editor.busy)}
          {editor.conflict ? button(COPY.reload, editor.reload) : button(editor.busy ? COMMON.saving : COPY.save, () => { void editor.save(); }, editor.busy || !editor.draft.trim() || noteLength(editor.draft) > PRIVATE_NOTE_LIMIT)}
        </View>
      </> : (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${editor.note ? COPY.edit : COPY.add}: ${title}`} onPress={editor.begin} style={{ paddingVertical: 8 }}>
          <Text style={{ color: editor.note ? colors.textSecondary : colors.textMuted, lineHeight: 22 }}>{editor.note || COPY.add}</Text>
        </TouchableOpacity>
      )}
      {!!editor.status && <Text accessibilityLiveRegion="polite" style={{ color: colors.textMuted }}>{editor.status}</Text>}
    </View>
  );
}
