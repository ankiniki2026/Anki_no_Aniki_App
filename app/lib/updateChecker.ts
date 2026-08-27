import * as Updates from 'expo-updates';
import { Platform, Alert } from 'react-native';

/**
 * 最新のOTAアップデートを確認し、存在する場合は自動ダウンロードしてアプリをリロード（Updates.reloadAsync）する関数
 */
export async function checkAndApplyUpdates(
  manualCheck: boolean = false,
  t?: (key: any) => string
): Promise<void> {
  const isWeb = (Platform.OS as string) === 'web';
  const getText = (key: string, fallback: string) => (t ? t(key) : fallback);

  // Web環境や開発環境(__DEV__)ではexpo-updatesが動作しないためスキップ
  if (__DEV__ || isWeb) {
    if (manualCheck) {
      const msg = getText('devOrWebUpdateDisabled', '開発環境またはWeb環境では自動更新は無効です。');
      const title = getText('updateCheckTitle', 'アップデート確認');
      if (isWeb) {
        window.alert(msg);
      } else {
        Alert.alert(title, msg);
      }
    }
    return;
  }

  try {
    const update = await Updates.checkForUpdateAsync();

    if (update.isAvailable) {
      if (manualCheck) {
        if (isWeb) {
          window.alert(getText('updateFoundMsg', '新しいバージョンが見つかりました。アップデートをダウンロードします...'));
        } else {
          Alert.alert(
            getText('updateAvailableTitle', 'アップデートあり'),
            getText('updateDownloadingMsg', '新しいバージョンをダウンロードしてアプリを再起動します。')
          );
        }
      }

      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } else {
      if (manualCheck) {
        const msg = getText('appUpToDateMsg', 'アプリは既に最新の状態です。');
        const title = getText('updateCheckTitle', 'アップデート確認');
        if (isWeb) {
          window.alert(msg);
        } else {
          Alert.alert(title, msg);
        }
      }
    }
  } catch (error: any) {
    console.log('Update check failed:', error);
    if (manualCheck) {
      const errorMsg = error?.message || getText('networkError', 'ネットワークエラー');
      const msg = getText('updateCheckFailedMsg', 'アップデートの確認に失敗しました: ') + errorMsg;
      const title = getText('errorTitle', 'エラー');
      if (isWeb) {
        window.alert(msg);
      } else {
        Alert.alert(title, msg);
      }
    }
  }
}
