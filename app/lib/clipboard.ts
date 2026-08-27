import { Clipboard, Platform } from 'react-native';

/**
 * 外部ライブラリなしでテキストをクリップボードにコピーする関数
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    if (Clipboard && typeof Clipboard.setString === 'function') {
      Clipboard.setString(text);
      return true;
    }
    return false;
  } catch (e) {
    console.error('Failed to copy to clipboard:', e);
    return false;
  }
}
