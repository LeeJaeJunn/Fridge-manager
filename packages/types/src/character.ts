/**
 * 캐릭터(컴패니언) 관련 클라이언트↔서버 공유 계약.
 *
 * 유저당 캐릭터는 **하나**(1:1)다. `instruction`/`model` 은 서버 내부 전용이라
 * 클라이언트에 노출하지 않는다 (신뢰 경계).
 */

/** 세팅 화면에서 고르는 프리셋 목록 항목 (GET /characters/presets) */
export interface PresetSummaryType {
  id: string;
  name: string;
  /** 사람이 읽는 짧은 소개 (예: "오래 알고 지낸 따뜻한 친구") */
  description: string;
}

/** 클라이언트에 내려주는 내 캐릭터 (표시용 — instruction 비노출) */
export interface CharacterType {
  id: string;
  name: string;
  description: string | null;
  presetId: string | null;
  createdAt: string;
}

/** POST /characters — 프리셋만 선택해 내 캐릭터 생성 (이름은 프리셋 기본값, 수정은 PATCH로 나중) */
export interface CreateCharacterRequestType {
  presetId: string;
}

/** PATCH /characters/me — 이름 수정 */
export interface UpdateCharacterRequestType {
  name: string;
}
