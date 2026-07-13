import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * 인증 토큰 저장소. access/refresh 두 토큰을 기기 보안 저장소(Keychain/Keystore)에 보관한다.
 * - 메모리 캐시를 둬서 매 요청마다 디스크를 읽지 않는다 (undefined = 아직 안 읽음).
 * - SecureStore 는 웹을 지원하지 않으므로 Expo 웹에서는 localStorage 로 폴백한다.
 */
const ACCESS_KEY = 'companion.accessToken';
const REFRESH_KEY = 'companion.refreshToken';

const isWeb = Platform.OS === 'web';

async function readKey(key: string): Promise<string | null> {
  if (isWeb) return globalThis.localStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}
async function writeKey(key: string, value: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}
async function deleteKey(key: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

let accessCache: string | null | undefined;
let refreshCache: string | null | undefined;

export async function getAccessToken(): Promise<string | null> {
  if (accessCache === undefined) accessCache = await readKey(ACCESS_KEY);
  return accessCache;
}

export async function getRefreshToken(): Promise<string | null> {
  if (refreshCache === undefined) refreshCache = await readKey(REFRESH_KEY);
  return refreshCache;
}

export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  accessCache = accessToken;
  refreshCache = refreshToken;
  await Promise.all([writeKey(ACCESS_KEY, accessToken), writeKey(REFRESH_KEY, refreshToken)]);
}

export async function clearTokens(): Promise<void> {
  accessCache = null;
  refreshCache = null;
  await Promise.all([deleteKey(ACCESS_KEY), deleteKey(REFRESH_KEY)]);
}
