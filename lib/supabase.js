import { createClient } from '@supabase/supabase-js';

// The URL and publishable key are public by design; env vars override them per environment.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gkkkfzaypfsqhvytqosp.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_r46ZHx50VNHamHlS5mgQyQ_wluX5DFg';

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'gb-auth' },
});

export const PHOTO_BUCKET = 'nob_photos';
export const photoUrl = (path) => (path ? `${url}/storage/v1/object/public/${PHOTO_BUCKET}/${path}` : '');

// Shrinks the picture to at most 1600px and re-encodes it as JPEG, which also drops location data from the camera.
async function toJpeg(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.82));
}

// Uploads a plot photo and returns its path, or throws.
export async function uploadPhoto(file) {
  if (!file.type.startsWith('image/')) throw new Error('not_image');
  const blob = await toJpeg(file);
  const path = `pending/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}
