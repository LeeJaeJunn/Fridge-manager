import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { LlmService } from '../llm/llm.service';
import { cleanLlmText } from '../llm/sentinels';

const SCHEMA_NAME = 'consume_calc';

/**
 * ⚠️ 전부 **required + nullable** 이다 — OpenAI Structured Outputs 는 모든 속성이 required 라
 * zod `.optional()` 을 못 쓴다("없음"은 `null` 로 표현한다). `ScanSchema` 와 같은 제약.
 */
const ConsumeCalcSchema = z.object({
  items: z.array(
    z.object({
      /** 입력으로 준 이름 그대로 — 서버가 이걸로 재고 행에 되돌려 매칭한다 */
      name: z.string(),
      /**
       * 쓰고 남은 양. **계산할 수 없으면 비운다.**
       * 이 필드가 nullable 인 게 이 기능의 핵심이다 — 아래 instruction 참고.
       *
       * ⚠️ nullable 이라고 해서 안심할 수 없다. Structured Outputs 는 타입만 강제하므로
       * 모델이 **문자열 `"null"`** 을 채우면 그대로 통과한다(실측). `cleanLlmText` 가 경계다.
       */
      remaining: z.string().nullable(),
      /** 다 써서 냉장고에서 뺄지 */
      finished: z.boolean(),
    }),
  ),
});

type ConsumeCalcResult = z.infer<typeof ConsumeCalcSchema>;

/** 계산에 필요한 것만. 톤·알레르기·추천 규칙이 낄 자리가 없다. */
export type ConsumeCalcInput = {
  name: string;
  /** 지금 냉장고에 있는 양 (자유텍스트, 없을 수 있다) */
  current: string | null;
  /** 이번 요리에 쓴 양 */
  used: string;
};

export type ConsumeCalcItem = { name: string; remaining: string | null; finished: boolean };

/**
 * **거절 예시가 이 지시문의 핵심이다.**
 *
 * 예전에 `update_inventory` 의 `quantityNote` 가 "합산해서 적어라"만 시켰더니, 못 합치는 경우
 * (`"6개" + "한 판"`)에 모델이 **`"10개"` 를 지어냈다**(실측). 산수를 못해서가 아니라
 * **모른다고 답할 자리가 없어서** 생긴 실패다.
 *
 * 그래서 여기선 "계산해라"가 아니라 **"계산할 수 있으면 해라"** 로 묻고, 거절이 어떤 모양인지
 * 예시로 못박는다. 예시가 곧 편향이라, 성공 예시만 있으면 모델은 항상 숫자를 낸다.
 */
const INSTRUCTION = [
  '너는 냉장고 재고에서 사용량을 빼는 계산기다. 각 재료의 남은 양을 구한다.',
  '',
  '- 단위가 같거나 환산되면 계산한다. 예: 재고 "1kg", 사용 "200g" → remaining "800g" /',
  '  재고 "10개", 사용 "2개" → remaining "8개" / 재고 "2L", 사용 "300ml" → remaining "1.7L"',
  '- 관습으로 정해진 단위는 환산한다. 계란 한 판 = 30개, 한 근 = 600g, 1큰술 ≈ 15g, 1컵 ≈ 200ml',
  '- 남은 양이 0 이하면 finished 를 true 로 하고 remaining 은 비워 둔다',
  '',
  '**계산할 수 없으면 추측하지 마라.** 재고 표현이 용기 크기에 달린 것이면(반 통, 한 팩, 한 봉지,',
  '조금, 약간 등) 그게 몇 g 인지는 아무도 모른다. 그럴 땐 remaining 을 비우고 finished 는 false 로 둔다.',
  '- 예: 재고 "반 통", 사용 "200g" → remaining 비움, finished false',
  '- 예: 재고 "한 팩", 사용 "2개" → remaining 비움, finished false',
  '- 예: 재고를 모름, 사용 "200g" → remaining 비움, finished false',
  '',
  // ⚠️ 이 줄이 실측 대응이다. "null 로 둬라"고 썼더니 모델이 **문자열 `"null"`** 을 채웠다.
  //    화면에 남은 양이 `null` 이라고 뜨는 결과가 됐다.
  '⚠️ remaining 을 비운다는 건 **값을 넣지 않는다**는 뜻이다. "null", "없음", "-" 같은 글자를',
  '   써넣지 마라 — 그건 비운 게 아니라 그 글자가 수량이 돼버린다.',
  '⚠️ finished 는 true/false 값이다. "true" 같은 글자가 아니다.',
  '',
  '숫자를 지어내는 것보다 비워 두는 게 항상 낫다. 사용자가 화면에서 직접 채운다.',
].join('\n');

