import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Small preferences (language, last tab). Never secrets. */
export const prefs = {
  async get<T>(key: string, fallback: T): Promise<T> {
    try {
      const raw = await AsyncStorage.getItem(`rp:${key}`);
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  async set(key: string, value: unknown) {
    try {
      await AsyncStorage.setItem(`rp:${key}`, JSON.stringify(value));
    } catch {
      // storage full or unavailable: preferences are optional
    }
  },
  async remove(key: string) {
    try {
      await AsyncStorage.removeItem(`rp:${key}`);
    } catch {}
  },
};

/** Tokens: the phone's keychain/keystore. The web build (only for testing) falls back to AsyncStorage. */
export const secrets = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return AsyncStorage.getItem(`rp-secret:${key}`);
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string) {
    if (Platform.OS === 'web') return AsyncStorage.setItem(`rp-secret:${key}`, value);
    return SecureStore.setItemAsync(key, value);
  },
  async remove(key: string) {
    if (Platform.OS === 'web') return AsyncStorage.removeItem(`rp-secret:${key}`);
    return SecureStore.deleteItemAsync(key);
  },
};
