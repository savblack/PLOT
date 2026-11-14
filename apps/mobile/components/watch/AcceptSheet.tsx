import { useState } from 'react';
import { Text, View } from 'react-native';
import Toggle from '../Toggle';
import { IconClose, IconCheck } from '../icons';
import { personName } from '@plot/core/watchTogether.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { useWatchlistVisibility } from '@plot/core/watchlistVisibility.js';
import { useMutualFollow } from '@plot/core/useWatchTogether.js';
import { fontFamily, fontSize, spacing } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import Button from '../Button';
import BottomSheet from '../BottomSheet';
import { ButtonRow, Note, SectionLabel } from './WatchChrome';

export function AcceptSheet({ person, busy = false, onAccept, onDecline, onClose }: {
  person: { id?: string; other_id?: string; display_name?: string | null; username?: string | null };
  busy?: boolean;
  onAccept: (shareFull: boolean) => void;
  onDecline: () => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { userId, profile } = useAppData();
  const openToEveryone = useWatchlistVisibility(userId, !!profile?.is_public).visibility === 'everyone';
  // On by default when you follow each other, still one tap to turn off.
  const mutual = useMutualFollow(userId, person.id ?? person.other_id);
  const [chosen, setChosen] = useState<boolean | null>(null);
  const shareFull = chosen ?? mutual;
  const name = personName(person);
  return (
    <BottomSheet
      visible
      title={T.accept.title(name)}
      onClose={onClose}
      footer={(
        <ButtonRow>
          <Button label={T.accept.notNow} onPress={onDecline} disabled={busy} flex />
          <Button variant="primary" label={T.accept.accept} onPress={() => onAccept(shareFull)} disabled={busy} flex />
        </ButtonRow>
      )}
    >
      <View style={{ gap: spacing.sm }}>
        <SectionLabel>{T.accept.willSee(name)}</SectionLabel>
        <Line ok text={T.accept.seesOverlap} />
        <Line ok text={T.accept.seesPicks} />
        {!openToEveryone && shareFull && <Line ok text={T.accept.seesFullWatchlist} />}
        <SectionLabel>{T.accept.wontSee(name)}</SectionLabel>
        {!openToEveryone && !shareFull && <Line text={T.accept.hidesRest} />}
        <Line text={T.accept.hidesPrivateLists} />
        <Line text={T.accept.hidesNotes} />
      </View>
      {!openToEveryone && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary }}>{T.accept.shareFull}</Text>
            <Note>{`${T.accept.shareFullBody(name)}${mutual && shareFull ? ` ${T.accept.shareFullMutual}` : ''}`}</Note>
          </View>
          <Toggle
            value={shareFull}
            onValueChange={setChosen}
            accessibilityLabel={T.accept.shareFull}
          />
        </View>
      )}
      <Note>{T.accept.foot(name)}</Note>
    </BottomSheet>
  );
}

function Line({ ok, text }: { ok?: boolean; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      {ok ? <IconCheck size={16} color={colors.accent} /> : <IconClose size={16} color={colors.textMuted} />}
      <Text style={{ flex: 1, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textPrimary }}>{text}</Text>
    </View>
  );
}
