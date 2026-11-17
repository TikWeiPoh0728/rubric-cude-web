/**
 * Turn a photo file into ImageData for the scan worker: applies the EXIF rotation
 * (phone photos) and scales it down to `maxWidth` on the main thread, so only a
 * small buffer crosses to the worker.
 */
export async function loadImageData(source: Blob, maxWidth = 320): Promise<ImageData> {
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  try {
    const k = Math.min(1, maxWidth / bitmap.width);
    const w = Math.max(1, Math.round(bitmap.width * k));
    const h = Math.max(1, Math.round(bitmap.height * k));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  } finally {
    bitmap.close();
  }
}
