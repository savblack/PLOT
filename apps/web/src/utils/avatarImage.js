// Re-encode a picked avatar as a square JPEG before upload.
//
// Browser-only (canvas), so it lives here rather than in @plot/core; mobile
// already uploads JPEG from expo-image-manipulator (apps/mobile/lib/avatar.ts).
//
// The avatars bucket is public and used to accept whatever bytes the picker
// handed over, under whatever type the browser reported. An SVG with a
// <script> went in as image/svg+xml and ran when opened on the storage origin.
// Settings has always cropped to JPEG through a canvas (SettingsView.jsx); the
// public-profile editor uploaded the raw file. Both now land as JPEG, and the
// bucket itself only accepts raster image types (migration 20261014090100).

export const AVATAR_OUTPUT_SIZE = 512;

/**
 * @param {Blob} file
 * @param {number} [size] output edge length in pixels
 * @returns {Promise<Blob>} a JPEG, centre-cropped to a square
 */
export async function toAvatarJpeg(file, size = AVATAR_OUTPUT_SIZE) {
  const bitmap = await loadImage(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  if (typeof bitmap.close === 'function') bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('avatar encode failed'))), 'image/jpeg', 0.9);
  });
}

/** @param {Blob} file */
async function loadImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch { /* Safari cannot bitmap some formats; fall through to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('avatar decode failed'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
