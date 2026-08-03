/**
 * 대화 아이템 해석 헬퍼 — 채팅 화면이 툴 호출/결과를 화면용으로 좁히는 유일한 지점.
 *
 * 서버는 툴 호출을 **일반 봉투**(`name` + `arguments` + `resolved`)로 내려준다. 툴이 늘어도 계약이
 * 안 바뀌는 대신, 어떤 툴인지는 소비처가 `name` 으로 판정해야 한다. 그 캐스팅을 여기 한 곳에 모은다.
 */

import type { FunctionCallMessageType, InventoryProposalType, MessageType } from '@companion/types';

/** 재고 변경 툴 이름 — 서버 `UPDATE_INVENTORY_TOOL.name` 과 같아야 한다. */
export const INVENTORY_TOOL = 'update_inventory';

/**
 * 툴 호출 → 재고 확인 카드용 제안.
 * **앱이 모르는 툴이면 null** 을 돌려준다 — 백엔드에 툴이 추가돼도 구버전 앱은 그 아이템을
 * 조용히 건너뛸 뿐 깨지지 않는다(이 구조를 택한 이유 중 하나).
 */
export function toInventoryProposal(m: FunctionCallMessageType): InventoryProposalType | null {
  if (m.payload.name !== INVENTORY_TOOL) return null;
  return (m.payload.resolved as InventoryProposalType | undefined) ?? null;
}

export type ProposalOutcomeType = 'applied' | 'dismissed';

/**
 * callId → 처리 결과 맵.
 * 제안의 상태는 별도 필드가 아니라 **짝이 되는 `FUNCTION_CALL_OUTPUT` 의 존재**로 정해진다
 * (서버도 같은 규칙으로 판정한다). 없으면 아직 확인 대기 중이다.
 */
export function outcomesByCallId(messages: MessageType[]): Map<string, ProposalOutcomeType> {
  const map = new Map<string, ProposalOutcomeType>();
  for (const m of messages) {
    if (m.type !== 'FUNCTION_CALL_OUTPUT') continue;
    map.set(m.payload.callId, m.payload.output.applied === true ? 'applied' : 'dismissed');
  }
  return map;
}
