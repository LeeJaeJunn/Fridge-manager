import { Injectable, NotFoundException } from '@nestjs/common';
import type { ChatMessageType, ChatResType } from '@companion/types';
import { LlmService } from '../llm/llm.service';
import { CHARACTERS, findCharacter } from './characters';

@Injectable()
export class ChatService {
  constructor(private readonly llm: LlmService) {}

  /** 선택 가능한 캐릭터 목록 (페르소나는 노출하지 않음) */
  listCharacters() {
    return CHARACTERS.map(({ id, name }) => ({ id, name }));
  }

  /**
   * stateless 채팅: 캐릭터 instruction을 instructions로, 대화 히스토리를 input으로 LLM 호출.
   * 저장은 아직 안 함 (persistence 단계에서 추가).
   */
  async send(characterId: string, messages: ChatMessageType[]): Promise<ChatResType> {
    const character = findCharacter(characterId);
    if (!character) {
      throw new NotFoundException(`존재하지 않는 캐릭터입니다: ${characterId}`);
    }
    return await this.llm.chat(character.instruction, messages, character.model);
  }
}
