import { ENV } from '@/config/env';
import type { CharacterSummaryType, ChatMessageType, ChatResType } from '@/types/chat';

interface ChatEnvelopeType {
  ok: boolean;
  result: ChatResType;
}

/** 선택 가능한 캐릭터 목록 */
export async function fetchCharacters(): Promise<CharacterSummaryType[]> {
  const res = await fetch(`${ENV.apiUrl}/chat/characters`);
  if (!res.ok) {
    throw new Error('캐릭터 목록을 불러오지 못했습니다');
  }
  return (await res.json()) as CharacterSummaryType[];
}

/** 캐릭터와 대화 (stateless — 히스토리를 통째로 보냄) */
export async function sendChat(
  characterId: string,
  messages: ChatMessageType[],
): Promise<ChatResType> {
  const res = await fetch(`${ENV.apiUrl}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ characterId, messages }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? '메시지 전송에 실패했습니다');
  }
  const data = (await res.json()) as ChatEnvelopeType;
  return data.result;
}
