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

// Back on the left, close on the right. There is no Save in the header: a
// dialog's main button sits in its foot (DialogActions).
export const BackAndClose = {
  args: { onBack: () => {} },
};
