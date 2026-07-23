import type {
  AddIngredientInputType,
  ChatMessageType,
  ChatRoleType,
  ConversationDetailType,
  ConversationSummaryType,
  MessageType,
  ProductSearchCriteriaType,
  ProductType,
} from '@companion/types';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildPersonaInstruction } from '../character/persona';
import { CommerceService } from '../commerce/commerce.service';
import { Prisma } from '../generated/prisma/client';
import {
  InventoryService,
  type ConsumeItem,
  type RecalledIngredient,
} from '../inventory/inventory.service';
import { CATEGORY_VALUES, STORAGE_VALUES } from '../inventory/shelf-life';
import { LlmService, type LlmTool, type LlmToolExecutor } from '../llm/llm.service';
import { MemoryService, type RecalledMemory } from '../memory/memory.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 채팅 중 상품추천용 툴. 모델이 "쇼핑/추천이 필요하다" 판단할 때만 부른다(description 이 그 판단 근거).
 * 실행기는 exchangeWithTools 에서 commerce.search 로 연결한다.
 *
 * ⚠️ v1 에서는 **등록만 해제**했다(실행기·상품 카드 저장 경로는 그대로 살아 있다).
 * v1 의 검증 대상은 "유저가 재고를 넣고 유지하는가" 라서 툴셋을 냉장고만으로 좁혔다.
 * 부족한 재료 쇼핑 추천을 붙이는 v1.2 에서 tools 배열에 다시 넣으면 된다.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- v1.2 에서 되살릴 예정
const SEARCH_PRODUCTS_TOOL: LlmTool = {
  name: 'search_products',
  description:
    '사용자에게 실제 상품을 추천할 준비가 됐을 때만 상품을 검색한다. 예산·용도 같은 추천에 필요한 핵심 조건이 아직 없으면 호출하지 말고, 먼저 대화로 그 조건을 물어 채운다(단, 사용자가 "그냥 추천해줘"라고 하거나 조건을 이미 충분히 줬으면 바로 호출한다). 일반 잡담이나 상품과 무관한 대화에서는 호출하지 않는다.',
  parameters: {
    type: 'object',
    properties: {
      keywords: { type: 'string', description: '검색어 (예: "책상 조명", "무선 이어폰")' },
      priceMin: { type: 'number', description: '최소 가격, 원 (선택)' },
      priceMax: { type: 'number', description: '최대 가격, 원 (선택)' },
      more: {
        type: 'boolean',
        description:
          '직전과 같은 요청의 "다음/다른 상품"을 원할 때 true (예: "다른 거 보여줘", "이건 별로야"). 이때 keywords 는 직전과 같게 넣는다.',
      },
    },
    required: ['keywords'],
    additionalProperties: false,
  },
};

/**
 * 냉장고에 재료를 넣는 툴. "계란이랑 우유 사왔어" 같은 말에서 모델이 재료를 뽑아 호출한다.
 * 이게 이 앱의 주 입력 경로다 — 사진보다 마찰이 낮고, 유저가 폼을 채우지 않아도 재고가 쌓인다.
 * 만료일은 서버가 카테고리×보관위치로 추정해 채우므로, 모델은 모르면 그냥 비워두면 된다.
 */
const ADD_INGREDIENTS_TOOL: LlmTool = {
  name: 'add_ingredients',
  description:
    '사용자가 식재료를 샀거나 냉장고에 있다고 말하면 재고에 넣는다. 여러 개면 한 번에 배열로 넣어라. 이미 있는 재료를 다시 말하면 서버가 알아서 병합하므로 중복 걱정은 하지 마라. 요리 얘기만 하거나 재료 보유와 무관한 대화에서는 호출하지 않는다.',
  parameters: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: '넣을 재료 목록',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '재료명. 짧은 일반명으로 ("계란", "대파")' },
            category: {
              type: 'string',
              enum: CATEGORY_VALUES,
              description: '재료 분류. 소비기한 추정에 쓰이니 되도록 채워라',
            },
            quantityNote: {
              type: 'string',
              description: '수량을 사용자가 말한 그대로 ("한 판", "1L", "두 봉지"). 없으면 생략',
            },
            storage: {
              type: 'string',
              enum: STORAGE_VALUES,
              description: '보관 위치. 냉동/실온이라고 말했을 때만 채우고 기본은 생략(냉장)',
            },
            expiresAt: {
              type: 'string',
              description:
                '사용자가 유통기한·소비기한을 직접 말한 경우에만 ISO 날짜로. 모르면 반드시 생략해라(서버가 추정한다). 지어내지 마라',
            },
          },
          required: ['name'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  },
};

