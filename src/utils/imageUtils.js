export function sampleImageCorner(img, itemId, setter) {
  try {
    const canvas = document.createElement('canvas');
    const size = 60;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const srcX = img.naturalWidth - (size * img.naturalWidth / img.width);
    const srcY = 0;
    const srcW = size * img.naturalWidth / img.width;
    const srcH = size * img.naturalHeight / img.height;
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    let r = 0, g = 0, b = 0;
    const pixels = data.length / 4;
    for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i+1]; b += data[i+2]; }
    const luminance = (0.299 * (r / pixels) + 0.587 * (g / pixels) + 0.114 * (b / pixels)) / 255;
    if (luminance > 0.55) setter(prev => ({ ...prev, [itemId]: true }));
  } catch {
    // Cross-origin images may block canvas reads; ignore and keep the default treatment.
  }
}
