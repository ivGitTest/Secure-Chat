import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'server_url';

export const DEFAULT_SERVER_URL = 'https://chat.naviry.xyz';

export async function getServerUrl(): Promise<string | null> {
  const stored = await AsyncStorage.getItem(KEY);
  if (stored) return stored;
  // Default to the family server so the APK works out of the box.
  // Users can still change it via the "Сменить сервер" screen.
  await AsyncStorage.setItem(KEY, DEFAULT_SERVER_URL);
  return DEFAULT_SERVER_URL;
}

export async function setServerUrl(url: string): Promise<void> {
  const normalized = url.replace(/\/+$/, '');
  await AsyncStorage.setItem(KEY, normalized);
}

export async function clearServerUrl(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
