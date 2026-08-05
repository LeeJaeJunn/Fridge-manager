/**
 * 대화(저장형 채팅) 관련 클라이언트↔서버 공유 계약.
 * 메시지의 instruction/모델 등 서버 내부 사항은 노출하지 않는다.
 *
 * 대화는 말풍선만이 아니라 **툴 호출·결과까지 한 줄기 시간순 아이템**으로 표현한다
 * (OpenAI Responses 의 input/output 아이템과 같은 모양). 그래서 툴이 늘어도 계약에
 * 필드가 늘지 않고, 앱이 모르는 툴은 조용히 건너뛰면 된다.
 */

import type { ChatRoleType } from './chat';
import type { AddProposalItemType } from './ingredient';

/**
 * 모델이 부른 툴 한 건.
 *
 * `resolved` 를 `unknown` 으로 둔 건 의도적이다 — 툴마다 모양이 다르고, 여기에 특정 툴 타입을
 * 박으면 "툴이 늘어도 계약이 안 변한다"는 이점이 사라진다. 소비처가 `name` 을 보고 좁힌다.
 */
export interface FunctionCallPayloadType {
  /** 벤더가 준 호출 식별자. 결과(`FunctionOutputPayloadType.callId`)와 짝을 맞춘다 */
  callId: string;
  /** 툴 이름 (예: 'update_inventory') — 소비처가 이걸로 렌더를 고른다 */
  name: string;
  /** 모델이 만든 인자 (파싱된 객체) */
  arguments: Record<string, unknown>;
  /** 서버가 화면용으로 가공한 값. 툴별로 모양이 다르다 (update_inventory → InventoryProposalType) */
  resolved?: unknown;
}

/** 툴 실행 결과 한 건. 짝이 되는 `FUNCTION_CALL` 이 처리됐다는 표시이기도 하다. */
export interface FunctionOutputPayloadType {
  callId: string;
  /** 툴 이름 — 일부 벤더(Gemini)가 결과 아이템에도 이름을 요구해서 함께 담는다 */
  name: string;
  output: Record<string, unknown>;
}

/**
 * 소비 제안 한 항목 (재고 확인 카드용).
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
 * `update_inventory` 호출의 `resolved` 모양 — 확인 카드가 그리는 값이다.
 *
 * 상태(pending/applied/dismissed)를 **필드로 갖지 않는다.** 같은 `callId` 의
 * `FUNCTION_CALL_OUTPUT` 이 대화에 있으면 처리된 것이고, 없으면 아직 대기 중이다.
 * (상태를 따로 들고 있으면 두 기록이 어긋날 수 있어서 파생값으로 둔다)
 */
export interface InventoryProposalType {
  consume?: ConsumeProposalItemType[];
  add?: AddProposalItemType[];
}

/** 아이템 공통 필드 */
interface MessageBaseType {
  id: string;
  createdAt: string;
}

/** 사람이 읽는 말풍선 */
export interface TextMessageType extends MessageBaseType {
  type: 'TEXT';
  role: ChatRoleType;
  content: string;
}

/** 모델의 툴 호출 — 소비처가 `payload.name` 으로 카드를 고른다 */
export interface FunctionCallMessageType extends MessageBaseType {
  type: 'FUNCTION_CALL';
  payload: FunctionCallPayloadType;
}

/** 툴 실행 결과 */
export interface FunctionOutputMessageType extends MessageBaseType {
  type: 'FUNCTION_CALL_OUTPUT';
  payload: FunctionOutputPayloadType;
}

/**
 * 저장된 대화 아이템 한 건 (판별 유니온).
 * `type` 으로 좁히지 않으면 `content`/`payload` 에 접근할 수 없어서, 새 타입이 생겼을 때
 * 처리를 빠뜨리면 컴파일러가 잡아준다.
 */
export type MessageType = TextMessageType | FunctionCallMessageType | FunctionOutputMessageType;

/** POST /conversations/:id/messages/:messageId/apply 요청 — 사용자가 편집한 최종 값 */
export interface ApplyProposalRequestType {
  items: Array<{
    ingredientId: string;
    /** 최종 남은 양. null = 다 씀(제거) */
    remaining: string | null;
  }>;
}

/**
 * apply/dismiss 응답 — 이번 처리로 **새로 생긴 아이템들**을 시간순으로 돌려준다.
 * 지금은 `FUNCTION_CALL_OUTPUT` 하나뿐이고, 확인 후 완료 답변을 생성하는 단계에서
 * 뒤에 `TEXT` 가 하나 더 붙는다 — 계약을 안 바꾸고 승격되도록 배열로 둔다.
 */
export interface ResolveProposalResultType {
  messages: MessageType[];
}

/** 대화 목록 항목 (GET /conversations) */
export interface ConversationSummaryType {
  id: string;
  title: string | null;
  /** 마지막 말풍선 미리보기 (툴 호출은 건너뛴다. 없으면 null) */
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
