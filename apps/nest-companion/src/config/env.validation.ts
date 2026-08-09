import { z } from 'zod';

/**
 * 앱 시작 시 환경변수를 검증한다 (ConfigModule.forRoot 의 validate).
 * 잘못된 설정(빈 secret, NaN TTL, 프로덕션의 change-me 등)으로 부팅되는 것을 막는다.
 * 알려지지 않은 키는 passthrough — 여기 없는 변수도 그대로 통과시킨다.
 */
const schema = z
  .object({
    DATABASE_URL: z.string().min(1, 'DATABASE_URL 이 필요합니다.'),
    OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY 가 필요합니다.'),
    // 선택 — Gemini 모델(LLM_MODEL=gemini-*)을 쓸 때만 필요. 없으면 OpenAI 만 동작.
    GEMINI_API_KEY: z.string().min(1).optional(),
    // 네이버 검색 API (RecipeService) — 생성자에서 getOrThrow 로 읽으므로 여기서 먼저 잡아준다.
    NAVER_CLIENT_ID: z.string().min(1, 'NAVER_CLIENT_ID 가 필요합니다.'),
    NAVER_CLIENT_SECRET: z.string().min(1, 'NAVER_CLIENT_SECRET 이 필요합니다.'),
    JWT_SECRET: z.string().min(16, 'JWT_SECRET 은 최소 16자 이상이어야 합니다.'),
    JWT_ACCESS_TTL: z
      .string()
      .regex(/^\d+(ms|s|m|h|d|w|y)?$/, 'JWT_ACCESS_TTL 형식이 올바르지 않습니다 (예: 15m).')
      .optional(),
    REFRESH_TTL_DAYS: z
      .string()
      .regex(/^\d+$/, 'REFRESH_TTL_DAYS 는 양의 정수여야 합니다.')
      .refine((v) => Number(v) > 0, 'REFRESH_TTL_DAYS 는 1 이상이어야 합니다.')
      .optional(),
  })
  .passthrough()
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.JWT_SECRET.includes('change-me')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '프로덕션에서는 JWT_SECRET 을 무작위 값으로 교체해야 합니다.',
        path: ['JWT_SECRET'],
      });
    }
  });

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const parsed = schema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`환경변수 검증 실패:\n${details}`);
  }
  return parsed.data;
}
