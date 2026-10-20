import { STREAMING_ALERTS } from '@plot/core/copy/streamingAlerts.js';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { StreamingArrivalAskView } from '../components/StreamingArrivalAsk.jsx';

function Frame({ children }) {
  return (
    <section className="panel-card panel-watch" style={{ maxWidth: 420, margin: 24 }}>
      <h3 className="panel-card-title">{MEDIA_PANEL.whereToWatch}</h3>
      <p className="providers-empty">Not streaming in the United States yet.</p>
      {children}
    </section>
  );
}

export default {
  title: 'Panels/Streaming arrival ask',
  component: StreamingArrivalAskView,
  parameters: { layout: 'fullscreen' },
};

export const Ask = {
  render: () => (
    <Frame>
      <StreamingArrivalAskView armed={false} busy={false} failed={false} onAsk={() => {}} />
    </Frame>
  ),
};

export const Armed = {
  render: () => (
    <Frame>
      <StreamingArrivalAskView armed busy={false} failed={false} onAsk={() => {}} />
    </Frame>
  ),
};

export const Failed = {
  render: () => (
    <Frame>
      <StreamingArrivalAskView armed={false} busy={false} failed onAsk={() => {}} />
    </Frame>
  ),
};
