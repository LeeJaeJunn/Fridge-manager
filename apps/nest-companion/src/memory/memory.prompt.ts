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
      category: z.enum(['PREFERENCE', 'PROFILE', 'OWNERSHIP', 'ETC']),
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
  return `너는 사용자의 '구매·의사결정'을 돕기 위해 사용자에 대한 장기 기억을 관리하는 추출기다.
아래 대화에서, 앞으로의 여러 결정에 두루 쓰일 '오래 지속되는 사실'만 골라 구조화해 반환하라.

[핵심 판별 기준 — 사람에 묶이면 저장, 상품에 묶이면 버림]
- 어떤 상품 종류를 떼도 말이 되는 정보(사람의 취향·특성)만 뽑아라 → 저장
- 특정 상품군에서만 성립하는 조건은 그때 대화의 요구일 뿐 장기 기억이 아니다 → 버림
  예: "저소음 선풍기 원함" / "이번엔 5만원 이하" → 버림.
  단, 반복되거나 명시적 단서가 있으면("난 원래 소음이 싫어") 사람 특성("소음에 예민한 편")으로 승격해 저장.
  요청 한 번으로 일반 성향을 단정하지 마라.

[뽑을 것] 여러 결정에 두루 적용되는, 사람에 묶이는 지속 정보
[뽑지 말 것]
- 특정 상품에만 해당하는 일회성 구매 조건(스펙·예산): "이번 선풍기는 저소음/5만원 이하"
- 일회성 이벤트/약속/일정("내일 시험", "금요일 약속")
- 순간의 기분/감정("오늘 피곤함")
- 컴패니언(너) 자신에 대한 정보, 일반 상식

[이미 알고 있는 사실] (아래와 의미가 겹치면 다시 만들지 마라):
${known}

[카테고리] 각 사실에 가장 잘 맞는 하나만 고른다:
- PREFERENCE: 브랜드·제품·스타일 선호, 소비 성향("삼성 선호", "무선 위주", "가성비 중시")
- PROFILE: 지속되는 사실·성향·상황("자취 중", "수학과", "더위를 많이 탐", "신중하게 비교하는 편")
- OWNERSHIP: 지금 쓰거나 이미 가진 것·구매 이력("아이폰 씀", "블루투스 이어폰 보유")
  ※ 상품을 샀다·쓴다는 '사실'만 담고, 그 상품의 세부 스펙(저소음·5만원 등)은 담지 마라.
- ETC: 위 어디에도 안 맞는 지속 사실

[content 형식] 짧고 자연스러운 한 구절("자취 중"). 사실 1개 = 항목 1개.
[importance] 1~3 정수 (1=사소, 2=보통, 3=핵심).
새로 기억할 게 없으면 빈 배열을 반환하라.`;
}
