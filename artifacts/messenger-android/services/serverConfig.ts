import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'server_url';

export async function getServerUrl(): Promise<string | null> {
  return AsyncStorage.getItem(KEY);
}

export async function setServerUrl(url: string): Promise<void> {
  const normalized = url.replace(/\/+$/, '');
  await AsyncStorage.setItem(KEY, normalized);
}

export async function clearServerUrl(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
