import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { personName } from '@plot/core/watchTogether.js';
import { listInviteLanding } from '@plot/core/listInvites.js';
import { acceptListInvite, listInvitePeek, listInvitePreview } from '@plot/core/useListInvites.js';
import { inviteLandingLayout } from '@plot/core/sharedLists.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { COLLABORATIVE_LISTS as C } from '@plot/core/copy/collaborativeLists.js';
import { COMMON } from '@plot/core/copy/common.js';
import { fontFamily, fontSize, spacing } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { rememberWatchTogetherReturn } from '../../lib/watchTogetherReturn';
import {
  ButtonRow, ErrorNote, Note, PageTitle, PersonFace, PosterThumb, PrimaryButton, SecondaryButton, WatchPage, Wordmark,
} from './WatchChrome';

const L = C.landing;

interface InvitePreview {
  list_id: string | null;
  list_name: string;
  item_count: number;
  owner_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  host_premium: boolean;
  state: 'owner' | 'member' | 'none' | null;
}

interface PeekPerson {
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

interface InvitePeek {
  member_count: number;
  members: PeekPerson[];
  posters: string[];
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function asInvite(value: unknown): InvitePreview | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const listName = text(row.list_name);
  const username = text(row.username);
  if (!listName || !username) return null;
  const state = row.state === 'owner' || row.state === 'member' || row.state === 'none' ? row.state : null;
  return {
    list_id: text(row.list_id),
    list_name: listName,
    item_count: typeof row.item_count === 'number' ? row.item_count : 0,
    owner_id: text(row.owner_id) || '',
    username,
    display_name: text(row.display_name),
    avatar_url: text(row.avatar_url),
    host_premium: row.host_premium === true,
    state,
  };
}

function asPeek(value: unknown): InvitePeek | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const members = Array.isArray(row.members) ? row.members.flatMap((member): PeekPerson[] => {
    if (!member || typeof member !== 'object') return [];
    const person = member as Record<string, unknown>;
    return [{
      display_name: text(person.display_name),
      username: text(person.username),
      avatar_url: text(person.avatar_url),
    }];
  }) : [];
  const posters = Array.isArray(row.posters) ? row.posters.filter((path): path is string => typeof path === 'string' && !!path) : [];
  return {
    member_count: typeof row.member_count === 'number' ? row.member_count : 0,
    members,
    posters,
  };
}

function joinError(code: string | null | undefined): string {
  if (code === 'premium_required') return C.errors.premium_required;
  if (code === 'not_allowed') return C.errors.not_allowed;
  return T.errors.generic;
}

function FaceStack({ people }: { people: PeekPerson[] }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {people.slice(0, 4).map((person, index) => (
        <View key={`${person.username || person.display_name || 'person'}:${index}`} style={{ marginLeft: index === 0 ? 0 : -8 }}>
          <PersonFace person={person} size={28} />
        </View>
      ))}
    </View>
  );
}

function ListHead({ info, peek, name }: { info: InvitePreview; peek: InvitePeek; name: string }) {
  const { colors } = useTheme();
  const people = [info, ...peek.members];
  const names = people.map(person => personName(person));
  const more = Math.max(0, peek.member_count - peek.members.length);
  const summary = L.members(names, more, info.item_count);
  return (
    <View style={{ gap: spacing.sm }}>
      {peek.posters.length > 0 && (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {peek.posters.slice(0, 5).map((path, index) => (
            <PosterThumb key={`${path}:${index}`} path={path} width={52} height={78} />
          ))}
        </View>
      )}
      <Text style={{ fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary }}>{L.invitedToJoin(name)}</Text>
      <PageTitle>{info.list_name}</PageTitle>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <FaceStack people={people} />
        <Text style={{ flex: 1, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary }}>{summary}</Text>
      </View>
    </View>
  );
}

