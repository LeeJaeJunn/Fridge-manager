import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConversationService } from './conversation.service';
import { ApplyProposalDto } from './dto/apply-proposal.dto';
import { CookDishDto } from './dto/cook-dish.dto';
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

  /**
   * POST /conversations/:id/messages/:messageId/recipes — 요리 카드의 "자세한 레시피" 버튼.
   * 그 요리로 네이버 검색을 돌려 결과 카드를 대화에 덧붙인다 (LLM 을 거치지 않는다).
   */
  @Post(':id/messages/:messageId/recipes')
  @HttpCode(200)
  searchDishRecipes(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
  ) {
    return this.conversations.searchDishRecipes(userId, id, messageId);
  }

  /**
   * POST /conversations/:id/messages/:messageId/cook-preview — "만들었어요" 1단계.
   * 무엇을 얼마나 뺄지 제안만 만든다 (**아무것도 저장하지 않는다**).
   */
  @Post(':id/messages/:messageId/cook-preview')
  @HttpCode(200)
  cookPreview(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
  ) {
    return this.conversations.cookPreview(userId, id, messageId);
  }

  /**
   * POST /conversations/:id/messages/:messageId/cook — "만들었어요" 2단계.
   * 확인한 값으로 재고를 반영하고 요리 카드에 `cookedAt` 을 찍는다 (대화 아이템은 안 남긴다).
   */
  @Post(':id/messages/:messageId/cook')
  @HttpCode(200)
  cookDish(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() body: CookDishDto,
  ) {
    return this.conversations.cookDish(userId, id, messageId, body);
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
