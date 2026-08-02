/**
 * 대화(저장형 채팅) 관련 클라이언트↔서버 공유 계약.
 * 메시지의 instruction/모델 등 서버 내부 사항은 노출하지 않는다.
 */

import type { ChatRoleType } from './chat';
import type { ExpirySourceType, IngredientCategoryType, StorageAreaType } from './ingredient';
import type { ProductType } from './product';

/**
 * 소비 제안 한 항목 (소비 확인 카드용).
 * 서버가 이름→재고 행을 resolve 해 현재 수량과 제안된 남은 양을 담아 내려준다.
 */
export interface ConsumeProposalItemType {
  /** 대상 재고 행 id (확인 시 apply 가 이 id 로 반영) */
  ingredientId: string;
  name: string;
  /** 현재 냉장고에 표시된 수량 메모 (없으면 null) — 카드에 "현재 5개"로 보여줌 */
  currentQuantityNote: string | null;
  /** 제안된 남은 양. null = 다 씀(제거), 값 = 부분 소비(그 값으로 갱신) */
  remaining: string | null;
}

/**
 * 추가 제안 한 항목 (추가 확인 카드용).
 * 서버가 파싱·정규화하고 만료일을 추정해 담는다 — 저장은 확인 시 apply 가 한다.
 */
export interface AddProposalItemType {
  name: string;
  category: IngredientCategoryType;
  storage: StorageAreaType;
  quantityNote?: string;
  /** 추정 만료일 (ISO). 사용자가 표기일을 줬으면 그 값 */
  estimatedExpiry: string;
  expirySource: ExpirySourceType;
}

/**
 * LLM 이 채팅에서 만든 재고 변경 제안 — 바로 반영하지 않고 사용자 확인 카드로 띄운다.
 * 한 제안에 소비/추가가 함께 올 수 있다. 확인/취소 결과를 status 에 박아 히스토리·재접속에서도
 * 상태가 유지된다(products 스냅샷과 같은 방침).
 */
export interface InventoryProposalType {
  status: 'pending' | 'applied' | 'dismissed';
  consume?: ConsumeProposalItemType[];
  add?: AddProposalItemType[];
}

/** 저장된 메시지 한 건 */
export interface MessageType {
  id: string;
  role: ChatRoleType; // 'user' | 'assistant'
  content: string;
  createdAt: string;
  /** 상품추천 답변일 때 첨부된 상품 스냅샷 (카드 렌더용). 그 외엔 없음. */
  products?: ProductType[];
  /** 이 검색에 이어볼 상품이 더 있는지 (products 있을 때만 의미). false면 "더보기" 숨김. */
  hasMoreProducts?: boolean;
  /** 재고 변경 제안(소비 확인 카드). 없으면 일반 메시지. */
  pendingChange?: InventoryProposalType;
}

/** POST /conversations/:id/messages/:messageId/apply 요청 — 사용자가 편집한 최종 값 */
export interface ApplyProposalRequestType {
  items: Array<{
    ingredientId: string;
    /** 최종 남은 양. null = 다 씀(제거) */
    remaining: string | null;
  }>;
}

/**
 * apply 응답 — 상태가 갱신된 원본 메시지 + (선택) 확정 후 완료 답변.
 * A 단계에선 `completion` 항상 null(클라가 템플릿 표시). B-완료턴에서 여기 LLM 답변을 채우면
 * 클라 변경 없이 승격된다(클라는 completion 이 있으면 말풍선으로 렌더).
 */
export interface ApplyProposalResultType {
  message: MessageType;
  completion: MessageType | null;
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
