import { apiFetch } from '@/api/client';
import type {
  CharacterType,
  CreateCharacterRequestType,
  PresetSummaryType,
  UpdateCharacterRequestType,
} from '@companion/types';

/** 세팅(온보딩) 화면용 프리셋 목록 */
export function fetchPresets(): Promise<PresetSummaryType[]> {
  return apiFetch<PresetSummaryType[]>('/characters/presets');
}

/** 내 캐릭터 조회 — 아직 만들기 전이면 null */
export function fetchMyCharacter(): Promise<CharacterType | null> {
  return apiFetch<CharacterType | null>('/characters/me');
}

/** 프리셋 선택 + (선택)이름으로 내 캐릭터 생성 */
export function createCharacter(
  body: CreateCharacterRequestType,
): Promise<CharacterType> {
  return apiFetch<CharacterType>('/characters', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** 캐릭터 이름 수정 */
export function updateCharacterName(
  body: UpdateCharacterRequestType,
): Promise<CharacterType> {
  return apiFetch<CharacterType>('/characters/me', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/** 내 캐릭터 삭제 (테스트/리셋용 — 온보딩을 다시 보기 위함) */
export function deleteMyCharacter(): Promise<void> {
  return apiFetch<void>('/characters/me', { method: 'DELETE' });
}
