import { apiFetch } from '@/api/client';
import type {
  ConversationDetailType,
  ConversationSummaryType,
  MessageType,
  SendMessageRequestType,
} from '@companion/types';

/** 내 대화 목록 (최근순) */
export function fetchConversations(): Promise<ConversationSummaryType[]> {
  return apiFetch<ConversationSummaryType[]>('/conversations');
}

/** 대화 1개 + 메시지들 */
export function fetchConversation(id: string): Promise<ConversationDetailType> {
  return apiFetch<ConversationDetailType>(`/conversations/${id}`);
}

/** 새 대화 시작 (첫 메시지) → 생성된 대화(+첫 교환) 반환 */
export function startConversation(
  body: SendMessageRequestType,
): Promise<ConversationDetailType> {
  return apiFetch<ConversationDetailType>('/conversations', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** 기존 대화에 메시지 전송 → 답변 메시지 반환 */
export function sendMessage(
  id: string,
  body: SendMessageRequestType,
): Promise<MessageType> {
  return apiFetch<MessageType>(`/conversations/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** 대화 삭제 */
export function deleteConversation(id: string): Promise<void> {
  return apiFetch<void>(`/conversations/${id}`, { method: 'DELETE' });
}

/** 대화 속 개별 메시지 삭제 */
export function deleteMessage(
  conversationId: string,
  messageId: string,
): Promise<void> {
  return apiFetch<void>(`/conversations/${conversationId}/messages/${messageId}`, {
    method: 'DELETE',
  });
}
