import { useRef, useState } from 'react';
import { useReport } from '@plot/core/useReport.js';
import { REPORT_DETAIL_MAX } from '@plot/core/moderation.js';
import { MODERATION } from '../copy/moderation.js';
import ResponsiveDialog from './ResponsiveDialog.jsx';
import DialogActions from './DialogActions.jsx';
import { useFocusCancel, useStableClose } from '../hooks/useDialogClose.js';

// Read by screen readers, not drawn.
const SR_ONLY = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };

/**
 * Report an account. The shell is ResponsiveDialog's (portal, overlay,
 * Escape, scroll lock, focus restore): Cancel in the header, Submit report
 * bottom right. Nothing closes it while a report is being sent.
 *
 * The success state is a state of this dialog rather than a toast: Guideline
 * 1.2 asks for "timely responses to concerns", and the floor for that is the
 * reporter being told their report arrived and roughly when it will be looked
 * at. A dialog that just closes says nothing happened.
 *
 * `onBlockToo` is offered here because reporting someone and wanting them gone
 * usually arrive together, but it is optional: Apple lists report and block as
 * two separate capabilities, and neither may require the other.
 */
export default function ReportDialog({ targetId, targetName, surface, viewerId, onClose, onBlockToo }) {
  const { submit, busy, error, sent } = useReport(viewerId);
  const [reason, setReason] = useState(null);
  const [detail, setDetail] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const bodyRef = useRef(null);
  const close = useStableClose(onClose, busy);
  // Focus starts on Cancel, and goes back there once the report is sent and
  // the submit button is gone.
  useFocusCancel(bodyRef, sent);

  const handleSubmit = async () => {
    const ok = await submit({ reportedId: targetId, surface, reason, detail });
    // Block only after the report actually landed, so a failed submit does not
    // silently do half of what was asked.
    if (ok && alsoBlock) await onBlockToo?.();
  };

  const overLimit = detail.length > REPORT_DETAIL_MAX;

  return (
    <ResponsiveDialog
      title={sent ? MODERATION.reportSentTitle : MODERATION.reportTitle}
      onClose={close}
      size="compact"
      footer={sent ? null : (
        <DialogActions
          busy={busy}
          primary={{
            // The visible label stays short; the person being reported is in
            // the button's accessible name, as it was before.
            label: <>{busy ? MODERATION.submitting : MODERATION.submitReport}{targetName && <span style={SR_ONLY}>{`: ${targetName}`}</span>}</>,
            onClick: handleSubmit,
            disabled: !reason || overLimit,
          }}
        />
      )}
    >
      <div ref={bodyRef} style={{ padding: '1rem 1.25rem 1.25rem' }}>
        {sent ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
            {MODERATION.reportSentBody}
          </p>
        ) : (
          <>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 1.1rem' }}>
              {MODERATION.reportLead}
            </p>

            <fieldset style={{ border: 'none', padding: 0, margin: '0 0 1rem' }}>
              <legend style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', padding: 0, marginBottom: '0.5rem' }}>
                {MODERATION.reasonLabel}
              </legend>
              {MODERATION.REASONS.map(option => (
                <label
                  key={option.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    padding: '0.5rem 0', cursor: 'pointer',
                    borderBottom: '1px solid var(--border)', fontSize: '0.85rem',
                  }}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={option.id}
                    checked={reason === option.id}
                    onChange={() => setReason(option.id)}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>

            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              {MODERATION.detailLabel}
            </label>
            <textarea
              value={detail}
              onChange={e => setDetail(e.target.value)}
              placeholder={MODERATION.detailPlaceholder}
              rows={3}
              style={{
                width: '100%', boxSizing: 'border-box', resize: 'vertical',
                background: 'var(--surface-raised)', color: 'var(--text-primary)',
                border: `1px solid ${overLimit ? '#dc2626' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)', padding: '0.6rem',
                fontFamily: 'var(--font-sans)', fontSize: '0.85rem',
              }}
            />

            {onBlockToo && (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', margin: '0.9rem 0 0', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={alsoBlock}
                  onChange={e => setAlsoBlock(e.target.checked)}
                  style={{ accentColor: 'var(--accent)', marginTop: '0.2rem' }}
                />
                <span style={{ fontSize: '0.82rem' }}>
                  {MODERATION.alsoBlock}
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {MODERATION.alsoBlockHint}
                  </span>
                </span>
              </label>
            )}

            {(error || overLimit) && (
              <p role="alert" style={{ color: '#dc2626', fontSize: '0.78rem', margin: '0.9rem 0 0' }}>
                {overLimit ? MODERATION.detailTooLong : error}
              </p>
            )}
          </>
        )}
      </div>
    </ResponsiveDialog>
  );
}
