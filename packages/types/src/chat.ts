/**
 * LLM 호출에 쓰는 벤더 중립 채팅 타입.
 *
 * 프레임워크 무관 순수 타입만 둔다. DTO, class-validator, DB row,
 * OpenAI 원본 타입처럼 한쪽 구현에만 필요한 타입은 각 앱 내부에 둔다.
 */

export type ChatRoleType = 'user' | 'assistant';

export interface ChatMessageType {
  role: ChatRoleType;
  content: string;
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