/**
 * 재료를 소비 처리하는 툴.
 * **얼마를 썼는지가 아니라 뭐가 남았는지**(remaining)를 받는다 — 산수는 재고를 프롬프트로 받은
 * 모델이 하고 서버는 결과만 저장한다. 자동 차감은 틀리면 신뢰를 깎으므로,
 * 사용자가 실제로 먹었다/썼다고 말했을 때만 부르게 description 에 못박는다.
 */
const CONSUME_INGREDIENTS_TOOL: LlmTool = {
  name: 'consume_ingredients',
  description:
    '사용자가 재료를 실제로 먹었거나 다 썼다고 말했을 때만 호출한다("만들었어", "다 먹었어", "3개 썼어"). 요리를 추천만 하고 아직 안 만들었으면 절대 호출하지 마라. 일부만 썼으면 remaining 에 남은 양을 적고, 다 썼으면 remaining 을 생략해라.',
  parameters: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: '소비한 재료 목록',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '재고에 있는 재료명 그대로' },
            remaining: {
              type: 'string',
              description:
                '쓰고 남은 양 ("2개", "반 팩"). 남은 게 있을 때만. 다 썼으면 생략해라 — 생략하면 냉장고에서 빠진다',
            },
          },
          required: ['name'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  },
};

/**
 * 레시피 답변 지침 — 툴 경로에서 instruction 에 덧붙인다.
 * v1 은 외부 레시피 검색 없이 모델 내장 지식으로 답한다(네이버·유튜브는 v1.1).
 */
const RECIPE_GUIDANCE = [
  '[요리를 추천할 때]',
  '- 냉장고에 있는 재료로 만들 수 있는 걸 우선 제안해라. 없는 재료를 잔뜩 사야 하는 요리는 피해라.',
  '- 곧 상하는 재료가 있으면 그걸 쓰는 요리를 먼저 권하고, 왜 권하는지 한마디로 짚어라. (예: "대파가 내일까지라 이거 먼저 쓰자") 단, 먹으면 안 되는 재료는 아무리 급해도 예외다.',
  '- 부족한 재료가 있으면 숨기지 말고 "○○만 있으면 돼" 처럼 솔직히 말해라.',
  '- 조리법은 핵심 순서만 짧게. 사용자가 더 물으면 그때 자세히 풀어라.',
  '- 사용자가 못 먹는 재료·알레르기는 절대 넣지 마라. 대체 재료를 제안해라.',
  '- 재료를 추천했다고 소비 처리하지 마라. 실제로 만들었다고 할 때만 consume_ingredients 를 불러라.',
].join('\n');

/**
 * 상품 추천 답변 지침 — 툴 경로에서만 instruction 에 덧붙인다.
 * 카드가 이미 사진·가격·링크를 보여주므로, LLM 텍스트는 그걸 반복하지 않고 이유만 간결히.
 *
 * ⚠️ SEARCH_PRODUCTS_TOOL 과 함께 v1.2 까지 대기 중. 지금은 RECIPE_GUIDANCE 가 그 자리를 쓴다.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- v1.2 에서 되살릴 예정
const PRODUCT_RECO_GUIDANCE = [
  '[상품을 추천할 때]',
  '- 추천 상품은 이미 카드(사진·상품명·가격·구매 링크)로 사용자에게 함께 보여진다.',
  '- 상품명·가격·URL·이미지 주소·상세 스펙을 텍스트로 다시 나열하지 마라. 링크나 이미지 주소는 문장에 절대 넣지 마라.',
  '- 대신 짧고 다정하게: 사용자의 취향·상황에 왜 맞는지 한두 문장 + 특히 추천하는 하나를 자연스럽게 짚어라.',
  '- "아래 카드를 확인해보고, 다른 것도 보고 싶으면 말해줘" 같은 안내로 가볍게 마무리해도 좋다.',
  '- 전체 2~3문장 이내로 간결하게.',
  '- 사용자가 "다른 거/다음 거"를 원하거나 추천이 맘에 안 든다고 하면, search_products 를 more:true 로 다시 불러 다음 상품을 보여줘라.',
  '- 도구 결과가 비어 있거나 exhausted 면 "더 찾은 게 없어요"처럼 솔직히 알려라.',
].join('\n');

/** 상품 검색 페이징 커서 (Conversation.lastSearch 에 저장) — "다음/다른 상품"을 이어 검색하기 위한 상태. */
type LastSearch = {
  keywords: string;
  priceMin?: number;
  priceMax?: number;
  nextStart: number;
  hasMore: boolean;
};

