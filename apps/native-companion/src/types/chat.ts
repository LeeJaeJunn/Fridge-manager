/**
 * ⚠️ 임시: 백엔드(nest)의 contracts/chat.contract.ts 와 같은 모양.
 * 공유할 게 많아지면 packages/types 로 추출해 양쪽에서 import 한다.
 */
export type ChatRoleType = 'user' | 'assistant';

export interface ChatMessageType {
  role: ChatRoleType;
  content: string;
}

export interface ChatResType {
  id: string;
  model: string;
  status: string;
  text: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

/** GET /chat/characters 응답 항목 (목록용 — persona/model 은 서버만 앎) */
export interface CharacterSummaryType {
  id: string;
  name: string;
}
