// Words and capture for the taste-overlap share card. What the card says matches
// shareCardText / sharePostText in apps/web/src/utils/tasteShareImage.js. The
// PNG is captured off-screen; the system sheet is what reaches Instagram,
// Threads and X. react-native-view-shot needs a rebuilt binary before capture
// works on an install that predates it.
import { Platform, Share, type View } from 'react-native';
import type { RefObject } from 'react';
import { favoriteWords } from '@plot/core/spelling.js';
import { SHARE_LINK } from '@plot/core/tasteOverlap.js';
import { TASTE_OVERLAP as T } from '@plot/core/copy/tasteOverlap.js';

export const TASTE_CARD_WIDTH = 1080;

export type TasteTitle = {
  tmdb_id: number;
  media_type: string;
  title: string;
  poster_path: string | null;
  mine: number;
  theirs: number;
};

/** Matches the TasteOverlap typedef in packages/core/tasteOverlap.js. */
export type TasteOverlapModel = {
  watched: { mine: number; theirs: number; both: number };
  sharedRated: number;
  match: number | null;
  genres: { id: number; mine: number; theirs: number }[];
  sharedGenreId: number | null;
  decades: { mine: number | null; theirs: number | null };
  critic: { mine: number | null; theirs: number | null; tougher: 'mine' | 'theirs' | 'even' | null };
  loved: TasteTitle[];
  disagree: TasteTitle[];
};

export type TasteCardContent = {
  friendName: string | null;
  match: number | null;
  watchedInCommon: number;
  loved: { title?: string | null; poster_path?: string | null; tmdb_id?: number; media_type?: string }[];
  sharedGenreId: number | null;
  biggestArgument: string | null;
};

export function tasteCardText(
  content: TasteCardContent,
  genreName: Map<number, string>,
  region: string | null | undefined,
) {
  const hasMatch = content.match != null;
  return {
    kicker: T.matchKicker,
    me: T.me,
    pairLine: content.friendName ? T.meAnd(content.friendName) : T.meAndFriend,
    headline: hasMatch ? `${content.match}%` : String(content.watchedInCommon),
    subline: hasMatch ? T.watchedInCommon(content.watchedInCommon) : T.inCommonLabel(content.watchedInCommon),
    weBothLoved: T.weBothLoved,
    sharedGenreLabel: T.sharedGenre(favoriteWords(region).nounLower),
    sharedGenre: content.sharedGenreId != null ? (genreName.get(content.sharedGenreId) || null) : null,
    biggestArgumentLabel: T.biggestArgument,
    footer: T.cardFooter,
  };
}

export function tastePostText(content: { match: number | null }) {
  return `${content.match != null ? T.sharePostMatch(content.match) : T.shareText} ${SHARE_LINK}`;
}

export async function captureTasteCard(ref: RefObject<View | null>): Promise<string> {
  const target = ref.current;
  if (!target) throw new Error('capture');
  const { captureRef } = await import('react-native-view-shot');
  return captureRef(target, { format: 'png', quality: 1, result: 'tmpfile' });
}

/** iOS attaches the PNG. Android's Share module does not, so the caption goes alone. */
export async function shareTasteImage(uri: string, message: string): Promise<boolean> {
  const result = Platform.OS === 'ios'
    ? await Share.share({ url: uri, message })
    : await Share.share({ message });
  return result.action === Share.sharedAction;
}
