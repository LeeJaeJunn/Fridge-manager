/**
 * 인증 만료 이벤트 버스.
 * client.ts 는 refresh 가 최종 실패하면(세션 사망) emitAuthExpired 를 호출하고,
 * AuthProvider 가 이를 구독해 전역 상태를 unauthenticated 로 되돌린다.
 * (client 가 AuthProvider 를 직접 import 하지 않도록 이벤트로 느슨하게 연결)
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function onAuthExpired(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitAuthExpired(): void {
  for (const listener of listeners) listener();
}
