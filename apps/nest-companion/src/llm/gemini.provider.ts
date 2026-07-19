import { GoogleGenAI } from '@google/genai';
import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GEMINI_CLIENT } from './llm.constants';

/**
 * Gemini(Google GenAI) 클라이언트를 한 번만 생성해 DI 컨테이너에 등록한다.
 * `@google/genai` import 는 이 llm/ 폴더 안에서만 일어나야 한다 (벤더 캡슐화 — openai 와 동일 규칙).
 *
 * GEMINI_API_KEY 는 **선택**이다: 없으면 클라이언트는 만들어지되 Gemini 모델을 실제로 호출할 때
 * 인증 에러가 난다. (OpenAI 만 쓰는 배포는 키 없이도 부팅되어야 하므로 여기서 throw 하지 않는다.)
 */
export const GeminiProvider: Provider = {
  provide: GEMINI_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): GoogleGenAI => {
    const apiKey = config.get<string>('GEMINI_API_KEY');
    return new GoogleGenAI({ apiKey });
  },
};
