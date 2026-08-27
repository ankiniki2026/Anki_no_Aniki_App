import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * Returns the card_images directory in FileSystem.documentDirectory
 */
export async function getCardImagesDir(): Promise<string> {
  const docDir = (FileSystem as any).documentDirectory || '';
  const dir = `${docDir}card_images/`;
  if (Platform.OS !== 'web' && docDir) {
    try {
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }
    } catch (e) {
      console.error('Failed to create card_images directory:', e);
    }
  }
  return dir;
}

/**
 * Copies a selected image URI (from ImagePicker or elsewhere) into permanent documentDirectory storage.
 * Returns the current valid absolute document directory path.
 */
export async function saveCardImage(sourceUri: string, target: 'front' | 'back'): Promise<string> {
  if (Platform.OS === 'web' || !sourceUri) {
    return sourceUri;
  }

  // If sourceUri is already in card_images directory, resolve and check
  const resolved = resolveImageUri(sourceUri);
  if (sourceUri.includes('/card_images/')) {
    if (resolved) {
      try {
        const info = await FileSystem.getInfoAsync(resolved);
        if (info.exists) {
          return resolved;
        }
      } catch (e) {
        // proceed to copy if info check fails
      }
    }
  }

  try {
    const dir = await getCardImagesDir();
    const cleanUri = sourceUri.split('?')[0];
    const ext = cleanUri.endsWith('.png') ? 'png' : 'jpg';
    const filename = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${target}.${ext}`;
    const destPath = `${dir}${filename}`;

    await FileSystem.copyAsync({
      from: sourceUri,
      to: destPath,
    });

    return destPath;
  } catch (e) {
    console.error('Failed to copy card image:', e);
    return sourceUri;
  }
}

/**
 * Resolves a card image URI string to the current container path.
 * Handles iOS sandbox UUID changes by mapping old container paths or relative paths to current FileSystem.documentDirectory.
 */
export function resolveImageUri(uri: string | undefined | null): string | undefined {
  if (!uri) return undefined;
  if (Platform.OS === 'web') return uri;

  // Web URLs or base64 data URIs
  if (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('data:')) {
    return uri;
  }

  const docDir = (FileSystem as any).documentDirectory || '';
  if (!docDir) return uri;

  // Check if uri contains '/card_images/'
  const cardImagesIdx = uri.indexOf('/card_images/');
  if (cardImagesIdx !== -1) {
    const relativePart = uri.substring(cardImagesIdx + 1); // 'card_images/filename.jpg'
    return `${docDir}${relativePart}`;
  }

  // Check relative path starting with 'card_images/'
  if (uri.startsWith('card_images/')) {
    return `${docDir}${uri}`;
  }

  // If it's another absolute path in Documents/ (e.g. from older app versions)
  const docsIdx = uri.indexOf('/Documents/');
  if (docsIdx !== -1) {
    const relativePart = uri.substring(docsIdx + 11); // relative to Documents/
    return `${docDir}${relativePart}`;
  }

  return uri;
}
