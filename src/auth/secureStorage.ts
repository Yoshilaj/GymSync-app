/**
 * Where the session actually lives on disk.
 *
 * It used to be plain AsyncStorage — an unencrypted SQLite file — which meant the
 * refresh token sat in cleartext on the device and in any unencrypted backup. A
 * refresh token is a long-lived credential; it can be exchanged for access tokens
 * indefinitely until it's revoked.
 *
 * WHY NOT JUST USE SECURESTORE. Its values are capped at ~2048 bytes, and a Supabase
 * session doesn't fit: measured against the real project, the session for an account
 * with no metadata to speak of is **2110 bytes** (the ES256 access token alone is
 * 855). Anyone with a display name, a profile photo URL, or an enrolled MFA factor is
 * further over. Expo currently only warns, and says it may throw in a future SDK, so
 * storing the session there directly is a time bomb with a fuse of unknown length.
 *
 * So: a random 256-bit key lives in SecureStore (small, keychain-backed, not in
 * plain backups), and the session is AES-CTR encrypted into AsyncStorage. The
 * ciphertext is useless without the keychain entry. This is the pattern Supabase
 * documents for React Native.
 *
 * MIGRATION. Existing installs already have a plaintext session under the same key.
 * The first read finds it, re-writes it encrypted, and removes the plaintext — so
 * nobody gets signed out by this change. See getItem.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import aesjs from 'aes-js';

/** Per-value key, so one compromised entry doesn't unlock the others. */
const keyName = (storageKey: string) => `gymsync_sk_${storageKey.replace(/[^A-Za-z0-9._-]/g, '_')}`;

async function loadOrCreateKey(storageKey: string): Promise<number[]> {
  const name = keyName(storageKey);
  const existing = await SecureStore.getItemAsync(name);
  if (existing) return Array.from(aesjs.utils.hex.toBytes(existing));

  const fresh = Array.from(await Crypto.getRandomBytesAsync(32));
  await SecureStore.setItemAsync(name, aesjs.utils.hex.fromBytes(fresh));
  return fresh;
}

function cipher(key: number[]) {
  // CTR with a fixed counter is safe here only because a key is never reused
  // across values: one key encrypts exactly one storage entry, and a rewrite of
  // that entry replaces the whole plaintext rather than editing it in place.
  return new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(1));
}

async function encrypt(storageKey: string, value: string): Promise<string> {
  const key = await loadOrCreateKey(storageKey);
  return aesjs.utils.hex.fromBytes(cipher(key).encrypt(aesjs.utils.utf8.toBytes(value)));
}

async function decrypt(storageKey: string, hex: string): Promise<string | null> {
  const name = keyName(storageKey);
  const stored = await SecureStore.getItemAsync(name);
  if (!stored) return null; // key gone (app reinstall) — the ciphertext is dead
  const key = Array.from(aesjs.utils.hex.toBytes(stored));
  try {
    return aesjs.utils.utf8.fromBytes(cipher(key).decrypt(aesjs.utils.hex.toBytes(hex)));
  } catch {
    return null;
  }
}

/** Ciphertext lives beside the old plaintext, under a distinct key, so a partial
 * migration can never leave the two confusable. */
const cipherKey = (storageKey: string) => `${storageKey}__enc`;

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(cipherKey(key));
    if (encrypted) {
      const plain = await decrypt(key, encrypted);
      if (plain !== null) return plain;
      // Undecryptable (the keychain entry went away — reinstall, restored backup).
      // Drop it rather than hand supabase-js garbage; the user signs in again.
      await AsyncStorage.removeItem(cipherKey(key));
      return null;
    }

    // One-shot migration off the old plaintext entry.
    const legacy = await AsyncStorage.getItem(key);
    if (legacy === null) return null;
    try {
      await AsyncStorage.setItem(cipherKey(key), await encrypt(key, legacy));
      await AsyncStorage.removeItem(key);
    } catch {
      // If re-encrypting fails, still return the session. Being signed out is a
      // worse outcome than staying on the old storage for one more launch.
    }
    return legacy;
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(cipherKey(key), await encrypt(key, value));
      // Belt and braces: make sure a pre-migration plaintext copy can't linger.
      await AsyncStorage.removeItem(key);
    } catch {
      // A failed persist (keychain unavailable, disk full) must not reject into
      // supabase-js's storage pipeline — that turns "couldn't save the session"
      // into an unhandled rejection inside the auth bootstrap. The in-memory
      // session keeps working; worst case the user signs in again next launch.
    }
  },

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.multiRemove([cipherKey(key), key]);
    await SecureStore.deleteItemAsync(keyName(key));
  },
};
