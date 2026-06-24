/**
 * 클라이언트(native)와 서버(nest)가 공유하는 채팅 API 계약.
 *
 * 프레임워크 무관 순수 타입만 둔다. DTO, class-validator, DB row,
 * OpenAI 원본 타입처럼 한쪽 구현에만 필요한 타입은 각 앱 내부에 둔다.
 */

export type ChatRoleType = 'user' | 'assistant';

export interface ChatMessageType {
  role: ChatRoleType;
  content: string;
}

export interface ChatRequestType {
  characterId: string;
  messages: ChatMessageType[];
}

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

export interface ChatResponseEnvelopeType {
  ok: boolean;
  result: ChatResType;
}

/** GET /chat/characters 응답 항목. instruction/model은 서버 내부 전용이다. */
export interface CharacterSummaryType {
  id: string;
  name: string;
}
