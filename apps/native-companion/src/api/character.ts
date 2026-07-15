import { apiFetch } from '@/api/client';
import type {
  CharacterOptionsType,
  CharacterType,
  CreateCharacterRequestType,
  UpdateCharacterRequestType,
} from '@companion/types';

/** 온보딩 폼 선택지 (성별/관계/말투/성격/관심사) — 서버가 목록을 소유한다 */
export function fetchCharacterOptions(): Promise<CharacterOptionsType> {
  return apiFetch<CharacterOptionsType>('/characters/options');
}

/** 내 캐릭터 조회 — 아직 만들기 전이면 null */
export function fetchMyCharacter(): Promise<CharacterType | null> {
  return apiFetch<CharacterType | null>('/characters/me');
}

/** 캐릭터 상세 생성 (필드 세트 + 관심사). 관심사는 서버가 장기 메모리로 시드한다 */
export function createCharacter(body: CreateCharacterRequestType): Promise<CharacterType> {
  return apiFetch<CharacterType>('/characters', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** 캐릭터 부분 수정 (보낸 필드만 갱신) */
export function updateCharacter(body: UpdateCharacterRequestType): Promise<CharacterType> {
  return apiFetch<CharacterType>('/characters/me', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/** 내 캐릭터 삭제 (테스트/리셋용 — 온보딩을 다시 보기 위함) */
export function deleteMyCharacter(): Promise<void> {
  return apiFetch<void>('/characters/me', { method: 'DELETE' });
}
