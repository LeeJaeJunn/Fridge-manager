import type {
  ChatMessageType,
  ChatRoleType,
  ConversationDetailType,
  ConversationSummaryType,
  MessageType,
} from '@companion/types';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../llm/llm.service';
import { PrismaService } from '../prisma/prisma.service';

const MESSAGE_SELECT = {
  id: true,
  role: true,
  content: true,
  createdAt: true,
} as const;

type MessageRow = {
  id: string;
  role: ChatRoleType;
  content: string;
  createdAt: Date;
};
const toMessage = (m: MessageRow): MessageType => ({
  id: m.id,
  role: m.role,
  content: m.content,
  createdAt: m.createdAt.toISOString(),
});

@Injectable()
export class ConversationService {
  /** 사용할 LLM 모델 — 관리자 소유(env). */
  private readonly model: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    config: ConfigService,
  ) {
    this.model = config.getOrThrow<string>('LLM_MODEL');
  }

  /** 내 대화 목록 (최근순 + 마지막 메시지 미리보기) */
  async list(userId: string): Promise<ConversationSummaryType[]> {
    const rows = await this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true },
        },
      },
    });
    return rows.map((c) => ({
      id: c.id,
      title: c.title,
      preview: c.messages[0]?.content ?? null,
      updatedAt: c.updatedAt.toISOString(),
    }));
  }

  /** 대화 1개 + 메시지들 (본인 것만) */
  async get(userId: string, conversationId: string): Promise<ConversationDetailType> {
    const convo = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: {
        id: true,
        title: true,
        messages: { orderBy: { createdAt: 'asc' }, select: MESSAGE_SELECT },
      },
    });
    if (!convo) {
      throw new NotFoundException('대화를 찾을 수 없습니다.');
    }
    return {
      id: convo.id,
      title: convo.title,
      messages: convo.messages.map(toMessage),
    };
  }

  /** 새 대화 시작 (지연 생성): 첫 메시지로 대화를 만들고 첫 교환까지 수행 */
  async start(userId: string, content: string): Promise<ConversationDetailType> {
    const character = await this.getCharacter(userId);
    const convo = await this.prisma.conversation.create({
      data: { userId, characterId: character.id },
      select: { id: true },
    });
    await this.exchange(convo.id, character.instruction, content);
    return this.get(userId, convo.id);
  }

  /** 기존 대화에 메시지 전송 → 답변 반환 (본인 것만) */
  async sendMessage(userId: string, conversationId: string, content: string): Promise<MessageType> {
    const convo = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });
    if (!convo) {
      throw new NotFoundException('대화를 찾을 수 없습니다.');
    }
    const character = await this.getCharacter(userId);
    return this.exchange(convo.id, character.instruction, content);
  }

  /** 대화 삭제 (본인 것만, 메시지는 cascade 로 함께 삭제). 멱등. */
  async deleteConversation(userId: string, conversationId: string): Promise<void> {
    await this.prisma.conversation.deleteMany({
      where: { id: conversationId, userId },
    });
  }

  /** 대화 속 개별 메시지 삭제 (본인 대화의 메시지만). 멱등. */
  async deleteMessage(userId: string, conversationId: string, messageId: string): Promise<void> {
    await this.prisma.message.deleteMany({
      where: { id: messageId, conversationId, conversation: { userId } },
    });
  }

  /**
   * 공통 교환 로직:
   * 유저 메시지 저장 → 전체 히스토리로 LLM 호출 → 답변 저장(+대화 updatedAt 갱신) → 답변 반환.
   */
  private async exchange(
    conversationId: string,
    instruction: string,
    content: string,
  ): Promise<MessageType> {
    await this.prisma.message.create({
      data: { conversationId, role: 'user', content },
    });

    const history = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });
    const messages: ChatMessageType[] = history.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const res = await this.llm.chat(instruction, messages, this.model);

    // 답변 저장 + 대화 갱신을 한 번의 nested write 로 처리.
    // nested write 만 있으면 @updatedAt 이 안 올라가므로 updatedAt 을 명시적으로 갱신(목록 최근순 정렬용).
    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        updatedAt: new Date(),
        messages: { create: { role: 'assistant', content: res.text } },
      },
      select: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: MESSAGE_SELECT },
      },
    });
    return toMessage(updated.messages[0]);
  }

  /** 내 캐릭터(instruction 포함) — 없으면 에러 */
  private async getCharacter(userId: string) {
    const character = await this.prisma.character.findUnique({
      where: { userId },
      select: { id: true, instruction: true },
    });
    if (!character) {
      throw new BadRequestException('먼저 캐릭터를 만들어 주세요.');
    }
    return character;
  }
}
