import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getDeviceUuid(): Promise<string> {
  try {
    let deviceUuid = await AsyncStorage.getItem('device_uuid');
    if (!deviceUuid) {
      deviceUuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
      await AsyncStorage.setItem('device_uuid', deviceUuid);
    }
    return deviceUuid;
  } catch (e) {
    console.error('Failed to get or create device_uuid', e);
    return 'default_device_uuid';
  }
}
