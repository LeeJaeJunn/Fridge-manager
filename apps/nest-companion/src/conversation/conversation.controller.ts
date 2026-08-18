import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConversationService } from './conversation.service';
import { ApplyProposalDto } from './dto/apply-proposal.dto';
import { SendMessageDto } from './dto/send-message.dto';

/** 전부 현재 유저 기준. 입력 검증은 전역 ValidationPipe가 처리. */
@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationController {
  constructor(private readonly conversations: ConversationService) {}

  /** GET /conversations — 내 대화 목록 */
  @Get()
  list(@CurrentUser() userId: string) {
    return this.conversations.list(userId);
  }

  /** GET /conversations/:id — 대화 1개 + 메시지들 */
  @Get(':id')
  get(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.conversations.get(userId, id);
  }

  /** POST /conversations — 새 대화 시작 (첫 메시지) */
  @Post()
  start(@CurrentUser() userId: string, @Body() body: SendMessageDto) {
    return this.conversations.start(userId, body.content);
  }

  /** POST /conversations/:id/messages — 기존 대화에 메시지 전송 */
  @Post(':id/messages')
  send(@CurrentUser() userId: string, @Param('id') id: string, @Body() body: SendMessageDto) {
    return this.conversations.sendMessage(userId, id, body.content);
  }

  /** DELETE /conversations/:id — 대화 삭제 (메시지도 cascade) */
  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.conversations.deleteConversation(userId, id);
  }

  /** DELETE /conversations/:id/messages/:messageId — 개별 메시지 삭제 */
  @Delete(':id/messages/:messageId')
  @HttpCode(204)
  removeMessage(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
  ) {
    return this.conversations.deleteMessage(userId, id, messageId);
  }

  /** POST /conversations/:id/messages/:messageId/apply — 재고 제안 확정(편집값 반영) */
  @Post(':id/messages/:messageId/apply')
  applyProposal(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() body: ApplyProposalDto,
  ) {
    return this.conversations.applyProposal(userId, id, messageId, body);
  }

  /** POST /conversations/:id/messages/:messageId/dismiss — 소비 제안 취소 */
  @Post(':id/messages/:messageId/dismiss')
  dismissProposal(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
  ) {
    return this.conversations.dismissProposal(userId, id, messageId);
  }
}
