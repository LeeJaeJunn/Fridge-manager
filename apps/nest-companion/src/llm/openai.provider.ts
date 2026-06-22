import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { OPENAI_CLIENT } from './llm.constants';

/**
 * OpenAI 클라이언트를 한 번만 생성해서 DI 컨테이너에 등록한다.
 * openai 패키지 import는 이 llm/ 폴더 안에서만 일어나야 한다 (벤더 캡슐화).
 */
export const OpenAiProvider: Provider = {
  provide: OPENAI_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): OpenAI => {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY 가 설정되지 않았습니다. apps/nest-companion/.env 를 확인하세요.',
      );
    }
    return new OpenAI({ apiKey });
  },
};
