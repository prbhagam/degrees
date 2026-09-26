// Owner: shared mobile scaffold (Charles) — image picking + Supabase Storage upload, added Sep 26 (wave 2).
// The one place the app writes to Supabase directly, and only to Storage: docs/API-CONTRACTS.md has the client
// upload the bytes first, then post the resulting path to the API, which records the pointer. Storage policies
// (migration 0007) only let a signed-in user write inside a group they belong to (event-photos/<groupId>/…) or
// their own avatar folder (avatars/<userId>/…). Mock-mode dev (no Supabase env) returns a fake path so the
// flow can still be exercised.
import * as ImagePicker from 'expo-image-picker';
import { getSupabaseClient, isSupabaseEnvironmentUnset } from './supabase';

export const PHOTO_BUCKET = 'event-photos';
export const AVATAR_BUCKET = 'avatars';
// Keeps uploads inside the bucket's 10 MB limit and Expo Go's memory comfort zone.
const IMAGE_QUALITY = 0.8;

export interface PickedImage {
  uri: string;
  mimeType: string;
}

// Opens the photo library; null when the person cancels or denies access.
export async function pickImage(options: { square?: boolean } = {}): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Allow photo access in Settings to add a photo.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: options.square ?? false,
    aspect: options.square ? [1, 1] : undefined,
    quality: IMAGE_QUALITY,
    // The library returns already-resized bytes when it can; a 12 MP original is not what a chat needs.
    exif: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' };
}

function extensionFor(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/heic') return 'heic';
  return 'jpg';
}

function randomId(): string {
  // Not a security boundary: uniqueness within one folder is all that's needed.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readBytes(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  return response.arrayBuffer();
}

// Uploads into event-photos/<groupId>/<id>.<ext> and returns the object path the API expects.
export async function uploadGroupPhoto(groupId: string, image: PickedImage): Promise<string> {
  const path = `${groupId}/${randomId()}.${extensionFor(image.mimeType)}`;
  if (isSupabaseEnvironmentUnset()) return path;
  const bytes = await readBytes(image.uri);
  const { error } = await getSupabaseClient()
    .storage.from(PHOTO_BUCKET)
    .upload(path, bytes, { contentType: image.mimeType, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

// Uploads into avatars/<userId>/<id>.<ext> (a public bucket) and returns the public URL to store on the profile.
export async function uploadAvatar(userId: string, image: PickedImage): Promise<string> {
  const path = `${userId}/${randomId()}.${extensionFor(image.mimeType)}`;
  if (isSupabaseEnvironmentUnset()) return `https://example.invalid/avatars/${path}`;
  const supabase = getSupabaseClient();
  const bytes = await readBytes(image.uri);
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, bytes, { contentType: image.mimeType, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}
