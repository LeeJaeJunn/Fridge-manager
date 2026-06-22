import { Body, Controller, Get, Post } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatRequestDto } from './dto/chat-request.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /** GET /chat/characters — 선택 가능한 캐릭터 목록 */
  @Get('characters')
  characters() {
    return this.chatService.listCharacters();
  }

  /** POST /chat — 캐릭터와 대화 (저장 없음). 입력 검증은 전역 ValidationPipe가 처리 */
  @Post()
  async send(@Body() body: ChatRequestDto) {
    const result = await this.chatService.send(body.characterId, body.messages);
    return { ok: true, result };
  }
}