export function ListInviteLanding({ linkKey }: { linkKey: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { userId, customLists } = useAppData();
  const [row, setRow] = useState<{ key: string; userId: string | null; info: InvitePreview | null; peek: InvitePeek | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = row && row.key === linkKey && row.userId === (userId ?? null) ? row : null;
  const here = `/join-list/${encodeURIComponent(linkKey)}`;

  useEffect(() => {
    let live = true;
    const requestUser = userId ?? null;
    void Promise.all([
      listInvitePreview(linkKey).then(data => data, () => null),
      listInvitePeek(linkKey).then(data => data, () => null),
    ]).then(([info, peek]) => {
      if (live) setRow({ key: linkKey, userId: requestUser, info: asInvite(info), peek: asPeek(peek) });
    });
    return () => { live = false; };
  }, [linkKey, userId]);

  const signIn = () => {
    rememberWatchTogetherReturn(here);
    router.push('/(auth)');
  };

  const openList = async () => {
    await customLists.refresh();
    router.replace('/(app)/my-lists' as Href);
  };

  if (!loaded) return <WatchPage hideBack><Note>{COMMON.loading}</Note></WatchPage>;

  const info = loaded.info;
  const screen = listInviteLanding(info, { signedIn: !!userId });
  if (screen === 'invalid' || !info) {
    return (
      <WatchPage hideBack>
        <PageTitle>{T.landing.invalidTitle}</PageTitle>
        <Note>{T.landing.invalidBody}</Note>
      </WatchPage>
    );
  }

  const name = personName(info);
  const summary = T.sharedList.summary(info.list_name, info.item_count);
  const listLed = inviteLandingLayout(info) === 'list' && !!loaded.peek;
  const head = listLed && loaded.peek
    ? <ListHead info={info} peek={loaded.peek} name={name} />
    : (
      <View style={{ gap: spacing.sm }}>
        <PersonFace person={info} size={72} />
        <PageTitle>{L.title(name)}</PageTitle>
        <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textSecondary }}>{summary}</Text>
      </View>
    );

  if (screen === 'signedOut') {
    return (
      <WatchPage hideBack>
        {head}
        <Note>{listLed ? L.listBody : L.bodyNew(name)}</Note>
        <ButtonRow>
          <PrimaryButton label={`${T.landing.joinLead} plot ${T.landing.joinTail}`} onPress={signIn} />
          <SecondaryButton label={T.landing.haveAccount} onPress={signIn} />
        </ButtonRow>
        <Note>{T.landing.newNote(name)}</Note>
      </WatchPage>
    );
  }

  if (screen === 'owner' || screen === 'member') {
    return (
      <WatchPage hideBack>
        <PageTitle>{screen === 'owner' ? L.ownerTitle : L.memberTitle}</PageTitle>
        <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textSecondary }}>{summary}</Text>
        {screen === 'owner' && <Note>{L.ownerBody}</Note>}
        <PrimaryButton label={L.open} onPress={openList} />
      </WatchPage>
    );
  }

  if (screen === 'inactive') {
    return (
      <WatchPage hideBack>
        <PersonFace person={info} size={72} />
        <PageTitle>{L.inactiveTitle}</PageTitle>
        <Note>{L.inactiveBody(name)}</Note>
      </WatchPage>
    );
  }

  const join = async () => {
    setBusy(true);
    setError(null);
    const result = await acceptListInvite(linkKey);
    if (!result.ok) {
      setBusy(false);
      setError(joinError(result.code));
      return;
    }
    await customLists.refresh();
    router.replace('/(app)/my-lists' as Href);
  };

  return (
    <WatchPage hideBack>
      {head}
      <Note>{listLed ? L.listBody : L.body}</Note>
      {!!error && <ErrorNote>{error}</ErrorNote>}
      <ButtonRow>
        <PrimaryButton label={L.join} onPress={join} disabled={busy} />
        <SecondaryButton label={T.landing.notNow} onPress={() => router.replace('/(app)/my-lists' as Href)} />
      </ButtonRow>
      <Note>{listLed ? L.whereNote(name) : L.joinNote(name)}</Note>
    </WatchPage>
  );
}
