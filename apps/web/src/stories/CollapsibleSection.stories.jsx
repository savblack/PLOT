import CollapsibleSection from '../components/CollapsibleSection.jsx';

export default {
  title: 'Components/CollapsibleSection',
  component: CollapsibleSection,
  args: {
    id: 'storybook-demo-section',
    label: 'Watching',
    count: 4,
    defaultOpen: true,
  },
};

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
