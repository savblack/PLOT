import { useState } from 'react';
import ImportSourceDialog from '../components/ImportSourceDialog.jsx';

// The IMDb import dialog after picking a list export: IMDb exports the
// watchlist and every other list in one layout under a random file name, so
// the dialog asks which it is before uploading. Nothing is uploaded here.
const noop = () => {};

function Preview({ initialChoice = null }) {
  const [listChoice, setListChoice] = useState(initialChoice);
  const start = {
    source: 'imdb', phase: 'file', busy: false, error: null,
    pendingFiles: [{ name: '7aff628a-6ff9-4549-8146-212eae03c528.csv' }], pendingRows: 2348,
    listChoiceNeeded: true, listChoice, chooseList: setListChoice,
    attachFiles: noop, upload: noop, connect: noop, startJob: noop, close: noop,
  };
  return <ImportSourceDialog start={start} onContinue={noop} />;
}

export default {
  title: 'Import/IMDb list question',
  component: ImportSourceDialog,
  parameters: { layout: 'fullscreen' },
};

export const Unanswered = { render: () => <Preview /> };
export const Watchlist = { render: () => <Preview initialChoice="watchlist" /> };
export const AnotherList = { render: () => <Preview initialChoice="list" /> };
