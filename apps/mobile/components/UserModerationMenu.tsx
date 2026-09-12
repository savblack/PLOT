/**
 * The report / block control, for every mobile surface that renders another
 * account. RN counterpart of web's UserModerationMenu, same copy, same rules.
 *
 * `blocks` is the shared useBlocks result, passed in rather than called here: a
 * list of search results would otherwise mount one hook per row and fire one
 * RPC per result. One owner per screen, many menus.
 *
 * Block confirmation uses Alert rather than ConfirmPhraseModal. A typed phrase
 * is the bar for account deletion, which is irreversible; blocking is undone
 * from Settings in two taps, and making it feel heavier than it is would
 * discourage exactly the users Guideline 1.2 exists to protect.
 */
import { useState } from 'react';
import { Alert } from 'react-native';
import KebabMenu from './KebabMenu';
import ReportSheet from './ReportSheet';
import { MODERATION } from '@plot/core/copy/moderation.js';
import { COMMON } from '@plot/core/copy/common.js';

type Blocks = {
  isBlocked: (id: string) => boolean;
  block: (id: string) => Promise<boolean>;
  unblock: (id: string) => Promise<boolean>;
};

export default function UserModerationMenu({
  targetId, targetName, surface, viewerId, blocks, onChanged,
}: {
  targetId: string;
  targetName?: string;
  surface: string;
  viewerId?: string | null;
  blocks: Blocks;
  onChanged?: () => void;
}) {
  const [reporting, setReporting] = useState(false);

  if (!viewerId || !targetId || viewerId === targetId) return null;

  const blocked = blocks.isBlocked(targetId);
  const displayName = targetName || 'this account';

  const doBlock = async () => {
    await blocks.block(targetId);
    // The insert trigger severs follows in both directions server-side, so any
    // follow state the parent holds is now stale.
    onChanged?.();
  };

  const confirmBlock = () => {
    Alert.alert(
      MODERATION.blockTitle(displayName),
      MODERATION.blockBody,
      [
        { text: COMMON.cancel, style: 'cancel' },
        { text: MODERATION.blockConfirm, style: 'destructive', onPress: () => { void doBlock(); } },
      ],
    );
  };

  const items = [
    { label: MODERATION.reportAction, onPress: () => setReporting(true) },
    blocked
      ? {
          label: MODERATION.unblockAction,
          onPress: () => { void blocks.unblock(targetId).then(() => onChanged?.()); },
        }
      : { label: MODERATION.blockAction, danger: true, onPress: confirmBlock },
  ];

  return (
    <>
      <KebabMenu accessibilityLabel={`Options for ${displayName}`} items={items} />
      {reporting ? (
        <ReportSheet
          targetId={targetId}
          targetName={targetName}
          surface={surface}
          viewerId={viewerId}
          onClose={() => setReporting(false)}
          onBlockToo={blocked ? null : doBlock}
        />
      ) : null}
    </>
  );
}
