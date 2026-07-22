export interface User {
  id: string;
  name: string;
}

export interface Conversation {
  id: string;
  participantId: string;
  lastMessage: string | null;
  lastMessageTime: string | null;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
}

export interface ApiConfig {
  version: string;
  websocketUrl: string;
  stunServers: string[];
  turnServers: Array<{ urls: string; username?: string; credential?: string }>;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: { id: string; name: string };
}

export interface WsEnvelope {
  type: string;
  payload?: Record<string, unknown>;
  timestamp?: string;
}

export interface IncomingCallState {
  callerId: string;
  callerName: string;
}
