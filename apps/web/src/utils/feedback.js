const FEEDBACK_TYPE_LABELS = {
  bug: 'Bug report',
  feature: 'Feature request',
  general: 'General feedback',
};

export function feedbackTypeLabel(type) {
  return FEEDBACK_TYPE_LABELS[type] || FEEDBACK_TYPE_LABELS.general;
}

export function anonymizedFeedbackReporter({ userId, userEmail } = {}) {
  return userId || userEmail ? 'Signed-in PLOT user' : 'Anonymous visitor';
}

export function buildFeedbackAttachmentPath(fileName, id = crypto.randomUUID()) {
  const ext = typeof fileName === 'string' && fileName.includes('.')
    ? `.${fileName.split('.').pop().toLowerCase()}`
    : '';

  return `feedback/${id}${ext}`;
}

export function buildFeedbackLinearTitle(type, message) {
  const prefix = feedbackTypeLabel(type);
  const normalized = String(message || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return `${prefix}: Untitled`;

  const summary = normalized.length > 72
    ? `${normalized.slice(0, 69).trimEnd()}...`
    : normalized;

  return `${prefix}: ${summary}`;
}
