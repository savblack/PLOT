import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { personName } from '@plot/core/watchTogether.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { COLLABORATIVE_LISTS } from '@plot/core/copy/collaborativeLists.js';
import { fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { ErrorNote, Note, PersonRow, PrimaryButton, SectionLabel, Sheet } from './WatchChrome';
import { useTogether, WtPerson } from './watchModel';

const L = T.sharedList;

export function ShareListSheet({ partner, overlapCount, title, onClose }: {
  partner: WtPerson;
  overlapCount: number;
  title?: string;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const { userId, profile, customLists } = useAppData();
  const { partners } = useTogether(userId);
  const [name, setName] = useState(() => L.defaultName(personName(profile || {}), personName(partner)));
  const [seed, setSeed] = useState(overlapCount > 0);
  const [extra, setExtra] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = partners.filter(p => p.id !== partner.id);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    const id = await customLists.createSharedList(trimmed, [partner.id, ...extra], seed ? partner.id : null);
    setBusy(false);
    if (!id) {
      setError(L.error);
      return;
    }
    onClose();
    router.push('/(app)/my-lists' as Href);
  };

  const toggle = (id: string) => {
    setExtra(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  return (
    <Sheet
      visible
      title={title || L.sheetTitle}
      onClose={onClose}
      footer={<PrimaryButton label={L.create} onPress={create} disabled={busy || !name.trim()} />}
    >
      <View style={{ gap: spacing.xs }}>
        <SectionLabel>{L.name}</SectionLabel>
        <TextInput
          value={name}
          onChangeText={setName}
          style={{
            minHeight: 44,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radii.md,
            paddingHorizontal: spacing.md,
            color: colors.textPrimary,
            fontFamily: fontFamily.sans,
            fontSize: fontSize.md,
          }}
        />
      </View>
      <View style={{ gap: spacing.sm }}>
        <SectionLabel>{L.startWith}</SectionLabel>
        {overlapCount > 0 && (
          <Choice on={seed} title={L.startBoth(overlapCount)} note={L.startBothNote} onPress={() => setSeed(true)} />
        )}
        <Choice on={!seed} title={L.startEmpty} note={L.startEmptyNote} onPress={() => setSeed(false)} />
      </View>
      <View style={{ gap: spacing.sm }}>
        <SectionLabel>{L.whosOn}</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <Chip label={personName(partner)} on />
          {others.map(p => (
            <Chip key={p.id} label={personName(p)} on={extra.includes(p.id)} onPress={() => toggle(p.id)} />
          ))}
        </View>
        <Note>{L.whosOnNote}</Note>
      </View>
      {!!error && <ErrorNote>{error}</ErrorNote>}
    </Sheet>
  );
}

export function AddPeopleSheet({ listId, people, locked, onClose }: {
  listId: string;
  people: { user_id?: string }[];
  locked: boolean;
  onClose: () => void;
}) {
  const { userId, customLists } = useAppData();
  const { partners } = useTogether(userId);
  const onList = new Set(people.map(p => p.user_id).filter((id): id is string => !!id));
  const [added, setAdded] = useState<string[]>([]);
  const candidates = partners.filter(p => !onList.has(p.id));
  if (locked) {
    return (
      <Sheet visible title={L.addPeople} onClose={onClose}>
        <Note>{COLLABORATIVE_LISTS.hostNeedsPremium}</Note>
      </Sheet>
    );
  }
  return (
    <Sheet visible title={L.addPeople} onClose={onClose}>
      <Note>{L.addPeopleNote}</Note>
      {candidates.length === 0 && <Note>{L.noOneToAdd}</Note>}
      {candidates.map(p => (
        <PersonRow
          key={p.id}
          person={p}
          trailing={added.includes(p.id)
            ? <Chip label={L.shared} on />
            : <PrimaryButton label={L.add} onPress={async () => {
              const ok = await customLists.addMember(listId, p.id);
              if (ok) setAdded(prev => prev.includes(p.id) ? prev : [...prev, p.id]);
            }} />}
        />
      ))}
    </Sheet>
  );
}

function Choice({ on, title, note, onPress }: { on: boolean; title: string; note: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
      <View style={{ width: 18, height: 18, borderRadius: 9, marginTop: 2, borderWidth: 1, borderColor: on ? colors.accent : colors.textMuted, alignItems: 'center', justifyContent: 'center' }}>
        {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary }}>{title}</Text>
        <Note>{note}</Note>
      </View>
    </TouchableOpacity>
  );
}

function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress?: () => void }) {
  const { colors } = useTheme();
  const body = (
    <Text style={{ fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: on ? colors.onAccentFill : colors.textPrimary }}>{label}</Text>
  );
  const style = {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: on ? colors.accentFill : 'transparent',
    borderWidth: 1,
    borderColor: on ? colors.accentFill : colors.border,
  };
  if (!onPress) return <View style={style}>{body}</View>;
  return <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }} style={style}>{body}</TouchableOpacity>;
}
