import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * 軽微なバイブレーション（ハプティックフィードバック）を発生させます。
 * Web環境では動作をスキップします。
 */
export function triggerHaptic() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}
