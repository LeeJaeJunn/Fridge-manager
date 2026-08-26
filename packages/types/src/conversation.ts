/**
 * 대화(저장형 채팅) 관련 클라이언트↔서버 공유 계약.
 * 메시지의 instruction/모델 등 서버 내부 사항은 노출하지 않는다.
 *
 * 대화는 말풍선만이 아니라 **툴 호출·결과까지 한 줄기 시간순 아이템**으로 표현한다
 * (OpenAI Responses 의 input/output 아이템과 같은 모양). 그래서 툴이 늘어도 계약에
 * 필드가 늘지 않고, 앱이 모르는 툴은 조용히 건너뛰면 된다.
 */

import type { ChatRoleType } from './chat';
import type { AddIngredientInputType, AddProposalItemType } from './ingredient';

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
  /**
   * 다 써서 냉장고에서 뺄지. 카드의 "다 먹음" 토글이 이 값이다.
   *
   * ⚠️ **`remaining` 과 별개 필드인 게 요점이다.** 예전엔 `remaining: null` 하나가 "다 씀"과
   * "얼마 남았는지 모름"을 겸했는데, 수량 메모가 없는 재고를 일부만 쓴 경우
   * ("고추장 좀 썼어")에 모델이 남은 양을 적을 수 없어 **재료가 통째로 제거**됐다.
   */
  finished: boolean;
  /** 제안된 남은 양. `null` = 수량을 그대로 둔다(모르거나 안 바뀜), 값 = 그 값으로 갱신 */
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

/**
 * 요리 제안의 재료 한 줄 (`propose_dish` 의 `resolved`).
 *
 * ⚠️ **"냉장고에 있나"를 모델에게 묻지 않는다** — 서버가 재고 목록에 매칭해 채운다.
 * 모델에게 물으면 카드가 "없음"이라는데 재고 화면엔 있는 어긋남이 생긴다(`resolveConsume` 과
 * 같은 정규화 규칙을 쓰므로 판정이 한 곳이다).
 */
export interface DishIngredientType {
  /** 모델이 말한 재료명. 재고에 있으면 **재고 쪽 이름**으로 바뀐다(카드와 냉장고가 같은 말을 쓰게) */
  name: string;
  /** 이 요리에 드는 양 ("200g", "반 모", "2큰술") — 자유텍스트다. 레시피 단위는 정규화가 안 된다 */
  amount: string;
  /** 매칭된 재고 행. `null` = 냉장고에 없음(=사야 함) */
  ingredientId: string | null;
  /** 매칭됐을 때 현재 냉장고 수량 — 카드가 "200g (냉장고: 1kg)" 를 그리는 근거 */
  currentQuantityNote: string | null;
}

/**
 * `propose_dish` 호출의 `resolved` 모양 — 요리 카드가 그리는 값이다.
 *
 * **요리가 정해진 순간을 객체로 남기는 게 목적**이다. 예전엔 추천이 말풍선 텍스트로만 남아서
 * (i) 저장할 수 없고 (ii) 나중에 "다 만들었어" 할 때 무엇을 얼마나 썼는지 모델이 대화를
 * 되짚어 추측해야 했다.
 */
export interface DishProposalType {
  dishName: string;
  servings: number;
  /** 대략적인 조리 시간(분). 모델이 모르면 없다 */
  cookMinutes?: number;
  ingredients: DishIngredientType[];
  steps: string[];
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

/**
 * POST /conversations/:id/messages/:messageId/apply 요청 — 사용자가 확인 카드에서 **편집한 최종 값**.
 *
 * 제안(`InventoryProposalType`)과 같은 축(`consume`/`add`)으로 되돌려준다. 카드가 그린 것과 같은
 * 모양이어야 "무엇을 보내는 중인지"가 이름만 보고 읽힌다.
 */
export interface ApplyProposalRequestType {
  /**
   * 소비 항목의 최종 값. **제안에 없던 `ingredientId` 는 서버가 버린다**(임의 id 주입 차단).
   * 이름이 아니라 id 로 보내는 이유: 제안과 확인 사이에 재고가 바뀌어도 사용자가 카드에서 본
   * 바로 그 행을 가리키기 위해서다.
   */
  consume: Array<{
    ingredientId: string;
    /** 다 써서 냉장고에서 뺀다 */
    finished: boolean;
    /** 최종 남은 양. `null` = 수량을 건드리지 않는다 (`finished` 가 true 면 무시된다) */
    remaining: string | null;
  }>;
  /**
   * 추가 항목의 최종 목록 — 사용자가 고치거나 뺀 결과.
   *
   * 소비와 달리 제안과 대조해 거르지 않는다. 이름·수량을 고치는 게 이 기능의 목적이라 대조할
   * 키가 없기 때문이다. 신뢰 경계 문제도 아니다 — 사용자는 어차피 `POST /inventory` 로 아무 재료나
   * 넣을 수 있으므로 권한 상승이 아니고, 길이·개수 방어는 서버(DTO + `inventory.add`)가 한다.
   *
   * 항목 모양이 `POST /inventory` 와 같아서 서버 검증(`AddIngredientItemDto`)을 그대로 재사용한다.
   * `expiresAt` 은 **사용자가 날짜를 직접 고른 경우에만** 싣는다(그때만 서버가 `USER` 로 승격).
   */
  add: AddIngredientInputType[];
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
