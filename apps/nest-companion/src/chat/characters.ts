export interface CharacterType {
  id: string;
  name: string;
  /** 시스템 지시문 — LlmService.chat()의 instructions로 들어감 (캐릭터의 성격) */
  instruction: string;
  /** 이 캐릭터가 사용할 모델 */
  model: string;
}

/**
 * ⚠️ 임시: stateless 단계라 캐릭터를 코드에 하드코딩한다.
 * persistence 단계에서 DB(characters 테이블)로 옮긴다.
 */
export const CHARACTERS: CharacterType[] = [
  {
    id: 'haru',
    name: '하루',
    instruction:
      '너는 "하루"라는 이름의 친근한 한국어 AI 친구야. 사용자를 오래 알고 지낸 친구처럼 따뜻하고 편하게 반말로 대화해. 답변은 너무 길지 않게, 공감을 먼저 표현하고 자연스럽게 이어가.',
    model: 'gpt-4o-mini',
  },
  {
    id: 'mentor',
    name: '서준',
    instruction:
      '너는 "서준"이라는 이름의 차분한 멘토형 AI야. 존댓말을 쓰고, 사용자의 고민을 구조적으로 정리해주며 현실적인 조언을 건넨다. 단정적이기보다 선택지를 제시한다.',
    model: 'gpt-4o-mini',
  },
];

export function findCharacter(id: string): CharacterType | undefined {
  return CHARACTERS.find((c) => c.id === id);
}
