/**
 * Profile photo pick + upload to Supabase Storage (`avatars` bucket).
 *
 * Flow: launch the picker (square crop) → read the local file as bytes →
 * upload to `avatars/{userId}/avatar-{ts}.jpg` → return the public URL, which
 * the caller persists via saveProfile({ avatar_url }).
 */
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/auth/supabase';

export interface PickedAvatar {
  /** Local file URI to preview immediately. */
  uri: string;
  bytes: ArrayBuffer;
}

/** Launch the library picker with a square crop. Null = user cancelled/denied. */
export async function pickAvatar(): Promise<PickedAvatar | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const res = await fetch(asset.uri);
  const bytes = await res.arrayBuffer();
  return { uri: asset.uri, bytes };
}

/** Upload the picked bytes and return the public URL. */
export async function uploadAvatar(
  userId: string,
  picked: PickedAvatar,
): Promise<string> {
  const path = `${userId}/avatar-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, picked.bytes, {
      contentType: 'image/jpeg',
      upsert: true,
    });
  if (error) throw error;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  // Cache-bust so a replaced photo shows immediately.
  return `${data.publicUrl}?t=${Date.now()}`;
}
