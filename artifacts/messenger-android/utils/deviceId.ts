import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'device_id';

export async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(KEY);
  if (!id) {
    id =
      'android-' +
      Date.now().toString(36) +
      Math.random().toString(36).substring(2, 9);
    await AsyncStorage.setItem(KEY, id);
  }
  return id;
}
