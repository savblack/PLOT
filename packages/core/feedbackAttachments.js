// One year. Matches FEEDBACK_ATTACHMENT_URL_TTL_SECONDS in
// supabase/functions/_shared/feedbackAttachments.ts. The bucket is private,
// so a public object URL no longer loads.
export const FEEDBACK_ATTACHMENT_URL_TTL_SECONDS = 31536000;

// The image types the feedback-attachments bucket accepts
// (20261118100000_storage_bucket_hardening.sql). Raster only: an SVG can carry
// script. The form filters to this list so an upload never fails on type.
export const FEEDBACK_ATTACHMENT_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * @param {{ type?: string } | null | undefined} file
 * @returns {boolean}
 */
export function isAllowedFeedbackAttachment(file) {
  return FEEDBACK_ATTACHMENT_MIME_TYPES.includes(file?.type || '');
}

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

