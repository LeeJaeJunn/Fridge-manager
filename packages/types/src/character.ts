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
}

/** 클라이언트에 내려주는 내 캐릭터 (표시용 — instruction 비노출) */
export interface CharacterType {
  id: string;
  name: string;
  presetId: string | null;
  createdAt: string;
}

/** POST /characters — 프리셋 선택 + (선택)이름으로 내 캐릭터 생성 */
export interface CreateCharacterRequestType {
  presetId: string;
  name?: string;
}

/** PATCH /characters/me — 이름 수정 */
export interface UpdateCharacterRequestType {
  name: string;
}
