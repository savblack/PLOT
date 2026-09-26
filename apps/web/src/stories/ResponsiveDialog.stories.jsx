import { useState } from 'react';
import { fn } from 'storybook/test';
import ResponsiveDialog from '../components/ResponsiveDialog.jsx';

function AddToListExample({ onClose }) {
  const [creating, setCreating] = useState(false);
  return (
    <ResponsiveDialog
      title={creating ? 'New list' : 'Add to list'}
      onClose={onClose}
      onBack={creating ? () => setCreating(false) : undefined}
      contentClassName="responsive-dialog-content--flush"
      footer={!creating ? (
        <>
          <button type="button" className="add-list-new" onClick={() => setCreating(true)}><span>+</span>Create new list</button>
          <button type="button" className="btn btn-primary btn-sm">Done</button>
        </>
      ) : null}
    >
      {creating ? (
        <form className="add-list-create">
          <label htmlFor="story-list-name">List name</label>
          <input id="story-list-name" placeholder="e.g. Rainy Sunday films" autoFocus />
          <p>You can customise the cover and list details after creating it.</p>
          <div className="add-list-create-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreating(false)}>Cancel</button>
            <button type="button" className="btn btn-primary btn-sm">Create list</button>
          </div>
        </form>
      ) : (
        <div className="responsive-dialog-picker">
          <div className="add-list-context"><span className="add-list-context-poster" /><span><small>Adding</small><strong>Deep Water</strong></span></div>
          <div className="add-list-top-five">
            <button type="button" className="add-list-top-row"><span className="add-list-rank-mark">5</span><span className="add-list-copy"><strong>Top 5 Movies</strong><small>Not ranked</small></span><span className="add-list-chevron">⌄</span></button>
          </div>
          <div className="responsive-dialog-scroll add-list-rows">
            <div className="add-list-section-label">Your lists</div>
            <button type="button" className="add-list-row selected"><span className="add-list-cover"><i /><i /><i /></span><span className="add-list-copy"><strong>Sunday comfort films</strong><small>12 items</small></span><span className="add-list-check">✓</span></button>
            <button type="button" className="add-list-row"><span className="add-list-cover"><i /><i /><i /></span><span className="add-list-copy"><strong>To watch with Ben</strong><small>8 items</small></span><span className="add-list-check" /></button>
          </div>
        </div>
      )}
    </ResponsiveDialog>
  );
}

export default {
  title: 'Components/ResponsiveDialog',
  component: ResponsiveDialog,
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
  decorators: [
    Story => (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '2rem' }}>
        <h1 style={{ fontFamily: 'var(--font-display)' }}>My lists</h1>
        <Story />
      </div>
    ),
  ],
};

export const AddToList = {
  args: { onClose: fn() },
  render: args => <AddToListExample {...args} />,
};