const MESSAGE_SELECT = {
  id: true,
  role: true,
  content: true,
  products: true,
  hasMoreProducts: true,
  createdAt: true,
} as const;

type MessageRow = {
  id: string;
  role: ChatRoleType;
  content: string;
  products: Prisma.JsonValue | null;
  hasMoreProducts: boolean | null;
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
  // 저장은 Json 이지만 우리가 넣는 건 항상 ProductType[] (없으면 null → 카드 없음)
  products: (m.products as unknown as ProductType[] | null) ?? undefined,
  hasMoreProducts: m.hasMoreProducts ?? undefined,
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
    private readonly inventory: InventoryService,
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
    const { character, memories, inventory } = await this.getPromptContext(userId);
    const convo = await this.prisma.conversation.create({
      data: { userId, characterId: character.id },
      select: { id: true },
    });
    const { messageCount } = await this.exchangeWithTools(
      userId,
      convo.id,
      this.buildInstruction(character, memories, inventory),
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
    const { character, memories, inventory } = await this.getPromptContext(userId);
    const { reply, messageCount } = await this.exchangeWithTools(
      userId,
      convo.id,
      this.buildInstruction(character, memories, inventory),
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
    userId: string,
    conversationId: string,
    instruction: string,
    content: string,
  ): Promise<{ reply: MessageType; messageCount: number }> {
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

    // 이전 검색 페이징 커서 (다음/다른 상품 요청 시 이어 검색)
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { lastSearch: true },
    });
    let cursor: LastSearch | null = (convo?.lastSearch as LastSearch | null) ?? null;
    let searched = false;

    // 검색된 상품을 클로저로 캡처 (모델 답변과 별개로, 카드 스냅샷 저장용)
    const foundProducts: ProductType[] = [];

    const executors: Record<string, LlmToolExecutor> = {
      // 재고 추가 — 만료일 폴백·중복 병합은 서비스가 흡수하므로 여기선 인자만 정리해 넘긴다.
      add_ingredients: async (args) => {
        const items: AddIngredientInputType[] = Array.isArray(args.items) ? args.items : [];
        const saved = await this.inventory.add(userId, items);
        // 저장된 만료일을 모델에 돌려줘야 "계란은 8/11까지야" 처럼 확인해줄 수 있다.
        return {
          added: saved.map((i) => ({
            name: i.name,
            quantityNote: i.quantityNote,
            expiresAt: i.expiresAt.slice(0, 10),
            expiryIsEstimated: i.expirySource === 'ESTIMATED',
          })),
        };
      },

      // 소비 처리 — remaining 이 있으면 부분 소비(수량만 갱신), 없으면 냉장고에서 제거.
      consume_ingredients: (args) => {
        const items: ConsumeItem[] = Array.isArray(args.items) ? args.items : [];
        return this.inventory.consumeByNames(userId, items);
      },

      // 툴 실행기: more 면 저장된 커서에서 이어 검색, 아니면 새 검색(첫 페이지). 검색 후 커서 갱신.
      search_products: async (args) => {
        const more = args.more === true;
        let criteria: ProductSearchCriteriaType;
        if (more && cursor) {
          if (!cursor.hasMore) return { products: [], exhausted: true }; // 더 없음
          criteria = {
            keywords: cursor.keywords,
            priceMin: cursor.priceMin,
            priceMax: cursor.priceMax,
            start: cursor.nextStart,
            limit: 6,
          };
        } else {
          criteria = {
            keywords: String(args.keywords ?? ''),
            priceMin: typeof args.priceMin === 'number' ? args.priceMin : undefined,
            priceMax: typeof args.priceMax === 'number' ? args.priceMax : undefined,
            start: 1,
            limit: 6,
          };
        }
        const result = await this.commerce.search(criteria);
        searched = true;
        cursor = {
          keywords: criteria.keywords,
          priceMin: criteria.priceMin,
          priceMax: criteria.priceMax,
          nextStart: result.nextStart,
          hasMore: result.hasMore,
        };
        foundProducts.push(...result.products); // 카드 스냅샷용
        return { products: result.products, hasMore: result.hasMore }; // 모델엔 상품+더있음 여부
      },
    };

    // v1 툴셋 = 냉장고 재고만. search_products 는 실행기·상품 카드까지 그대로 살아 있지만
    // 등록만 빼둔다 — v1 검증(유저가 재고를 넣고 유지하는가)에 집중하고, v1.2 에서 되살린다.
    // 지침 순서는 buildInstruction 이 통제한다 (금지 재료가 반드시 맨 끝에 오도록).
    const res = await this.llm.chatWithTools(
      instruction,
      messages,
      [ADD_INGREDIENTS_TOOL, CONSUME_INGREDIENTS_TOOL],
      executors,
      this.model,
    );

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        updatedAt: new Date(),
        // 이번 턴에 검색했으면 페이징 커서 갱신 (다음 "더 보여줘" 이어가기용)
        lastSearch: searched ? (cursor as unknown as Prisma.InputJsonValue) : undefined,
        messages: {
          create: {
            role: 'assistant',
            content: res.text,
            // 검색이 있었으면 그 시점 상품 스냅샷 + "더 있음" 플래그를 함께 저장 (없으면 null)
            products: foundProducts.length
              ? (foundProducts as unknown as Prisma.InputJsonValue)
              : undefined,
            hasMoreProducts: foundProducts.length ? Boolean(cursor?.hasMore) : undefined,
          },
        },
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
  private async getPromptContext(userId: string): Promise<{
    character: CharacterPromptSource;
    memories: RecalledMemory[];
    inventory: RecalledIngredient[];
  }> {
    const [row, memories, inventory] = await Promise.all([
      this.prisma.character.findUnique({
        where: { userId },
        select: {
          id: true,
          name: true,
          speechStyle: true,
          userNickname: true,
          user: { select: { name: true } },
        },
      }),
      this.memory.recall(userId), // ← 주입 seam
      this.inventory.recall(userId), // ← 냉장고 재고 주입 seam
    ]);
    if (!row) {
      throw new BadRequestException('먼저 캐릭터를 만들어 주세요.');
    }
    // instruction 은 저장하지 않는다 — 구조화 필드에서 매번 조립(단일 진실원천).
    const character: CharacterPromptSource = {
      id: row.id,
      name: row.name,
      instruction: buildPersonaInstruction(row),
      user: row.user,
    };
    return { character, memories, inventory };
  }

  /**
   * LLM 에 넘길 최종 instruction 조립 (캐릭터 + 유저 이름 + 장기 메모리 + **냉장고 재고**).
   *
   * 재고는 전량 주입한다 — 수십 개 규모라 이게 더 싸고 정확하다(memories 와 같은 판단).
   * 남은 일수를 **서버가 계산해서** 넣는 게 중요하다: 모델은 오늘 날짜를 모르거나 틀리게 알고 있어서
   * 날짜만 주면 "곧 상해요" 판단을 못 한다. 조회 툴이 따로 필요 없어지는 것도 이 주입 덕분이다.
   */
  private buildInstruction(
    c: CharacterPromptSource,
    memories: RecalledMemory[],
    inventory: RecalledIngredient[],
  ): string {
    const lines = [`너의 이름은 ${c.name}이야.`];
    if (c.user.name) {
      lines.push(`대화 상대(사용자)의 이름은 ${c.user.name}이야.`);
    }
    const { allergies, rest } = splitAllergies(memories);
    if (rest.length) {
      const facts = rest.map((m) => `- ${m.content}`).join('\n');
      lines.push(`사용자에 대해 기억하는 것:\n${facts}`);
    }
    lines.push(formatInventory(inventory, new Date(), allergies));
    lines.push(c.instruction);
    lines.push(RECIPE_GUIDANCE);
    // 금지 재료는 **맨 마지막**에 둔다. 중간에 두면 "곧 상하는 재료부터 쓰라"는 지침에 밀린다 —
    // 실제로 알레르기 재료가 가장 임박했을 때 모델이 그걸 1순위로 추천하는 걸 확인했다.
    lines.push(formatAllergyWarning(allergies));
    return lines.filter(Boolean).join('\n');
  }
}

