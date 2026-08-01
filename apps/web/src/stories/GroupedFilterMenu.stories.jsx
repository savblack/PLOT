import { useState } from 'react';
import GroupedFilterMenu from '../components/GroupedFilterMenu.jsx';

export default {
  title: 'Components/GroupedFilterMenu',
  component: GroupedFilterMenu,
  parameters: { layout: 'padded' },
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

export const Default = () => <Wrapper />;
