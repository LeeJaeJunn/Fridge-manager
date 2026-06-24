import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChatMessageType, ChatResType } from '@companion/types';
import { LlmService } from '../llm/llm.service';
import { CHARACTERS, findCharacter } from './characters';

@Injectable()
export class ChatService {
  /** 사용할 LLM 모델 — 사용자가 아닌 관리자 소유. env(LLM_MODEL)에서 온다. */
  private readonly model: string;

  constructor(
    private readonly llm: LlmService,
    config: ConfigService,
  ) {
    // 필수 설정 — 없으면 부팅 시점에 바로 실패시킨다.
    this.model = config.getOrThrow<string>('LLM_MODEL');
  }

  /** 시작용 프리셋 목록 (instruction 등 내부 정보는 노출하지 않음) */
  listCharacters() {
    return CHARACTERS.map(({ id, name }) => ({ id, name }));
  }

  /**
   * stateless 채팅: 프리셋 instruction을 instructions로, 대화 히스토리를 input으로 LLM 호출.
   * 모델은 관리자 설정(LLM_MODEL)을 사용한다. 저장은 아직 안 함 (persistence 단계에서 추가).
   */
  async send(characterId: string, messages: ChatMessageType[]): Promise<ChatResType> {
    const character = findCharacter(characterId);
    if (!character) {
      throw new NotFoundException(`존재하지 않는 캐릭터입니다: ${characterId}`);
    }
    return await this.llm.chat(character.instruction, messages, this.model);
  }
}
