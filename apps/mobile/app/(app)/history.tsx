/**
 * History — /(app)/history. Web gives History its own page. It is the My Lists
 * body with the list tabs left out, so the month jumper, type filter and share
 * cards live in one place.
 */
import { MyListsScreen } from './my-lists';

export default function HistoryScreen() {
  return <MyListsScreen mode="history" />;
}
