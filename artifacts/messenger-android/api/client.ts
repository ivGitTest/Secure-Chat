import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type {
  ApiConfig,
  Conversation,
  LoginResponse,
  Message,
  User,
} from '@/types';

const TOKEN_KEY = 'access_token';

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function removeToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function baseUrl(): Promise<string> {
  const url = await AsyncStorage.getItem('server_url');
  if (!url) throw new Error('URL сервера не настроен');
  return url;
}

interface ApiError extends Error {
  status: number;
}

async function apiFetch<T>(
  path: string,
  options?: RequestInit,
  requiresAuth = true,
): Promise<T> {
  const base = await baseUrl();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  };
  if (requiresAuth) {
    const token = await getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${base}/api/v1${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    const err: ApiError = Object.assign(
      new Error(body.message ?? `HTTP ${response.status}`),
      { status: response.status },
    );
    throw err;
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function login(
  userId: string,
  pin: string,
  deviceId: string,
): Promise<LoginResponse> {
  return apiFetch<LoginResponse>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ userId, pin, deviceId }) },
    false,
  );
}

export function logout(): Promise<void> {
  return apiFetch<void>('/auth/logout', { method: 'POST' });
}

export function getMe(): Promise<User> {
  return apiFetch<User>('/users/me');
}

export function getUsers(): Promise<User[]> {
  return apiFetch<User[]>('/users');
}

export function getConversations(): Promise<Conversation[]> {
  return apiFetch<Conversation[]>('/conversations');
}

export function getMessages(
  conversationId: string,
  limit = 50,
  before?: string,
): Promise<Message[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.append('before', before);
  return apiFetch<Message[]>(
    `/conversations/${conversationId}/messages?${params.toString()}`,
  );
}

export function getConfig(): Promise<ApiConfig> {
  return apiFetch<ApiConfig>('/config');
}

/**
 * Register (or refresh) the Expo push token for this device.
 * Called on every app launch after login — the server upserts, so repeated
 * calls are safe and handle FCM token rotation automatically.
 */
export function registerPushToken(token: string): Promise<void> {
  return apiFetch<void>('/devices/push-token', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}
