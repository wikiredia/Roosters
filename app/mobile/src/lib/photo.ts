import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { apiBase } from './server';
import { accessToken } from './session';

/** Where someone's profile photo is: the version in the URL, so a new photo is a new image to the cache. */
export function photoSource(uid: number, v: number) {
  const token = accessToken();
  return { uri: `${apiBase()}/api/v1/users/${uid}/photo?v=${v}`, headers: token ? { Authorization: `Bearer ${token}` } : undefined };
}

/** Pick a photo (library or camera), crop it square and shrink it to 256×256: a JPEG as base64, or null when
 * cancelled or not allowed. The server takes it as is (r_me.put_photo). */
export async function pickPhoto(from: 'library' | 'camera'): Promise<string | null> {
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
  let res: ImagePicker.ImagePickerResult;
  if (from === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    res = await ImagePicker.launchCameraAsync(opts);
  } else {
    res = await ImagePicker.launchImageLibraryAsync(opts);
  }
  const asset = res.canceled ? null : res.assets[0];
  if (!asset) return null;
  const side = Math.min(asset.width, asset.height);
  const ctx = ImageManipulator.manipulate(asset.uri);
  // Not cropped by the picker (web, some Androids): the middle square
  if (asset.width !== asset.height) ctx.crop({ originX: (asset.width - side) / 2, originY: (asset.height - side) / 2, width: side, height: side });
  ctx.resize({ width: 256, height: 256 });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  return out.base64 ?? null;
}
