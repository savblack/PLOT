import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { personName } from '@plot/core/watchTogether.js';
import { watchTogetherLinkOwner, watchTogetherLinkStatus, acceptWatchTogetherLink } from '@plot/core/useWatchTogether.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { COMMON } from '@plot/core/copy/common.js';
import { fontFamily, fontSize } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { rememberWatchTogetherReturn } from '../../lib/watchTogetherReturn';
import { AcceptSheet } from './AcceptSheet';
import { InviteLinkCard } from './InviteLinkCard';
import {
  ButtonRow, ErrorNote, Note, PageTitle, PersonFace, PrimaryButton, SecondaryButton, WatchPage, Wordmark, openPremium,
} from './WatchChrome';
import { LinkPerson, asLink, asResult, errorText } from './watchModel';

const L = T.landing;

export function WatchLink({ username, linkKey }: { username: string; linkKey: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { userId } = useAppData();
  const [row, setRow] = useState<{ key: string; userId: string | null; info: LinkPerson | null } | null>(null);
  const info = row && row.key === linkKey && row.userId === (userId ?? null) ? row.info : undefined;
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const here = `/watch-with/${encodeURIComponent(username)}/${encodeURIComponent(linkKey)}`;

  useEffect(() => {
    let live = true;
    const requestUser = userId ?? null;
    void (requestUser ? watchTogetherLinkStatus(linkKey) : watchTogetherLinkOwner(linkKey)).then(data => {
      if (live) setRow({ key: linkKey, userId: requestUser, info: asLink(data) });
    }, () => { if (live) setRow({ key: linkKey, userId: requestUser, info: null }); });
    return () => { live = false; };
  }, [linkKey, userId]);

  const signIn = () => {
    rememberWatchTogetherReturn(here);
    router.push('/(auth)');
  };

  if (info === undefined) return <WatchPage hideBack><Note>{COMMON.loading}</Note></WatchPage>;
  if (!info) {
    return (
      <WatchPage hideBack>
        <PageTitle>{L.invalidTitle}</PageTitle>
        <Note>{L.invalidBody}</Note>
      </WatchPage>
    );
  }

  const name = personName(info);
  const togetherPath = `/(app)/together/with/${encodeURIComponent(info.username)}` as Href;

  if (!userId) {
    return (
      <WatchPage hideBack>
        <PersonFace person={info} size={72} />
        <Text style={{ fontFamily: fontFamily.display, fontSize: fontSize.xl, letterSpacing: -0.6, lineHeight: 28, color: colors.textPrimary }}>
          {L.titleNewLead(name)}{' '}
        </Text>
        <Wordmark />
        <Note>{L.bodyNew(name)}</Note>
        <ButtonRow>
          <PrimaryButton label={`${L.joinLead} plot ${L.joinTail}`} onPress={signIn} />
          <SecondaryButton label={L.haveAccount} onPress={signIn} />
        </ButtonRow>
        <Note>{L.newNote(name)}</Note>
      </WatchPage>
    );
  }

  if (info.state === 'self') {
    return (
      <WatchPage hideBack>
        <PageTitle>{L.selfTitle}</PageTitle>
        <Note>{L.selfBody}</Note>
        <InviteLinkCard compact />
      </WatchPage>
    );
  }

  if (info.state === 'paired') {
    return (
      <WatchPage hideBack>
        <PersonFace person={info} size={72} />
        <PageTitle>{L.pairedTitle(name)}</PageTitle>
        <PrimaryButton label={T.tile.pairedAction} onPress={() => router.push(togetherPath)} />
      </WatchPage>
    );
  }

  const accept = async (shareFull: boolean) => {
    setBusy(true);
    setError(null);
    const result = asResult(await acceptWatchTogetherLink(linkKey, shareFull));
    setBusy(false);
    setReviewing(false);
    if (result.ok) router.replace(togetherPath);
    else setError(errorText(result.code));
  };

  return (
    <WatchPage hideBack>
      <PersonFace person={info} size={72} />
      <PageTitle>{L.title(name)}</PageTitle>
      <Note>{info.can_decide ? L.body : L.bodyNoPremium(name)}</Note>
      {!!error && <ErrorNote>{error}</ErrorNote>}
      <ButtonRow>
        {info.can_decide ? (
          <>
            <PrimaryButton label={L.accept} onPress={() => setReviewing(true)} disabled={busy} />
            <SecondaryButton label={L.notNow} onPress={() => router.replace('/(app)/together' as Href)} />
          </>
        ) : (
          <>
            <PrimaryButton label={T.start.getPremium} onPress={() => openPremium(router)} />
            <SecondaryButton label={L.imIn(name)} onPress={() => setReviewing(true)} disabled={busy} />
          </>
        )}
      </ButtonRow>
      <Note>{info.can_decide ? L.acceptNote(name) : L.imInNote}</Note>
      {reviewing && (
        <AcceptSheet
          person={info}
          busy={busy}
          onClose={() => setReviewing(false)}
          onDecline={() => setReviewing(false)}
          onAccept={accept}
        />
      )}
    </WatchPage>
  );
}
