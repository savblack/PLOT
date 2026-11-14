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
import Button from '../Button';
import SectionTitle from '../SectionTitle';
import { Avatar } from '../Avatar';
import { ButtonRow, ErrorNote, Note, WatchPage, Wordmark, openPremium } from './WatchChrome';
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
        <SectionTitle>{L.invalidTitle}</SectionTitle>
        <Note>{L.invalidBody}</Note>
      </WatchPage>
    );
  }

  const name = personName(info);
  const togetherPath = `/(app)/together/with/${encodeURIComponent(info.username)}` as Href;

  if (!userId) {
    return (
      <WatchPage hideBack>
        <Avatar url={info.avatar_url} name={personName(info)} size={72} colors={colors} />
        <Text style={{ fontFamily: fontFamily.display, fontSize: fontSize.xl, letterSpacing: -0.6, lineHeight: 28, color: colors.textPrimary }}>
          {L.titleNewLead(name)}{' '}
        </Text>
        <Wordmark />
        <Note>{L.bodyNew(name)}</Note>
        <ButtonRow>
          <Button variant="primary" label={`${L.joinLead} plot ${L.joinTail}`} onPress={signIn} />
          <Button label={L.haveAccount} onPress={signIn} />
        </ButtonRow>
        <Note>{L.newNote(name)}</Note>
      </WatchPage>
    );
  }

  if (info.state === 'self') {
    return (
      <WatchPage hideBack>
        <SectionTitle>{L.selfTitle}</SectionTitle>
        <Note>{L.selfBody}</Note>
        <InviteLinkCard />
      </WatchPage>
    );
  }

  if (info.state === 'paired') {
    return (
      <WatchPage hideBack>
        <Avatar url={info.avatar_url} name={personName(info)} size={72} colors={colors} />
        <SectionTitle>{L.pairedTitle(name)}</SectionTitle>
        <Button variant="primary" label={T.tile.pairedAction} onPress={() => router.push(togetherPath)} />
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
      <Avatar url={info.avatar_url} name={personName(info)} size={72} colors={colors} />
      <SectionTitle>{L.title(name)}</SectionTitle>
      <Note>{info.can_decide ? L.body : L.bodyNoPremium(name)}</Note>
      {!!error && <ErrorNote>{error}</ErrorNote>}
      <ButtonRow>
        {info.can_decide ? (
          <>
            <Button variant="primary" label={L.accept} onPress={() => setReviewing(true)} disabled={busy} />
            <Button label={L.notNow} onPress={() => router.replace('/(app)/together' as Href)} />
          </>
        ) : (
          <>
            <Button variant="primary" label={T.start.getPremium} onPress={() => openPremium(router)} />
            <Button label={L.imIn(name)} onPress={() => setReviewing(true)} disabled={busy} />
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
