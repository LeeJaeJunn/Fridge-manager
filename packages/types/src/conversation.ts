/**
 * 대화(저장형 채팅) 관련 클라이언트↔서버 공유 계약.
 * 메시지의 instruction/모델 등 서버 내부 사항은 노출하지 않는다.
 */

import type { ChatRoleType } from './chat';

/** 저장된 메시지 한 건 */
export interface MessageType {
  id: string;
  role: ChatRoleType; // 'user' | 'assistant'
  content: string;
  createdAt: string;
}

/** 대화 목록 항목 (GET /conversations) */
export interface ConversationSummaryType {
  id: string;
  title: string | null;
  /** 마지막 메시지 미리보기 (없으면 null) */
  preview: string | null;
  updatedAt: string;
}

/** 대화 상세 (GET /conversations/:id, POST /conversations) */
export interface ConversationDetailType {
  id: string;
  title: string | null;
  messages: MessageType[];
}

/** POST /conversations, POST /conversations/:id/messages 요청 본문 */
export interface SendMessageRequestType {
  content: string;
}
