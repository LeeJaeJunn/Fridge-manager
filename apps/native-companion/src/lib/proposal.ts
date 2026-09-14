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
 * 만료일은 **폼이 이미 세 상태(미설정/기본값/직접)를 날짜+출처 한 짝으로 정리해서** 준다.
 * "기본값"일 때의 날짜도 폼이 계산해 넣어주므로, 여기서도 저장할 때도 다시 해석하지 않는다
 * (예전엔 앱이 날짜를 안 보내고 서버가 추정했는데, 그러면 화면에 본 날짜와 저장값이 갈라졌다).
 */
export function applyEdit(item: AddProposalItemType, v: FormValues): AddProposalItemType {
  return {
    ...item,
    name: v.name,
    category: v.category as AddProposalItemType['category'],
    storage: v.storage as AddProposalItemType['storage'],
    quantityNote: v.quantityNote,
    // 폼이 세 상태(미설정/기본값/직접)를 이미 정리해서 준다 — 여기서 다시 해석하지 않는다.
    expiresAt: v.expiresAt,
    expirySource: v.expirySource,
    merge: undefined,
  };
}

/**
 * 제안 항목 → 서버가 받는 추가 입력(`POST /inventory` · 확인 카드 apply 공통).
 *
 * 만료일은 **있을 때만** 싣는다 — 생략하면 서버가 미설정으로 저장한다(추정하지 않는다).
 * `expirySource` 를 함께 보내야 "직접 고름"과 "기본값"이 구분돼 기록된다. 빼면 전부 `USER` 가 된다.
 */
export function toAddInput(item: AddProposalItemType): AddIngredientInputType {
  return {
    name: item.name,
    category: item.category,
    storage: item.storage,
    ...(item.quantityNote ? { quantityNote: item.quantityNote } : {}),
    ...(item.expiresAt ? { expiresAt: item.expiresAt, expirySource: item.expirySource } : {}),
  };
}
