// feedback-attachments is a private bucket. Public object URLs return 400/403.
// Callers store either a legacy public URL, a signed URL, or the storage path.
// Notion cards need a signed URL minted with the service role.

const SOURCE_PATH = /^feedback\/[0-9a-f-]{36}(?:\.[a-z0-9]{1,10})?$/i;

export const FEEDBACK_ATTACHMENT_URL_TTL_SECONDS = 31_536_000;

const MARKERS = [
  '/storage/v1/object/public/feedback-attachments/',
  '/storage/v1/object/sign/feedback-attachments/',
  '/storage/v1/object/authenticated/feedback-attachments/',
];

export function feedbackAttachmentPath(entry: string): string | null {
  if (typeof entry !== 'string' || !entry) return null;
  for (const marker of MARKERS) {
    const index = entry.indexOf(marker);
    if (index === -1) continue;
    const rest = entry.slice(index + marker.length).split('?')[0].split('#')[0];
    let path = rest;
    try { path = decodeURIComponent(rest); } catch { /* keep the raw slice */ }
    return SOURCE_PATH.test(path) ? path : null;
  }
  const raw = entry.split('?')[0];
  return SOURCE_PATH.test(raw) ? raw : null;
}

export function attachmentPathsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const paths: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const path = feedbackAttachmentPath(entry);
    if (path) paths.push(path);
  }
  return paths;
}

type SignedUrlResult = {
  data: { signedUrl?: string } | null
  error: { message?: string } | null
}

type SignClient = {
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (path: string, expiresIn: number) => Promise<SignedUrlResult>
    }
  }
}

export async function signedFeedbackUrl(client: SignClient, path: string): Promise<string> {
  const { data, error } = await client.storage
    .from('feedback-attachments')
    .createSignedUrl(path, FEEDBACK_ATTACHMENT_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error('Failed to sign feedback attachment');
  return data.signedUrl;
}
