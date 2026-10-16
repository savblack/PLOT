/**
 * A rail of poster cards that follows the viewer's card style (Customize Home,
 * profile.ui_prefs.cardStyle): a horizontal row of posters, or, for List, a
 * short column of rows. Mirrors web's HomeLook.css, which makes the same
 * change with CSS.
 *
 * It tells its cards which layout to draw through context, so only the rails
 * that use PosterRail change. A card used anywhere else (the platform charts,
 * the New Releases tab) keeps drawing a poster whatever the setting.
 */
import { createContext, useContext, type ReactElement } from 'react';
import { FlatList, View } from 'react-native';
import { useHomeLook } from '../lib/homeLook';
import { spacing } from '../lib/tokens';

/** A long rail would become a long page, so List shows the first few. Same cap as web. */
export const LIST_ROW_CAP = 8;

const RowLayoutContext = createContext(false);

/** True inside a PosterRail drawing rows: the card should draw itself as a row. */
export const useRowLayout = () => useContext(RowLayoutContext);

export default function PosterRail<T>({ data, keyExtractor, renderItem }: {
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  renderItem: (info: { item: T; index: number }) => ReactElement | null;
}) {
  const { cardStyle } = useHomeLook();
  if (cardStyle === 'list') {
    return (
      <RowLayoutContext.Provider value>
        <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md, gap: spacing.xs }}>
          {data.slice(0, LIST_ROW_CAP).map((item, index) => (
            <View key={keyExtractor(item, index)}>{renderItem({ item, index })}</View>
          ))}
        </View>
      </RowLayoutContext.Provider>
    );
  }
  return (
    <FlatList
      horizontal
      data={data}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      showsHorizontalScrollIndicator={false}
      nestedScrollEnabled
      contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}
    />
  );
}
