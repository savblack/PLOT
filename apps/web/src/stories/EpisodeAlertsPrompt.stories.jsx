import { useEffect } from 'react';
import { expect, waitFor, within } from 'storybook/test';
import { EPISODE_ALERTS } from '@plot/core/copy/episodeAlerts.js';
import {
  dismissEpisodeAlertsPrompt,
  episodeAlertsPromptStorageKey,
  noteEpisodeAlertsCandidate,
} from '@plot/core/episodeAlertsPrompt.js';
import EpisodeAlertsPrompt from '../components/EpisodeAlertsPrompt.jsx';
import { writeStorage } from '../utils/storage.js';

const USER_ID = 'story-episode-alerts';

function Harness() {
  useEffect(() => {
    dismissEpisodeAlertsPrompt();
    writeStorage(episodeAlertsPromptStorageKey(USER_ID), '');
    noteEpisodeAlertsCandidate({ userId: USER_ID, tmdbId: 11, title: 'North' });
    return () => dismissEpisodeAlertsPrompt();
  }, []);
  return <EpisodeAlertsPrompt userId={USER_ID} />;
}

export default {
  title: 'Components/EpisodeAlertsPrompt',
  component: EpisodeAlertsPrompt,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div style={{ minHeight: '100vh' }}><Story /></div>],
};

export const Prompt = {
  render: () => <Harness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(canvas.getByText(EPISODE_ALERTS.promptQuestion)).toBeInTheDocument();
      expect(canvas.getByRole('button', { name: EPISODE_ALERTS.promptAction })).toBeInTheDocument();
    });
  },
};
