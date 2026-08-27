import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { getDeviceUuid } from './deviceUuid';
import { Alert, Platform } from 'react-native';

/**
 * 端末固有のUUIDがFirestoreの "bannedUsers" に存在するかどうかを非同期チェック
 */
export async function checkIsUserBanned(): Promise<boolean> {
  try {
    const deviceUuid = await getDeviceUuid();
    if (!deviceUuid) return false;

    const bannedDocRef = doc(db, "bannedUsers", deviceUuid);
    const docSnap = await getDoc(bannedDocRef);

    return docSnap.exists();
  } catch (error) {
    console.error("bannedUsers check error:", error);
    return false;
  }
}

/**
 * ファイル共有ボタンタップ時にパーミッションを検証し、
 * bannedUsersに登録されている場合は「あなたのファイル共有機能は制限されています」と警告を出して処理を中断させる
 */
export async function verifyFileSharePermission(t?: (key: any) => string): Promise<boolean> {
  const isBanned = await checkIsUserBanned();
  if (isBanned) {
    const message = t ? t('fileShareBanned') : 'あなたのファイル共有機能は制限されています';
    if (Platform.OS === 'web') {
      window.alert(message);
    } else {
      Alert.alert('機能制限', message);
    }
    return false;
  }
  return true;
}
