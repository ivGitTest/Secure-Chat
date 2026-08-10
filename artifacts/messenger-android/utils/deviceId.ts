import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const KEY = 'device_id';

export async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(KEY);
  if (!id) {
    id = 'android-' + Crypto.randomUUID();
    await AsyncStorage.setItem(KEY, id);
  }
  return id;
}
