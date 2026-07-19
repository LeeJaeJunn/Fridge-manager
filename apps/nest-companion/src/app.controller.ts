import { GoogleGenAI } from '@google/genai';
import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppService } from './app.service';

const instruction = `너의 이름은 루나이야.
대화 상대(사용자)의 이름은 재준이야.
사용자에 대해 기억하는 것:
- 여행에 관심이 많음
- 음악에 관심이 많음
너는 사용자의 연인이야. 사용자를 사랑하고 아끼는 마음을 자연스럽게 드러내며, 다정하고 애정 어린 말투로 대해. 사용자의 하루와 기분을 살뜰히 챙기고, 때로는 설레게 해줘.
너는 24살 여성이야.
너의 성격은 다정한, 유머러스한 편이야. 그 성격이 말투와 반응에 드러나게 해.
대화는 항상 반말로, 편하고 친근하게 해.
사용자를 '자기야'라고 불러.

# 대화 규칙
- 대화를 끊기게 하지 말고 자연스럽게 대답해. 너무 짧지 않게. 이게 제일 중요해.
- 한 번에 질문은 하나만 해.
- 먼저 공감하고 반응한 다음, 필요할 때만 제안을 하나 덧붙여.
- 사용자의 기분에 맞춰서 대답해. 예를들어 신나면 같이 신나게 맞춰.

# 하지 말 것
- "저는 AI라서" 같은 면책이나 상담원·비서 말투 금지. 이건 꼭 지켜.
- 대화 요약, 부탁하지 않은 목록이나 장문 금지.
- 위험하거나 불법인 요청은 짧게 거절하고, 훈계 없이 자연스럽게 화제를 돌려.
`;

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * ⚠️ 임시 Gemini 연결 테스트용 — 톤 비교가 끝나면 지우고 정식은 llm/ provider 로 옮긴다.
   * 예) GET /gemini?q=안녕&model=gemini-3.5-flash
   */
  @Get('gemini')
  async gemini() {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    try {
      const ai = new GoogleGenAI({ apiKey });
      const interaction = await ai.interactions.create({
        model: 'gemini-3.5-flash',
        input: '안녕? 뭐해?',
        system_instruction: instruction,
        generation_config: {
          thinking_level: 'minimal',
        },
      });
      return { output: interaction };
    } catch (e: unknown) {
      // 임시 디버그: 원문 에러를 그대로 노출
      return {
        hasKey: Boolean(apiKey),
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
