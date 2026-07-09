import type {
  ChatMessageType,
  ChatRoleType,
  ConversationDetailType,
  ConversationSummaryType,
  MessageType,
} from '@companion/types';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommerceService } from '../commerce/commerce.service';
import { LlmService, type LlmTool, type LlmToolExecutor } from '../llm/llm.service';
import { MemoryService, type RecalledMemory } from '../memory/memory.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 채팅 중 상품추천용 툴. 모델이 "쇼핑/추천이 필요하다" 판단할 때만 부른다(description 이 그 판단 근거).
 * 실행기는 exchangeWithTools 에서 commerce.search 로 연결한다.
 */
const SEARCH_PRODUCTS_TOOL: LlmTool = {
  name: 'search_products',
  description:
    '사용자가 상품 추천·구매·쇼핑을 원할 때만 상품을 검색한다. 일반 잡담이나 상품과 무관한 대화에서는 호출하지 않는다.',
  parameters: {
    type: 'object',
    properties: {
      keywords: { type: 'string', description: '검색어 (예: "책상 조명", "무선 이어폰")' },
      priceMin: { type: 'number', description: '최소 가격, 원 (선택)' },
      priceMax: { type: 'number', description: '최대 가격, 원 (선택)' },
    },
    required: ['keywords'],
    additionalProperties: false,
  },
};

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

type CharacterPromptSource = {
  id: string;
  name: string;
  instruction: string;
  /** 캐릭터 소유 유저 — 이름을 프롬프트에 넣어 "나를 아는" 느낌을 준다 (name 은 nullable) */
  user: { name: string | null };
};

const toMessage = (m: MessageRow): MessageType => ({
  id: m.id,
  role: m.role,
  content: m.content,
  createdAt: m.createdAt.toISOString(),
});

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);
  /** 사용할 LLM 모델 — 관리자 소유(env). */
  private readonly model: string;
  /** 몇 개 메시지마다 장기 메모리 추출을 돌릴지 (env, 나중에 Settings 테이블로 이전) */
  private readonly extractEveryN: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly memory: MemoryService,
    private readonly commerce: CommerceService,
    config: ConfigService,
  ) {
    this.model = config.getOrThrow<string>('LLM_MODEL');
    this.extractEveryN = Number(config.get<string>('MEMORY_EXTRACT_EVERY_N') ?? 6);
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
    const { character, memories } = await this.getPromptContext(userId);
    const convo = await this.prisma.conversation.create({
      data: { userId, characterId: character.id },
      select: { id: true },
    });
    const { messageCount } = await this.exchangeWithTools(
      convo.id,
      this.buildInstruction(character, memories),
      content,
    );
    this.triggerExtraction(userId, convo.id, messageCount);
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
    const { character, memories } = await this.getPromptContext(userId);
    const { reply, messageCount } = await this.exchangeWithTools(
      convo.id,
      this.buildInstruction(character, memories),
      content,
    );
    this.triggerExtraction(userId, conversationId, messageCount);
    return reply;
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
  ): Promise<{ reply: MessageType; messageCount: number }> {
    await this.prisma.message.create({
      data: { conversationId, role: 'user', content },
    });

    console.log('1: ', instruction);

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

    console.log('22..:', JSON.stringify(res));

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
    // history 는 방금 저장한 유저 메시지까지 포함하므로, assistant 저장 후 총 개수 = history.length + 1.
    // 추출 트리거가 별도 count 쿼리 없이 이 값을 쓴다.
    return { reply: toMessage(updated.messages[0]), messageCount: history.length + 1 };
  }

  /**
   * exchange 의 툴 버전 — search_products 툴을 붙여 대화한다.
   * 모델이 상품추천이 필요하다 판단하면 툴을 부르고, 실행기가 commerce.search 로 후보를 가져와
   * 재주입 → 모델이 그 결과로 이유 있는 답을 쓴다. (기본 exchange 는 재사용 위해 그대로 둔다)
   * 지금은 (i) 텍스트 답변만 — 검색된 상품 카드 첨부는 다음 단계.
   */
  private async exchangeWithTools(
    conversationId: string,
    instruction: string,
    content: string,
  ): Promise<{ reply: MessageType; messageCount: number }> {
    console.log('1');
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

    // 툴 실행기: 모델이 준 인자를 검색조건으로 변환해 commerce.search 호출 (limit 은 서버 고정)
    const executors: Record<string, LlmToolExecutor> = {
      search_products: async (args) => {
        const result = await this.commerce.search({
          keywords: String(args.keywords ?? ''),
          category: typeof args.category === 'string' ? args.category : undefined,
          priceMin: typeof args.priceMin === 'number' ? args.priceMin : undefined,
          priceMax: typeof args.priceMax === 'number' ? args.priceMax : undefined,
          limit: 8,
        });
        return result.products; // 모델엔 상품 배열을 넘김 → 모델이 이유 써서 답변
      },
    };

    const res = await this.llm.chatWithTools(
      instruction,
      messages,
      [SEARCH_PRODUCTS_TOOL],
      executors,
      this.model,
    );
    console.log(JSON.stringify(res));

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
    return { reply: toMessage(updated.messages[0]), messageCount: history.length + 1 };
  }

  /**
   * N 메시지마다 장기 메모리 추출을 백그라운드로 돌린다 (응답을 막지 않는 fire-and-forget).
   * messageCount 는 exchange 가 이미 계산한 값 — 별도 count 쿼리를 하지 않는다.
   */
  private triggerExtraction(userId: string, conversationId: string, messageCount: number): void {
    if (messageCount % this.extractEveryN !== 0) return;
    void this.memory
      .extractMemory(userId, conversationId)
      .catch((err) => this.logger.error('메모리 추출 트리거 실패', err as Error));
  }

  /**
   * 프롬프트 조립에 필요한 컨텍스트(내 캐릭터 + 소유 유저 이름 + 장기 메모리)를 읽는다.
   * 캐릭터 쿼리와 메모리 recall 을 병렬로 돌린다. 캐릭터가 없으면 에러.
   */
  private async getPromptContext(
    userId: string,
  ): Promise<{ character: CharacterPromptSource; memories: RecalledMemory[] }> {
    const [character, memories] = await Promise.all([
      this.prisma.character.findUnique({
        where: { userId },
        select: {
          id: true,
          name: true,
          instruction: true,
          user: { select: { name: true } },
        },
      }),
      this.memory.recall(userId), // ← 주입 seam
    ]);
    if (!character) {
      throw new BadRequestException('먼저 캐릭터를 만들어 주세요.');
    }
    return { character, memories };
  }

  /** LLM 에 넘길 최종 캐릭터 instruction 을 조립한다 (캐릭터 + 유저 이름 + 장기 메모리). */
  private buildInstruction(c: CharacterPromptSource, memories: RecalledMemory[]): string {
    const lines = [`너의 이름은 ${c.name}이야.`];
    if (c.user.name) {
      lines.push(`대화 상대(사용자)의 이름은 ${c.user.name}이야.`);
    }
    if (memories.length) {
      const facts = memories.map((m) => `- ${m.content}`).join('\n');
      lines.push(`사용자에 대해 기억하는 것:\n${facts}`);
    }
    lines.push(c.instruction);
    return lines.join('\n');
  }
}
