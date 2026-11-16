/**
 * Shrink a photo before storing it: longest side 1280 px, JPEG quality 0.7,
 * usually 150–300 KB. Keeps the database and every sync small.
 */
export async function compressPhoto(file: Blob, maxSide = 1280, quality = 0.7): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not process the photo'))),
      'image/jpeg',
      quality,
    ),
  );
}

/** "0800 111 999" → "tel:0800111999" */
export function telHref(phone: string, scheme: 'tel' | 'sms' = 'tel'): string {
  return `${scheme}:${phone.replace(/[^\d+]/g, '')}`;
}
