import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * 인증 토큰 저장소. access/refresh 를 **한 JSON 객체**로 묶어 기기 보안 저장소
 * (Keychain/Keystore)에 보관한다 — 한쪽만 저장 실패해 두 토큰이 어긋나는 것을 막는다.
 * - 메모리 캐시를 둬서 매 요청마다 디스크를 읽지 않는다 (undefined = 아직 안 읽음).
 * - SecureStore 는 웹을 지원하지 않아 Expo 웹(dev 편의용)에서는 localStorage 로 폴백한다.
 *   웹은 배포 대상이 아니므로 여기서 localStorage 보안은 고려 대상이 아니다.
 */
const KEY = 'companion.authTokens';

const isWeb = Platform.OS === 'web';

type Tokens = { accessToken: string; refreshToken: string };

async function readRaw(): Promise<string | null> {
  if (isWeb) return globalThis.localStorage?.getItem(KEY) ?? null;
  return SecureStore.getItemAsync(KEY);
}
async function writeRaw(value: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.setItem(KEY, value);
    return;
  }
  await SecureStore.setItemAsync(KEY, value);
}
async function deleteRaw(): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.removeItem(KEY);
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}

function parseTokens(raw: string): Tokens | null {
  try {
    const obj = JSON.parse(raw) as Partial<Tokens>;
    return typeof obj.accessToken === 'string' && typeof obj.refreshToken === 'string'
      ? { accessToken: obj.accessToken, refreshToken: obj.refreshToken }
      : null;
  } catch {
    return null;
  }
}

// undefined = 아직 안 읽음, null = 저장된 세션 없음
let cache: Tokens | null | undefined;

async function load(): Promise<Tokens | null> {
  if (cache === undefined) {
    const raw = await readRaw();
    cache = raw ? parseTokens(raw) : null;
  }
  return cache;
}

export async function getAccessToken(): Promise<string | null> {
  return (await load())?.accessToken ?? null;
}

export async function getRefreshToken(): Promise<string | null> {
  return (await load())?.refreshToken ?? null;
}

export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  cache = { accessToken, refreshToken };
  await writeRaw(JSON.stringify(cache));
}

export async function clearTokens(): Promise<void> {
  cache = null;
  await deleteRaw();
}
