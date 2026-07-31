import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { WsEnvelope } from '@/types';

type WsEventType =
  | 'message.new'
  | 'message.delivered'
  | 'call.incoming'
  | 'call.accept'
  | 'call.initiated'
  | 'call.reject'
  | 'call.end'
  | 'webrtc.offer'
  | 'webrtc.answer'
  | 'webrtc.iceCandidate'
  | 'error'
  | 'connect'
  | 'disconnect';

type Handler = (payload: Record<string, unknown>) => void;

// React Native's WebSocket accepts a third options argument
type RNWebSocketCtor = new (
  url: string,
  protocols: string | string[] | undefined,
  options: { headers: Record<string, string> },
) => WebSocket;

class WsService {
  private ws: WebSocket | null = null;
  private handlers = new Map<WsEventType, Set<Handler>>();
  private reconnectDelay = 1000;
  private readonly maxDelay = 30000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private active = false;

  on(event: WsEventType, handler: Handler): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  private emit(event: WsEventType, payload: Record<string, unknown> = {}): void {
    this.handlers.get(event)?.forEach((h) => {
      try {
        h(payload);
      } catch (e) {
        console.error('[WS] handler error', e);
      }
    });
  }

  async connect(): Promise<void> {
    this.active = true;
    this.reconnectDelay = 1000;
    await this.doConnect();
  }

  private async doConnect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      const serverUrl = await AsyncStorage.getItem('server_url');
      const token = await SecureStore.getItemAsync('access_token');
      if (!serverUrl || !token) return;

      const wsUrl = serverUrl.replace(/^http/, 'ws') + '/ws';

      const RNWebSocket = globalThis.WebSocket as unknown as RNWebSocketCtor;
      this.ws = new RNWebSocket(wsUrl, undefined, {
        headers: { Authorization: `Bearer ${token}` },
      });

      this.ws.onopen = () => {
        console.log('[WS] connected');
        this.reconnectDelay = 1000;
        this.emit('connect');
        this.startPing();
      };

      this.ws.onmessage = (event) => {
        try {
          const env = JSON.parse(event.data as string) as WsEnvelope;
          this.emit(env.type as WsEventType, (env.payload ?? {}) as Record<string, unknown>);
        } catch (e) {
          console.error('[WS] parse error', e);
        }
      };

      this.ws.onclose = (event) => {
        console.log('[WS] closed', event.code);
        this.stopPing();
        this.emit('disconnect', { code: event.code });
        // Don't reconnect on auth failure
        if (this.active && event.code !== 4401) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        console.error('[WS] error');
      };
    } catch (e) {
      console.error('[WS] connect failed', e);
      if (this.active) this.scheduleReconnect();
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => this.send({ type: 'ping' }), 30_000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(delay * 2, this.maxDelay);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.doConnect();
    }, delay);
  }

  disconnect(): void {
    this.active = false;
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  send(envelope: WsEnvelope): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(envelope));
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Returns a Promise that resolves when the WebSocket is (or becomes) open,
   * or rejects after `timeoutMs` milliseconds.
   *
   * This method waits PASSIVELY — it does NOT call connect() itself.
   * The auth layer is responsible for calling wsService.connect() after
   * restoring the session. This avoids the cold-start race where the token
   * is not yet available in SecureStore when the CallKeep answer event fires.
   *
   * Typical usage: call this after the user accepts from a CallKeep screen,
   * rely on restoreAuth() → wsService.connect() to fire the 'connect' event.
   */
  waitForConnect(timeoutMs = 12_000): Promise<void> {
    if (this.isConnected()) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        unsub();
        reject(new Error(`WS waitForConnect timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const unsub = this.on('connect', () => {
        clearTimeout(timer);
        unsub();
        resolve();
      });
      // No this.connect() call here — auth restoration drives the connection.
    });
  }
}

export const wsService = new WsService();
