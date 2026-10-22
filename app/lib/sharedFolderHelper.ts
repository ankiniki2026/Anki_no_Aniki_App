import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'my_shared_folder_ids';

export async function getMySharedFolderIds(): Promise<string[]> {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    if (!json) return [];
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to load my_shared_folder_ids', e);
    return [];
  }
}

export async function saveMySharedFolderId(id: string): Promise<void> {
  try {
    const list = await getMySharedFolderIds();
    if (!list.includes(id)) {
      list.push(id);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  } catch (e) {
    console.error('Failed to save my_shared_folder_id', e);
  }
}

export async function removeMySharedFolderId(id: string): Promise<void> {
  try {
    const list = await getMySharedFolderIds();
    const updated = list.filter((item) => item !== id);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to remove my_shared_folder_id', e);
  }
}
