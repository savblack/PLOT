import SheetHeader from '../components/SheetHeader.jsx';

export default {
  title: 'Components/SheetHeader',
  component: SheetHeader,
  args: {
    title: 'Edit list',
    onClose: () => {},
  },
};

export const CloseOnly = {};

export const WithBack = {
  args: { onBack: () => {}, onClose: undefined },
};

export const WithAction = {
  args: {
    action: { label: 'Save', onClick: () => {} },
  },
};

export const WithBackAndAction = {
  args: {
    onBack: () => {},
    action: { label: 'Save', onClick: () => {} },
  },
};

export const DisabledAction = {
  args: {
    action: { label: 'Save', onClick: () => {}, disabled: true },
  },
};
