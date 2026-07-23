/**
 * Web stub for react-native-webrtc.
 * Metro serves the .native.ts file on iOS/Android.
 * TypeScript compiler reads this file for type-checking.
 */

export class RTCPeerConnection {
  onicecandidate: ((event: { candidate: { toJSON(): object } | null }) => void) | null =
    null;
  ontrack: ((event: { streams: object[] }) => void) | null = null;
  constructor(_config?: object) {}
  createOffer(_options?: object): Promise<{ type: string; sdp: string }> {
    return Promise.resolve({ type: '', sdp: '' });
  }
  createAnswer(): Promise<{ type: string; sdp: string }> {
    return Promise.resolve({ type: '', sdp: '' });
  }
  setLocalDescription(_desc: object): Promise<void> {
    return Promise.resolve();
  }
  setRemoteDescription(_desc: object): Promise<void> {
    return Promise.resolve();
  }
  addIceCandidate(_candidate: object): Promise<void> {
    return Promise.resolve();
  }
  addTrack(_track: object): void {}
  close(): void {}
}

export class RTCIceCandidate {
  constructor(public candidate: object) {}
  toJSON(): object {
    return this.candidate;
  }
}

export const mediaDevices = {
  getUserMedia: (_constraints: object): Promise<MediaStreamLike> =>
    Promise.resolve({ getTracks: () => [] }),
};

export type MediaStreamTrackLike = {
  stop(): void;
  enabled: boolean;
};

export type MediaStreamLike = {
  getTracks(): Array<MediaStreamTrackLike>;
};
