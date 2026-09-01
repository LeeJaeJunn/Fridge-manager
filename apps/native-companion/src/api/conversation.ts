import { apiFetch } from '@/api/client';
import type {
  ApplyProposalRequestType,
  ConversationDetailType,
  ConversationSummaryType,
  CookDishRequestType,
  CookDishResultType,
  InventoryProposalType,
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

/**
 * 요리 카드의 "자세한 레시피" 버튼 — 그 요리로 네이버 검색을 돌린다.
 *
 * ⚠️ **LLM 을 안 거친다.** 무엇을 검색할지가 이미 카드에 데이터로 있어서, 모델에게 다시 물을
 * 이유가 없다. 응답은 다른 제안 API 와 같은 `{ messages }` 라 화면은 **뒤에 이어붙이기만** 한다.
 */
export function searchDishRecipes(
  conversationId: string,
  messageId: string,
): Promise<ResolveProposalResultType> {
  return apiFetch<ResolveProposalResultType>(
    `/conversations/${conversationId}/messages/${messageId}/recipes`,
    { method: 'POST' },
  );
}

/**
 * "만들었어요" 1단계 — 무엇을 얼마나 뺄지 제안만 받아온다. **서버는 아무것도 저장하지 않는다.**
 * 전용 LLM 호출이 끼어 1초쯤 걸린다.
 */
export function cookPreview(
  conversationId: string,
  messageId: string,
): Promise<InventoryProposalType> {
  return apiFetch<InventoryProposalType>(
    `/conversations/${conversationId}/messages/${messageId}/cook-preview`,
    { method: 'POST' },
  );
}

/**
 * "만들었어요" 2단계 — 확인한 값으로 재고를 반영한다.
 *
 * ⚠️ **응답이 다른 제안 API 와 모양이 다르다.** 새 아이템이 생기는 게 아니라 **요리 카드가
 * 바뀌므로**(`cookedAt` 이 찍힌다) 그 메시지 하나를 돌려받아 목록에서 교체한다.
 */
export function cookDish(
  conversationId: string,
  messageId: string,
  body: CookDishRequestType,
): Promise<CookDishResultType> {
  return apiFetch<CookDishResultType>(
    `/conversations/${conversationId}/messages/${messageId}/cook`,
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
