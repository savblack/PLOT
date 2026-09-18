import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import GroupedFilterMenu from '../components/GroupedFilterMenu.jsx';

export default {
  title: 'Components/GroupedFilterMenu',
  component: GroupedFilterMenu,
  tags: ['interaction-test'],
  parameters: { layout: 'padded', a11y: { test: 'error' } },
};

function Wrapper() {
  const [types, setTypes] = useState(['movie', 'tv']);
  const [statuses, setStatuses] = useState([]);

  const groups = [
    {
      heading: 'Type',
      value: types,
      defaultValue: ['movie', 'tv'],
      onChange: setTypes,
      options: [
        { id: 'movie', label: 'Movies' },
        { id: 'tv', label: 'TV' },
      ],
    },
    {
      heading: 'Status',
      value: statuses,
      defaultValue: [],
      onChange: setStatuses,
      options: [
        { id: 'watching', label: 'Watching' },
        { id: 'seen', label: 'Seen' },
        { id: 'saved', label: 'Saved' },
      ],
    },
  ];

  return <GroupedFilterMenu ariaLabel="Filter" groups={groups} />;
}

export const Default = {
  render: () => <Wrapper />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'Filter' });

    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const watching = canvas.getByRole('checkbox', { name: 'Watching' });
    await userEvent.click(watching);
    await expect(watching).toBeChecked();
    await expect(trigger).toHaveClass('active');

    await userEvent.click(canvasElement.ownerDocument.body);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  },
};
