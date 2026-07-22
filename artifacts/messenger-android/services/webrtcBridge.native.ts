/**
 * Native implementation — exports real react-native-webrtc classes.
 * Metro picks this file on iOS/Android builds.
 */
export {
  RTCPeerConnection,
  RTCIceCandidate,
  mediaDevices,
} from 'react-native-webrtc';

export type { MediaStream as MediaStreamLike } from 'react-native-webrtc';
