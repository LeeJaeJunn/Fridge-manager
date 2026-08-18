/**
 * 재고 "추가 제안"(`AddProposalItemType`)을 다루는 규칙 — **채팅 확인 카드와 스캔 확인 화면이 공유한다.**
 *
 * 두 화면은 생김새가 다르지만(카드 vs 목록) 다루는 값과 규칙은 같다: 사용자가 고친 값을 제안에
 * 되반영하고, 확인하면 서버가 받는 모양으로 바꿔 보낸다. 규칙을 화면마다 따로 두면 한쪽만 고쳐져
 * 어긋나므로(예: "수량을 고치면 합산 근거를 지운다"를 한쪽에서 빠뜨림) 여기 모은다.
 */

import type { AddIngredientInputType, AddProposalItemType } from '@companion/types';

import type { FormValues } from '@/components';

/**
 * 편집값을 제안 항목에 반영한다.
 *
 * ⚠️ **수량을 고치면 `merge`(기존 2개 · 추가 후 4개)를 함께 지운다.** 그 표시는 "왜 이 숫자인지"를
 * 설명하는 건데, 사용자가 숫자를 직접 바꾸면 더 이상 그 숫자를 설명하지 못해 거짓말이 된다.
 *
 * 날짜를 직접 골랐으면 `USER` 로 올린다 — 저장 때 그 값만 서버로 넘어간다(`toAddInput` 참고).
 * "기본값"으로 두면 `ESTIMATED` 라 서버가 저장 시 다시 추정한다(그래서 분류·보관만 바꾼 경우
 * 화면의 날짜는 저장 전까지 옛 추정치다 — 추정 계산을 앱에 한 번 더 구현하지 않으려는 선택이다).
 */
export function applyEdit(item: AddProposalItemType, v: FormValues): AddProposalItemType {
  return {
    ...item,
    name: v.name,
    category: v.category as AddProposalItemType['category'],
    storage: v.storage as AddProposalItemType['storage'],
    quantityNote: v.quantityNote,
    ...(v.expiresAt
      ? { estimatedExpiry: v.expiresAt, expirySource: 'USER' as const }
      : { expirySource: 'ESTIMATED' as const }),
    merge: undefined,
  };
}

/**
 * 제안 항목 → 서버가 받는 추가 입력(`POST /inventory` · 확인 카드 apply 공통).
 *
 * **`expiresAt` 은 사용자가 준 표기일(`USER`)일 때만 싣는다.** 추정치를 그대로 돌려보내면 서버가
 * 그걸 "사용자가 확정한 날짜"로 승격해 버려서, 이후 분류·보관을 바꿔도 다시 추정하지 않는다.
 */
export function toAddInput(item: AddProposalItemType): AddIngredientInputType {
  return {
    name: item.name,
    category: item.category,
    storage: item.storage,
    ...(item.quantityNote ? { quantityNote: item.quantityNote } : {}),
    ...(item.expirySource === 'USER' ? { expiresAt: item.estimatedExpiry } : {}),
  };
}
