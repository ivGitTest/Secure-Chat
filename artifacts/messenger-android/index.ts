/**
 * Custom entry point for the Семейный мессенджер app.
 *
 * Imports are ordered carefully:
 *  1. firebase-background-handler — registers the FCM background message handler
 *     BEFORE the React tree mounts. This is required so the handler is available
 *     when Android wakes a headless JS task for an incoming call push.
 *  2. expo-router/entry — Expo Router's standard entry that registers the root
 *     component and mounts the navigation tree.
 */

// Step 1: register Firebase background handler
import './firebase-background-handler';

// Step 2: boot Expo Router
import 'expo-router/entry';
