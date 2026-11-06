const FEEDBACK_TYPE_LABELS = {
  bug: 'Bug report',
  feature: 'Feature request',
  general: 'General feedback',
};

export function feedbackTypeLabel(type) {
  return FEEDBACK_TYPE_LABELS[type] || FEEDBACK_TYPE_LABELS.general;
}

export function anonymizedFeedbackReporter({ userId, userEmail } = {}) {
  return userId || userEmail ? 'Signed-in Plot user' : 'Anonymous visitor';
}

export { FEEDBACK_ATTACHMENT_URL_TTL_SECONDS, feedbackAttachmentSignedUrl } from '@plot/core/feedbackAttachments.js';

export function buildFeedbackAttachmentPath(fileName, id = crypto.randomUUID()) {
  const ext = typeof fileName === 'string' && fileName.includes('.')
    ? `.${fileName.split('.').pop().toLowerCase()}`
    : '';

  return `feedback/${id}${ext}`;
}
