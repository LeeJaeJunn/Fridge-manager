/**
 * 클라이언트(native) ↔ 서버(nest) 공유 API 계약.
 *
 * - 프레임워크 무관 **순수 타입**만 둔다. (class-validator 등 Nest 문법 금지)
 * - 나중에 이 폴더(또는 파일)를 그대로 `packages/types` 로 옮겨 native 와 공유한다.
 * - Nest 의 입력 검증은 이 계약을 `implements` 하는 DTO 클래스가 담당한다.
 *
 * 메시지 role 은 'user' | 'assistant' 만 둔다 — 시스템 프롬프트(instruction)는
 * 서버가 별도로 주입하므로 messages 안에 'system' 이 들어갈 일이 없고,
 * 클라이언트의 프롬프트 주입도 타입 차원에서 막힌다.
 */

export type ChatRoleType = 'user' | 'assistant';

export interface ChatMessageType {
  role: ChatRoleType;
  content: string;
}

/** POST /chat 요청 본문 */
export interface ChatRequestType {
  characterId: string;
  messages: ChatMessageType[];
}

/** LLM 호출 결과 (벤더 중립) */
export interface ChatResType {
  id: string;
  model: string;
  status: 'completed' | 'failed' | 'in_progress' | 'cancelled' | 'queued' | 'incomplete';
  text: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}
