import { expect, fn, userEvent, within } from 'storybook/test';
import ConfirmModal from '../components/ConfirmModal.jsx';

export default {
  title: 'Components/ConfirmModal',
  component: ConfirmModal,
  tags: ['interaction-test'],
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
  args: {
    title: 'Remove from list?',
    message: 'This will remove the title from your watchlist. You can add it back any time.',
    confirmLabel: 'Remove',
    danger: false,
    onClose: fn(),
    onConfirm: fn(),
  },
};

export const Default = {
  play: async ({ args, canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body).getByRole('dialog');
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    const confirm = within(dialog).getByRole('button', { name: 'Remove' });

    await expect(cancel).toHaveFocus();
    await userEvent.click(confirm);
    await expect(args.onConfirm).toHaveBeenCalledOnce();
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};

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
  play: async ({ args, canvasElement }) => {
    const dialog = within(canvasElement.ownerDocument.body).getByRole('dialog');
    const input = within(dialog).getByLabelText('Type "delete" to confirm');
    const confirm = within(dialog).getByRole('button', { name: 'Delete account' });

    await expect(confirm).toBeDisabled();
    await userEvent.type(input, 'delete');
    await expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await expect(args.onConfirm).toHaveBeenCalledWith('delete');
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};
