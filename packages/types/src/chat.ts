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

export type LlmStatusType =
  | 'completed'
  | 'failed'
  | 'in_progress'
  | 'cancelled'
  | 'queued'
  | 'incomplete';

/** 토큰 사용량 — 나중에 어드민 사용량 표시 / 구독 쿼터에 쓰려고 모든 LLM 호출에서 수집 */
export interface LlmUsageType {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** chat() 결과 — 자유 텍스트 응답 */
export interface ChatResType {
  id: string;
  model: string;
  status: LlmStatusType;
  text: string;
  usage?: LlmUsageType;
}

/** structured() 결과 — 스키마로 검증된 파싱 객체(parsed) + 사용량 */
export interface StructuredResType<T> {
  id: string;
  model: string;
  status: LlmStatusType;
  parsed: T;
  usage?: LlmUsageType;
}
