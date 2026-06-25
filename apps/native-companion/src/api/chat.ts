import { apiFetch } from '@/api/client';
import type {
  CharacterSummaryType,
  ChatMessageType,
  ChatResponseEnvelopeType,
  ChatResType,
} from '@companion/types';

/**
 * @deprecated 프리셋 목록은 api/character.ts 의 fetchPresets 로 이동.
 * 채팅 화면이 "내 캐릭터" 기준으로 바뀌면(Step C) 제거 예정.
 */
export function fetchCharacters(): Promise<CharacterSummaryType[]> {
  return apiFetch<CharacterSummaryType[]>('/chat/characters');
}

/** 캐릭터와 대화 (stateless — 히스토리를 통째로 보냄) */
export async function sendChat(
  characterId: string,
  messages: ChatMessageType[],
): Promise<ChatResType> {
  const data = await apiFetch<ChatResponseEnvelopeType>('/chat', {
    method: 'POST',
    body: JSON.stringify({ characterId, messages }),
  });
  return data.result;
}
