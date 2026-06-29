import { z } from 'zod';

export const EXTRACTION_SCHEMA_NAME = 'memory_extraction';

/**
 * 추출 LLM 의 구조화 출력 스키마 (zod → SDK 가 JSON 스키마를 자동 생성).
 * category 는 enum 으로 제약해 잘못된 값을 원천 차단한다.
 * importance 범위(1~3)는 프롬프트 지시 + 저장 시 코드 클램프로 통제한다.
 */
export const ExtractionSchema = z.object({
  memories: z.array(
    z.object({
      category: z.enum(['INTEREST', 'WORK', 'GOAL', 'LIFESTYLE', 'RELATIONSHIP', 'TRAIT', 'ETC']),
      content: z.string(),
      importance: z.number().int(),
    }),
  ),
});

/** 추출 결과 타입 — zod 스키마에서 추론 (수동 인터페이스 불필요) */
export type ExtractionResult = z.infer<typeof ExtractionSchema>;

/** 추출 instruction 조립 — 기존 메모리를 함께 줘서 의미상 중복을 피하게 한다. */
export function buildExtractionInstruction(existing: string[]): string {
  const known = existing.length ? existing.map((c) => `- ${c}`).join('\n') : '(없음)';
  return `너는 사용자에 대한 '장기 기억'을 관리하는 추출기다.
아래 대화에서 사용자에 대해 오래 지속되는 사실만 골라 구조화해 반환하라.

[뽑을 것] 시간이 지나도 유효한 정보 — 취향·관계·목표·습관·성격 등
[뽑지 말 것]
- 일회성 이벤트/약속/일정("내일 시험", "금요일 약속") — 지나가면 무효
- 순간의 기분/감정("오늘 피곤함")
- 컴패니언(너) 자신에 대한 정보, 일반 상식

[이미 알고 있는 사실] (아래와 의미가 겹치면 다시 만들지 마라):
${known}

[카테고리] 각 사실에 가장 잘 맞는 하나만 고른다:
- INTEREST: 무엇을 좋아/싫어하는가 (취향·취미)
- WORK: 전공·직무·프로젝트·업무 방식
- GOAL: 이루려는 것·진행 중인 계획
- LIFESTYLE: 루틴·수면·운동·생활습관
- RELATIONSHIP: 가족·친구·동료 등 지속적 관계
- TRAIT: 성격·가치관·의사결정 스타일
- ETC: 위 어디에도 안 맞는 지속 사실

[content 형식] 짧고 자연스러운 한 구절("밤에 공부하는 편"). 사실 1개 = 항목 1개.
[importance] 1~3 정수 (1=사소, 2=보통, 3=핵심).
새로 기억할 게 없으면 빈 배열을 반환하라.`;
}
