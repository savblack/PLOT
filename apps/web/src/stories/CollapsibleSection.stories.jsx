import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import CollapsibleSection from '../components/CollapsibleSection.jsx';

export default {
  title: 'Components/CollapsibleSection',
  component: CollapsibleSection,
  tags: ['interaction-test'],
  parameters: { a11y: { test: 'error' } },
  args: {
    id: 'storybook-demo-section',
    label: 'Watching',
    count: 4,
    defaultOpen: true,
  },
};

function ControlledSection(args) {
  const [open, setOpen] = useState(true);
  return (
    <CollapsibleSection {...args} open={open} onOpenChange={setOpen}>
      <div>Section content goes here.</div>
    </CollapsibleSection>
  );
}

export const Default = {
  render: (args) => (
    <CollapsibleSection {...args}>
      <div style={{ padding: '0.75rem 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
        Section content goes here — posters, rows, whatever this section holds.
      </div>
    </CollapsibleSection>
  ),
};

export const StartCollapsed = {
  args: { defaultOpen: false, id: 'storybook-demo-collapsed' },
  render: Default.render,
};

export const NoCount = {
  args: { count: null, id: 'storybook-demo-nocount' },
  render: Default.render,
};

export const Interaction = {
  args: { id: 'storybook-interaction-section' },
  render: args => <ControlledSection {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('button', { name: /Watching/ });
    const body = canvas.getByText('Section content goes here.').parentElement;

    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(body).toHaveClass('collapse-body-inner');
    await expect(body.parentElement).toHaveClass('collapsed');
  },
};
