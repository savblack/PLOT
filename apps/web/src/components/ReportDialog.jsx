import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReport } from '@plot/core/useReport.js';
import { REPORT_DETAIL_MAX } from '@plot/core/moderation.js';
import { COMMON } from '../copy/common.js';
import { MODERATION } from '../copy/moderation.js';

// Matches ConfirmModal's buttons exactly. Web has no shared compact-button
// class — the modals style theirs inline — and a one-off class here would be a
// second source of truth for the same pill.
const SECONDARY_BTN = {
  background: 'transparent', border: '1px solid var(--border-strong)',
  borderRadius: '9999px', padding: '0.55rem 1.1rem',
  fontSize: '0.8rem', fontWeight: 500, fontFamily: 'var(--font-sans)',
  color: 'var(--text-secondary)', cursor: 'pointer',
};
const PRIMARY_BTN = {
  background: 'var(--accent)', border: 'none',
  borderRadius: '9999px', padding: '0.55rem 1.1rem',
  fontSize: '0.8rem', fontWeight: 600, fontFamily: 'var(--font-sans)',
  color: '#fff', cursor: 'pointer',
};

/**
 * Report an account. Mirrors ConfirmModal's shell (portal, overlay, escape,
 * scroll lock, focus restore) so the two read as one system.
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
  const closeRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const titleId = useId();
  const leadId = useId();

  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [busy, onClose]);

  const handleSubmit = async () => {
    const ok = await submit({ reportedId: targetId, surface, reason, detail });
    // Block only after the report actually landed, so a failed submit does not
    // silently do half of what was asked.
    if (ok && alsoBlock) await onBlockToo?.();
  };

  const overLimit = detail.length > REPORT_DETAIL_MAX;

  return createPortal(
    <div
      onClick={() => { if (!busy) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        animation: 'confirmFadeIn 0.15s ease',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={leadId}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: '1.5rem',
          width: '100%', maxWidth: '420px', maxHeight: '85vh', overflowY: 'auto',
          boxShadow: 'var(--shadow-overlay)', animation: 'confirmSlideUp 0.18s var(--ease)',
        }}
      >
        {sent ? (
          <>
            <p id={titleId} style={{ fontFamily: 'var(--font-serif)', fontSize: '1.15rem', margin: '0 0 0.5rem' }}>
              {MODERATION.reportSentTitle}
            </p>
            <p id={leadId} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1.25rem' }}>
              {MODERATION.reportSentBody}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button ref={closeRef} onClick={onClose} style={PRIMARY_BTN}>{COMMON.done}</button>
            </div>
          </>
        ) : (
          <>
            <p id={titleId} style={{ fontFamily: 'var(--font-serif)', fontSize: '1.15rem', margin: '0 0 0.4rem' }}>
              {MODERATION.reportTitle}
            </p>
            <p id={leadId} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 1.1rem' }}>
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

            <div style={{ display: 'flex', gap: '0.625rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button ref={closeRef} onClick={onClose} disabled={busy} style={SECONDARY_BTN}>
                {COMMON.cancel}
              </button>
              <button
                onClick={handleSubmit}
                disabled={busy || !reason || overLimit}
                style={{
                  ...PRIMARY_BTN,
                  cursor: reason && !overLimit ? 'pointer' : 'not-allowed',
                  opacity: reason && !overLimit ? 1 : 0.5,
                }}
                aria-label={`${MODERATION.submitReport}${targetName ? `: ${targetName}` : ''}`}
              >
                {busy ? MODERATION.submitting : MODERATION.submitReport}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
