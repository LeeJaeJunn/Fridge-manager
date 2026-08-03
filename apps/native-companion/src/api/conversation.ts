import { apiFetch } from '@/api/client';
import type {
  ApplyProposalRequestType,
  ConversationDetailType,
  ConversationSummaryType,
  ResolveProposalResultType,
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
export function startConversation(body: SendMessageRequestType): Promise<ConversationDetailType> {
  return apiFetch<ConversationDetailType>('/conversations', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * 기존 대화에 메시지 전송 → **이번 턴에 새로 생긴 아이템들** 반환.
 * 한 턴에 말풍선과 툴 호출(확인 카드)이 함께 나올 수 있어서 단건이 아니라 배열이다.
 */
export function sendMessage(
  id: string,
  body: SendMessageRequestType,
): Promise<ResolveProposalResultType> {
  return apiFetch<ResolveProposalResultType>(`/conversations/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** 대화 삭제 */
export function deleteConversation(id: string): Promise<void> {
  return apiFetch<void>(`/conversations/${id}`, { method: 'DELETE' });
}

/** 대화 속 개별 메시지 삭제 */
export function deleteMessage(conversationId: string, messageId: string): Promise<void> {
  return apiFetch<void>(`/conversations/${conversationId}/messages/${messageId}`, {
    method: 'DELETE',
  });
}

/** 재고 변경 제안 확정 — 사용자가 편집한 값으로 반영. 새로 생긴 아이템들(툴 결과 등) 반환 */
export function applyProposal(
  conversationId: string,
  messageId: string,
  body: ApplyProposalRequestType,
): Promise<ResolveProposalResultType> {
  return apiFetch<ResolveProposalResultType>(
    `/conversations/${conversationId}/messages/${messageId}/apply`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

/** 재고 변경 제안 취소 — 반영하지 않고 "취소됨" 결과만 남긴다 */
export function dismissProposal(
  conversationId: string,
  messageId: string,
): Promise<ResolveProposalResultType> {
  return apiFetch<ResolveProposalResultType>(
    `/conversations/${conversationId}/messages/${messageId}/dismiss`,
    { method: 'POST' },
  );
}