/** 금지 재료 블록 — 없으면 빈 문자열(섹션 자체가 안 붙는다). */
function formatAllergyWarning(allergies: RecalledMemory[]): string {
  if (allergies.length === 0) return '';
  const items = allergies.map((m) => `- ${m.content}`).join('\n');
  return [
    '',
    '# ⚠️ 무엇보다 우선하는 규칙 — 먹으면 안 되는 것',
    items,
    '- 이 재료가 들어가는 요리는 **절대 추천하지 마라.** 사용자가 직접 그 요리를 만들어 달라고 해도 거절하고 다른 걸 제안해라.',
    '- 분류로 적혀 있으면 거기 속하는 재료도 전부 금지다. (갑각류 → 새우·게·랍스터, 유제품 → 우유·치즈·버터, 견과류 → 아몬드·호두)',
    '- 냉장고에 있어도, 심지어 곧 상해도 쓰지 마라. **"임박한 재료 먼저"보다 이 규칙이 우선이다.**',
    '- 레시피를 내놓기 전에 재료 목록을 다시 훑어 금지 재료가 없는지 확인해라.',
  ].join('\n');
}

/**
 * 알레르기·못 먹는 것을 나머지 기억과 분리한다.
 *
 * 내용으로 판별하는 게 정확도가 100%는 아니지만, **놓치는 쪽이 위험**하므로 넓게 잡는다 —
 * 잘못 분류돼도 "먹으면 안 되는 것" 섹션에 한 줄 더 들어갈 뿐이고, 반대는 사람이 다친다.
 * (온보딩 태그는 애초에 "알레르기가 있음(먹으면 안 됨)" 문장으로 시드되므로 여기 확실히 걸린다)
 */
