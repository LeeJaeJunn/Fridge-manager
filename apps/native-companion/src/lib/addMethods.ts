/**
 * 재고 추가 방법 — 냉장고 헤더 + 버튼(바텀시트)과 하단 가운데 FAB(스피드다이얼)가 공유한다.
 * 사진·영수증은 v1 이후라 ready:false("준비 중"). 구현되면 ready:true 로 바꾸고 핸들러만 연결.
 */
export type AddMethodKey = 'photo' | 'receipt' | 'manual';

export type AddMethod = {
  key: AddMethodKey;
  emoji: string;
  label: string;
  desc: string;
  ready: boolean;
};

export const ADD_METHODS: AddMethod[] = [
  { key: 'photo', emoji: '📷', label: '사진 촬영', desc: '냉장고를 찍어 재료 인식', ready: false },
  {
    key: 'receipt',
    emoji: '🧾',
    label: '영수증 인식',
    desc: '영수증으로 한 번에 등록',
    ready: false,
  },
  { key: 'manual', emoji: '✏️', label: '직접 입력', desc: '이름·분류·수량을 직접', ready: true },
];
