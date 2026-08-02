import { GoogleGenAI } from '@google/genai';
import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AppService } from './app.service';

const instruction = `너는 상품 추천의 '근거'를 모으는 리서처다. 주어진 상품 또는 카테고리에 대해
웹에서 실제 스펙과 사용자 후기를 찾아, 추천 이유를 쓰는 데 필요한 질적 정보만 간결히 정리한다.

[찾을 것]
- 핵심 스펙·특징 (그 제품군에서 실제로 중요한 항목 위주)
- 후기 종합: 자주 언급되는 장점 / 단점·불만 / 전반적 평판
- 어떤 사용자·상황에 잘 맞는지 (예: 소음 민감, 휴대성 중시, 원룸)

[규칙]
- 가격·재고는 단정하지 마라. 값을 봤어도 "참고용, 시점에 따라 다름"으로만 다뤄라
  (정확한 가격·구매는 별도 상품 데이터가 담당한다).
- 반드시 실제 후기·근거에 기반해라. 확인 안 되면 '정보 부족'이라 솔직히 적고 지어내지 마라.
- 장점만 늘어놓지 말고 단점·주의점도 함께 짚어라.
- 한국어로, 상품당 5~6줄 이내로 압축. 표·장문·마케팅 문구 금지.

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
        input: '알리사 100단 아이스터보 MAX 휴대용 선풍기',
        system_instruction: instruction,
        generation_config: {
          thinking_level: 'minimal',
        },
        tools: [{ type: 'google_search' }],
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

  /**
   * ⚠️ 임시 OpenAI 웹검색 테스트용 — 상품 정보 보강 실험. 끝나면 지운다.
   * 예) GET /openai-search?q=지하철에서 쓰기 좋은 저소음 넥쿨러 추천과 대략 가격
   */
  @Get('openai')
  async openaiSearch() {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    const query = '포른 휴대용 냉각 허리 선풍기 PCWF001';
    try {
      const client = new OpenAI({ apiKey });
      // const res = await client.responses.create({
      //   // model: 'gpt-5.6-luna',
      //   model: 'gpt-5.4-nano',
      //   instructions: instruction,
      //   tools: [
      //     {
      //       type: 'web_search',
      //       search_context_size: 'low',
      //       filters: {
      //         allowed_domains: [
      //           'danawa.com', // 스펙+가격비교+사용자 평 — 단일 최강 소스
      //           'coupang.com', // 후기 물량 많음
      //           'smartstore.naver.com',
      //           'blog.naver.com', // 실사용 후기
      //           'fmkorea.com', // 커뮤니티 실사용 평
      //           'ppomppu.co.kr',
      //           'clien.net',
      //         ],
      //       },
      //     },
      //   ],
      //   input: query,
      // });
      // text = 모델이 정리한 답, output = web_search_call 등 원본 스텝(무엇을 검색했는지 확인용)
      const res = await client.responses.create({
        model: 'gpt-5.4-nano',
        input: '내 이름이 뭐라고?',
        previous_response_id: 'resp_07fca13bb5238cc7006a6f7643c1fc819ab8098f64e430e2ef',
      });
      console.log(JSON.stringify(res));
      return { query, text: res.output_text, output: res.output };
    } catch (e: unknown) {
      return {
        hasKey: Boolean(apiKey),
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