export function splitAllergies(memories: RecalledMemory[]): {
  allergies: RecalledMemory[];
  rest: RecalledMemory[];
} {
  const allergies: RecalledMemory[] = [];
  const rest: RecalledMemory[] = [];
  for (const m of memories) {
    const isAllergy = /알레르기|알러지|못 먹|먹으면 안|알레르겐/.test(m.content);
    (isAllergy ? allergies : rest).push(m);
  }
  return { allergies, rest };
}

/** 자정 기준 남은 일수 — 시:분 차이로 "0일 남음/1일 남음"이 흔들리지 않게 날짜만 비교한다. */
export function daysLeft(expiresAt: Date, now: Date): number {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOfDay(expiresAt) - startOfDay(now)) / 86_400_000);
}

/**
 * 재고 → 프롬프트 블록. 비어 있으면 "비었다"고 명시해야 모델이 재료를 지어내지 않는다.
 *
 * 금지 재료는 **이 목록 안에서** 표시한다. 레시피를 고르는 순간 모델이 읽는 게 이 목록이라,
 * 경고를 멀리 두면 "임박 재료 먼저" 규칙에 밀린다. 이름이 그대로 겹칠 때만 잡히고
 * 분류(갑각류→새우)는 못 잡으므로, 맨 끝 경고 블록이 그 부분을 맡는다.
 */
export function formatInventory(
  inventory: RecalledIngredient[],
  now = new Date(),
  allergies: RecalledMemory[] = [],
): string {
  if (inventory.length === 0) {
    return '냉장고: 아직 등록된 재료가 없어. 있는 재료를 물어보고 add_ingredients 로 넣어줘.';
  }

  const lines = inventory.map((i) => {
    const left = daysLeft(i.expiresAt, now);
    const when =
      left < 0
        ? `${Math.abs(left)}일 지남`
        : left === 0
          ? '오늘까지'
          : left === 1
            ? '내일까지'
            : `${left}일 남음`;
    const qty = i.quantityNote ? ` (${i.quantityNote})` : '';
    // 추정치는 "쯤"으로 표시 — 모델이 단정적으로 말하지 않게 한다
    const hedge = i.expirySource === 'ESTIMATED' ? ' 쯤' : '';
    const banned = allergies.some((a) => a.content.includes(i.name))
      ? ' ⚠️ 먹으면 안 되는 재료 — 요리에 쓰지 마라'
      : '';
    return `- ${i.name}${qty} · ${when}${hedge}${banned}`;
  });
  return `지금 냉장고에 있는 재료 (임박순):\n${lines.join('\n')}`;
}
