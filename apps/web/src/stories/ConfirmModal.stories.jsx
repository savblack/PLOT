import ConfirmModal from '../components/ConfirmModal.jsx';

export default {
  title: 'Components/ConfirmModal',
  component: ConfirmModal,
  parameters: { layout: 'fullscreen' },
  args: {
    title: 'Remove from list?',
    message: 'This will remove the title from your watchlist. You can add it back any time.',
    confirmLabel: 'Remove',
    danger: false,
    onClose: () => {},
    onConfirm: () => {},
  },
};

export const Default = {};

export const Danger = {
  args: {
    title: 'Delete this list?',
    message: 'This permanently deletes the list and everything in it. This can\'t be undone.',
    confirmLabel: 'Delete',
    danger: true,
  },
};

export const WithConfirmPhrase = {
  args: {
    title: 'Delete your account?',
    message: 'This permanently deletes your account and all your data.',
    confirmLabel: 'Delete account',
    danger: true,
    confirmPhrase: 'delete',
  },
};
