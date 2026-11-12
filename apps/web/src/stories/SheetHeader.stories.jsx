import { COMMON } from '@plot/core/copy/common.js';
import SheetHeader from '../components/SheetHeader.jsx';

export default {
  title: 'Components/SheetHeader',
  component: SheetHeader,
  args: {
    title: 'Edit list',
    onClose: () => {},
  },
};

export const CancelOnly = {};

// A picker that applies as you tap closes with Done instead.
export const DoneLabel = {
  args: { closeLabel: COMMON.done },
};

export const WithBack = {
  args: { onBack: () => {}, onClose: undefined },
};

// Back before the title, Cancel on the right. There is no Save in the
// header: a dialog's main button sits in its foot (DialogActions).
export const BackAndClose = {
  args: { onBack: () => {} },
};
