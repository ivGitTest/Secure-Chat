/**
 * Native implementation — exports real react-native-webrtc classes.
 * Metro picks this file on iOS/Android builds instead of webrtcBridge.ts.
 *
 * Uses a dynamic require() inside try/catch so the app boots normally in
 * Expo Go, which cannot load third-party native modules. In that environment
 * the stubs below are used instead: login, chat, and server config all work
 * as usual; only voice calls are unavailable.
 *
 * In a proper dev build or production APK the real module loads and calls
 * work as intended.
 */

// ─── Type shared with the web stub ───────────────────────────────────────────
export type MediaStreamTrackLike = {
  stop(): void;
  enabled: boolean;
};

export type MediaStreamLike = {
  getTracks(): Array<MediaStreamTrackLike>;
};

// ─── Inline no-op stubs (mirrors webrtcBridge.ts) ────────────────────────────
class StubPeerConnection {
  onicecandidate: ((event: { candidate: { toJSON(): object } | null }) => void) | null = null;
  ontrack: ((event: { streams: object[] }) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  iceConnectionState: string = 'new';
  constructor(_config?: object) {}
  createOffer(_options?: object): Promise<{ type: string; sdp: string }> {
    return Promise.resolve({ type: '', sdp: '' });
  }
  createAnswer(): Promise<{ type: string; sdp: string }> {
    return Promise.resolve({ type: '', sdp: '' });
  }
  setLocalDescription(_desc: object): Promise<void> { return Promise.resolve(); }
  setRemoteDescription(_desc: object): Promise<void> { return Promise.resolve(); }
  addIceCandidate(_candidate: object): Promise<void> { return Promise.resolve(); }
  // addStream was removed in react-native-webrtc v100+; use addTrack instead
  addTrack(_track: object): void {}
  close(): void {}
}

class StubIceCandidate {
  constructor(public candidate: object) {}
  toJSON(): object { return this.candidate; }
}

const stubMediaDevices = {
  getUserMedia: (_constraints: object): Promise<MediaStreamLike> =>
    Promise.resolve({ getTracks: () => [] }),
};

// ─── Load real module or fall back to stubs ───────────────────────────────────
type RNWebRTC = {
  RTCPeerConnection: new (config?: object) => InstanceType<typeof StubPeerConnection>;
  RTCIceCandidate: new (candidate: object) => InstanceType<typeof StubIceCandidate>;
  mediaDevices: typeof stubMediaDevices;
};

let native: RNWebRTC | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  native = require('react-native-webrtc') as RNWebRTC;
} catch {
  // Expo Go: native module not available — stubs will be used.
  if (__DEV__) {
    console.warn(
      '[webrtcBridge] react-native-webrtc not available (Expo Go?). ' +
      'Voice calls are disabled. Use a dev build or production APK for full functionality.',
    );
  }
}

export const RTCPeerConnection: RNWebRTC['RTCPeerConnection'] =
  native?.RTCPeerConnection ?? (StubPeerConnection as unknown as RNWebRTC['RTCPeerConnection']);

export const RTCIceCandidate: RNWebRTC['RTCIceCandidate'] =
  native?.RTCIceCandidate ?? (StubIceCandidate as unknown as RNWebRTC['RTCIceCandidate']);

// Wrap getUserMedia explicitly to:
//   1. Keep the correct `this` binding (prototype method on the native object).
//   2. Fall back to stubs when the native module loaded but getUserMedia is
//      not yet available (e.g. New Architecture lazy initialisation).
export const mediaDevices: typeof stubMediaDevices = {
  getUserMedia: async (constraints: object): Promise<MediaStreamLike> => {
    const md = native?.mediaDevices;
    if (md && typeof md.getUserMedia === 'function') {
      return md.getUserMedia.call(md, constraints) as Promise<MediaStreamLike>;
    }
    if (__DEV__) {
      console.warn(
        '[webrtcBridge] mediaDevices.getUserMedia not a function — using stub.',
        'native loaded:', native !== null,
        'mediaDevices type:', typeof md,
        'getUserMedia type:', typeof md?.getUserMedia,
      );
    }
    return stubMediaDevices.getUserMedia(constraints);
  },
};
