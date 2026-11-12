import { useState } from 'react';
import Chip, { ChipRow, Tag } from '../components/Chip.jsx';

// The web app's one chip and one tag, matching the phone app's.
function Preview() {
  const [on, setOn] = useState(['Comedy']);
  const toggle = (g) => setOn(list => (list.includes(g) ? list.filter(x => x !== g) : [...list, g]));
  return (
    <div style={{ display: 'grid', gap: 16, padding: 24, maxWidth: 420 }}>
      <ChipRow>
        {['Action', 'Comedy', 'Drama', 'Horror'].map(g => (
          <Chip key={g} label={g} selected={on.includes(g)} onClick={() => toggle(g)} role="checkbox" />
        ))}
      </ChipRow>
      <ChipRow>
        <Chip size="sm" label="Small" selected onClick={() => {}} />
        <Chip size="sm" label="Disabled" disabled onClick={() => {}} />
      </ChipRow>
      <ChipRow>
        <Tag label="Film" tone="sage" />
        <Tag label="Shared" />
        <Tag label="Premium" tone="accent" />
      </ChipRow>
    </div>
  );
}

export default { title: 'Components/Chip', component: Preview };
export const Default = {};
