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

// One year. Matches FEEDBACK_ATTACHMENT_URL_TTL_SECONDS in
// supabase/functions/_shared/feedbackAttachments.ts. The bucket is private,
// so a public object URL no longer loads.
export const FEEDBACK_ATTACHMENT_URL_TTL_SECONDS = 31536000;

/**
 * Signed URL for a screenshot the browser just uploaded.
 * @param {{ from: (bucket: string) => { createSignedUrl: (path: string, expiresIn: number) => Promise<{ data: { signedUrl?: string } | null, error: { message?: string } | null }> } }} storage
 * @param {string} path
 * @returns {Promise<{ url: string | null, error: { message?: string } | Error | null }>}
 */
export async function feedbackAttachmentSignedUrl(storage, path) {
  const { data, error } = await storage
    .from('feedback-attachments')
    .createSignedUrl(path, FEEDBACK_ATTACHMENT_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return { url: null, error: error || new Error('missing signed url') };
  return { url: data.signedUrl, error: null };
}

export function buildFeedbackAttachmentPath(fileName, id = crypto.randomUUID()) {
  const ext = typeof fileName === 'string' && fileName.includes('.')
    ? `.${fileName.split('.').pop().toLowerCase()}`
    : '';

  return `feedback/${id}${ext}`;
}
