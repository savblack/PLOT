import { useState } from 'react';
import { Platform, Share, Text } from 'react-native';
import { useListInvite, reportListInviteShared } from '@plot/core/useListInvites.js';
import { buildListInviteUrl, SHARE_ORIGIN } from '@plot/core/sharing.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { COLLABORATIVE_LISTS as C } from '@plot/core/copy/collaborativeLists.js';
import { fontFamily, fontSize } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { ButtonRow, ErrorNote, Note, PersonRow, PrimaryButton, SecondaryButton, SectionLabel, Sheet } from './WatchChrome';
import { useTogether } from './watchModel';

function inviteError(code: string | null | undefined): string | null {
  if (code === 'premium_required') return C.errors.premium_required;
  if (code === 'not_allowed') return C.errors.not_allowed;
  if (code) return T.errors.generic;
  return null;
}

export function ListInviteSheet({ listId, listName, people, onClose }: {
  listId: string;
  listName: string;
  people: { user_id?: string }[];
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { userId, customLists } = useAppData();
  const { key, code, reset } = useListInvite(listId);
  const { partners } = useTogether(userId);
  const [resetDone, setResetDone] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const url = buildListInviteUrl({ key: key || '', origin: SHARE_ORIGIN });
  const display = url ? url.replace(/^https?:\/\//, '') : '';
  const onList = new Set(people.flatMap(person => (typeof person.user_id === 'string' ? [person.user_id] : [])));
  const candidates = partners.filter(person => !onList.has(person.id));
  const linkError = inviteError(code);

  const send = async (method: 'share' | 'copy') => {
    if (!url) return;
    const result = await Share.share({
      title: C.dialog.shareTitle(listName),
      message: Platform.OS === 'ios' ? (method === 'copy' ? url : C.dialog.shareText) : `${method === 'copy' ? '' : `${C.dialog.shareText}\n`}${url}`,
      ...(Platform.OS === 'ios' && method === 'share' ? { url } : {}),
    });
    if (result.action === Share.sharedAction) reportListInviteShared(method);
  };

  const add = async (id: string) => {
    setError(null);
    if (await customLists.addMember(listId, id)) setAdded(prev => prev.includes(id) ? prev : [...prev, id]);
    else setError(T.errors.generic);
  };

  const resetLink = async () => {
    const result = await reset();
    if (result.ok) setResetDone(true);
    else setError(inviteError(result.code) || T.errors.generic);
  };

  return (
    <Sheet visible title={C.invite} onClose={onClose}>
      <Note>{C.dialog.body}</Note>
      <SectionLabel>{T.link.kicker}</SectionLabel>
      {linkError ? <ErrorNote>{linkError}</ErrorNote> : (
        <>
          {!!display && <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted }}>{display}</Text>}
          <ButtonRow>
            <SecondaryButton label={T.link.copy} onPress={() => send('copy')} disabled={!url} />
            <PrimaryButton label={T.link.share} onPress={() => send('share')} disabled={!url} />
          </ButtonRow>
          <Note>{C.dialog.resetNote}</Note>
          <SecondaryButton label={T.link.reset} onPress={resetLink} disabled={!key || resetDone} />
        </>
      )}
      {candidates.length > 0 && (
        <>
          <SectionLabel>{C.dialog.partnersLabel}</SectionLabel>
          <Note>{C.dialog.partnersNote}</Note>
          {candidates.map(person => (
            <PersonRow
              key={person.id}
              person={person}
              note={person.username ? `@${person.username}` : undefined}
              trailing={added.includes(person.id)
                ? <Text style={{ fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary }}>{T.sharedList.shared}</Text>
                : <PrimaryButton label={T.sharedList.add} onPress={() => add(person.id)} />}
            />
          ))}
        </>
      )}
      {!!error && <ErrorNote>{error}</ErrorNote>}
    </Sheet>
  );
}