/**
 * 요리에 쓴 양만큼 재고를 빼는 **전용 LLM 호출** — `scan.service.ts` 와 같은 자리·같은 패턴이다
 * (도메인 안의 짧은 단일 목적 호출 + 전용 모델).
 *
 * **왜 채팅 모델이 아니라 전용 호출인가:** 채팅 프롬프트에는 톤·추천 우선순위·알레르기·검색 규칙이
 * 이미 가득해서, 소비 계산 지시가 그 사이에서 자리를 다툰다. 여기선 지시문이 이것 하나뿐이라
 * 거절 규칙이 묻히지 않고, 필요하면 이 경로에만 상위 모델을 붙일 수 있다.
 *
 * ⚠️ **아무것도 저장하지 않는다.** 결과는 확인 카드로 올라가고, 반영은 사용자가 확인한 뒤다.
 */
@Injectable()
export class ConsumeCalcService {
  private readonly logger = new Logger(ConsumeCalcService.name);
  private readonly model: string;

  constructor(
    private readonly llm: LlmService,
    config: ConfigService,
  ) {
    // 이 호출만 상위 모델로 올릴 수 있게 별도 env — `SCAN_MODEL`·`MEMORY_EXTRACT_MODEL` 과 같은 방식.
    this.model = config.get<string>('CONSUME_MODEL') || config.getOrThrow<string>('LLM_MODEL');
  }

  /**
   * 남은 양을 계산한다. **실패해도 던지지 않는다** — 전부 `remaining: null` 로 돌려준다.
   *
   * 계산은 편의지 필수가 아니다. 여기서 던지면 "요리는 했는데 재고를 못 줄이는" 상태가 되는데,
   * 빈칸이 채워진 카드를 띄우면 사용자가 직접 적으면 그만이다(`RecipeService` 의 검색 실패를
   * `reason` 으로 흡수하는 것과 같은 판단).
   */
  async calculate(items: ConsumeCalcInput[], userId: string): Promise<ConsumeCalcItem[]> {
    if (items.length === 0) return [];

    const input = items
      .map((i) => `- ${i.name}: 재고 ${i.current ?? '(수량 모름)'}, 이번에 사용 ${i.used}`)
      .join('\n');

    try {
      const { parsed } = await this.llm.structured<ConsumeCalcResult>(
        {
          instructions: INSTRUCTION,
          input,
          schema: ConsumeCalcSchema,
          schemaName: SCHEMA_NAME,
          model: this.model,
        },
        // 사용자가 "만들었어요"를 눌러 시킨 일이라 쿼터에 센다. 대화 밖이라 conversationId 는 없다.
        // feature 를 따로 가르는 건 나중에 "이 호출이 실제로 정확한가"를 재기 위해서다 —
        // 상위 모델이 나을 거라는 건 아직 가정이고, 원장이 그 답을 들고 있어야 한다.
        { userId, feature: 'consume_calc', billable: true },
      );

      const byName = new Map(parsed.items.map((i) => [i.name.trim(), i]));
      return items.map((i) => {
        const hit = byName.get(i.name.trim());
        return {
          name: i.name,
          // ⚠️ **`cleanLlmText` 를 반드시 거친다.** 스키마가 `string | null` 이어도 모델은
          // 문자열 `"null"` 을 낸다(실측) — 그대로 두면 남은 양이 `null` 이라고 화면에 뜬다.
          // 모델이 빠뜨린 항목도 여기서 "모름"으로 떨어진다(재고를 안 건드리는 쪽).
          remaining: cleanLlmText(hit?.remaining) ?? null,
          finished: hit?.finished === true,
        };
      });
    } catch (err) {
      this.logger.error('소비 계산 실패 — 빈 제안으로 진행한다', err as Error);
      return items.map((i) => ({ name: i.name, remaining: null, finished: false }));
    }
  }
}
