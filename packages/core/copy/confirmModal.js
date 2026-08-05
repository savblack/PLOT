// Shared copy: used by the web app and mobile's Alert.alert confirmations.
// Lives in @plot/core/copy so the two platforms can't drift word by word;
// apps/web/src/copy/confirmModal.js re-exports it so src/copy stays the single place
// the web app and the Storybook Content page look for copy.

export const CONFIRM_MODAL = {
  working: 'Working…',
  typeToConfirm: (phrase) => `Type "${phrase}" to confirm`,
};
