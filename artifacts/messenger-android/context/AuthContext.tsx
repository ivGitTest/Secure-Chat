import React, {
  createContext,
  useCallback,
  useContext,
  useState,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  getToken,
  getUsers,
  logout as apiLogout,
  removeToken,
  saveToken,
} from '@/api/client';
import { wsService } from '@/services/wsService';
import type { User } from '@/types';

interface AuthState {
  token: string | null;
  userId: string | null;
  userName: string | null;
  users: User[];
}

interface AuthContextValue extends AuthState {
  setAuth: (token: string, userId: string, userName: string) => Promise<void>;
  clearAuth: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  /** Restore auth from storage without navigating (called on splash). */
  restoreAuth: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    userId: null,
    userName: null,
    users: [],
  });

  const refreshUsers = useCallback(async () => {
    try {
      const list = await getUsers();
      setState((prev) => ({ ...prev, users: list }));
    } catch {
      // silent — users list will be empty until next refresh
    }
  }, []);

  const setAuth = useCallback(
    async (token: string, userId: string, userName: string) => {
      await saveToken(token);
      await Promise.all([
        SecureStore.setItemAsync('user_id', userId),
        SecureStore.setItemAsync('user_name', userName),
      ]);
      setState({ token, userId, userName, users: [] });
      await wsService.connect();
      await refreshUsers();
    },
    [refreshUsers],
  );

  const clearAuth = useCallback(async () => {
    wsService.disconnect();
    try {
      await apiLogout();
    } catch {
      // ignore logout errors
    }
    await removeToken();
    await Promise.all([
      SecureStore.deleteItemAsync('user_id'),
      SecureStore.deleteItemAsync('user_name'),
    ]);
    setState({ token: null, userId: null, userName: null, users: [] });
  }, []);

  const restoreAuth = useCallback(async (): Promise<boolean> => {
    const token = await getToken();
    if (!token) return false;
    const [userId, userName] = await Promise.all([
      SecureStore.getItemAsync('user_id'),
      SecureStore.getItemAsync('user_name'),
    ]);
    if (!userId) return false;
    setState({ token, userId, userName: userName ?? userId, users: [] });
    void wsService.connect();
    void refreshUsers();
    return true;
  }, [refreshUsers]);

  return (
    <AuthContext.Provider
      value={{ ...state, setAuth, clearAuth, refreshUsers, restoreAuth }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
