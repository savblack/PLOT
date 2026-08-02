import { useState } from 'react';
import MultiSelect from '../components/MultiSelect.jsx';

const GENRE_OPTIONS = [
  { id: 'drama', label: 'Drama' },
  { id: 'comedy', label: 'Comedy' },
  { id: 'thriller', label: 'Thriller' },
  { id: 'horror', label: 'Horror' },
  { id: 'romance', label: 'Romance' },
];

export default {
  title: 'Components/MultiSelect',
  component: MultiSelect,
  parameters: { layout: 'padded' },
};

function Wrapper({ initial = [] }) {
  const [value, setValue] = useState(initial);
  return (
    <MultiSelect
      placeholder="Genres"
      options={GENRE_OPTIONS}
      value={value}
      onChange={setValue}
    />
  );
}

export const Empty = () => <Wrapper />;
export const OneSelected = () => <Wrapper initial={['drama']} />;
export const MultipleSelected = () => <Wrapper initial={['drama', 'comedy', 'horror']} />;
