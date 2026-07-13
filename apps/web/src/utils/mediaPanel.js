export function resolveMediaPanelEscapeAction({ closing = false, showListSheet = false } = {}) {
  if (closing) return null;
  return showListSheet ? 'close-list-sheet' : 'close-panel';
}
