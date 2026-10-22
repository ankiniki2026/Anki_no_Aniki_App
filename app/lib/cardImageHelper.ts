import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
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
 * Converts a web image URI (blob: or other) into a compressed Base64 data URI so it persists in storage.
 */
async function saveWebCardImage(sourceUri: string): Promise<string> {
  if (sourceUri.startsWith('data:')) {
    return sourceUri;
  }

  // 1. Try ImageManipulator for resize & compression on web
  try {
    const manipResult = await ImageManipulator.manipulateAsync(
      sourceUri,
      [{ resize: { width: 1024 } }],
      { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    if (manipResult.base64) {
      return `data:image/jpeg;base64,${manipResult.base64}`;
    }
    if (manipResult.uri && manipResult.uri.startsWith('data:')) {
      return manipResult.uri;
    }
  } catch (manipError) {
    console.warn('ImageManipulator resize failed on web, falling back to FileReader:', manipError);
  }

  // 2. Fallback: convert directly to base64 via fetch & FileReader
  try {
    const response = await fetch(sourceUri);
    const blob = await response.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          resolve(sourceUri);
        }
      };
      reader.onerror = () => resolve(sourceUri);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error('Failed to convert web image to base64:', e);
    return sourceUri;
  }
}

/**
 * Copies a selected image URI into permanent documentDirectory storage with automatic resize and compression.
 * For web, compresses and converts to a base64 data URI to persist across page reloads.
 * Returns the current valid absolute document directory path or base64 data URI.
 */
export async function saveCardImage(sourceUri: string, target: 'front' | 'back'): Promise<string> {
  if (!sourceUri) {
    return sourceUri;
  }

  if (Platform.OS === 'web') {
    return await saveWebCardImage(sourceUri);
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
    const filename = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${target}.jpg`;
    const destPath = `${dir}${filename}`;

    // 自動リサイズ・圧縮（最大幅1024px、品質75%のJPEGに軽量化）
    let fileToSaveUri = sourceUri;
    try {
      const manipResult = await ImageManipulator.manipulateAsync(
        sourceUri,
        [{ resize: { width: 1024 } }],
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
      );
      if (manipResult.uri) {
        fileToSaveUri = manipResult.uri;
      }
    } catch (manipErr) {
      console.warn('ImageManipulator compression failed, copying original:', manipErr);
    }

    await FileSystem.copyAsync({
      from: fileToSaveUri,
      to: destPath,
    });

    return destPath;
  } catch (e) {
    console.error('Failed to copy card image:', e);
    return sourceUri;
  }
}

/**
 * Deletes a card image from local storage if it exists in card_images.
 */
export async function deleteCardImage(uri: string | undefined | null): Promise<void> {
  if (!uri || Platform.OS === 'web' || uri.startsWith('data:')) return;
  const resolved = resolveImageUri(uri);
  if (resolved && resolved.includes('/card_images/')) {
    try {
      const info = await FileSystem.getInfoAsync(resolved);
      if (info.exists) {
        await FileSystem.deleteAsync(resolved, { idempotent: true });
      }
    } catch (e) {
      console.error('Failed to delete card image:', e);
    }
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
