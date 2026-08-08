import type {
  AddIngredientInputType,
  AddProposalItemType,
  ApplyProposalRequestType,
  ChatRoleType,
  ConsumeProposalItemType,
  ConversationDetailType,
  ConversationSummaryType,
  FunctionCallPayloadType,
  FunctionOutputPayloadType,
  InventoryProposalType,
  MessageType,
  ProductSearchCriteriaType,
  ProductType,
  ResolveProposalResultType,
} from '@companion/types';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommerceService } from '../commerce/commerce.service';
import { Prisma } from '../generated/prisma/client';
import {
  InventoryService,
  type ConsumeItem,
  type RecalledIngredient,
} from '../inventory/inventory.service';
import { CATEGORY_VALUES, STORAGE_VALUES } from '../inventory/shelf-life';
import {
  LlmService,
  type LlmInputItemType,
  type LlmTool,
  type LlmToolExecutor,
  type TerminalToolCall,
} from '../llm/llm.service';
import { MemoryService, type RecalledMemory } from '../memory/memory.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  attachContext,
  buildPrompt,
  type BuiltPromptType,
  type PromptCharacterType,
} from './conversation.prompt';

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
 * 냉장고 재고 변경 툴 — 추가(산 것)와 소비(먹은 것)를 **한 번에** 표현한다.
 * "계란 샀어" 같은 추가가 이 앱의 주 입력 경로이고, "다 먹었어" 같은 소비도 같은 호출로 처리한다.
 * 두 배열을 한 툴에 둔 이유: "김치찌개 만들고 두부 샀어"처럼 추가+소비가 동시에 오는 걸 한 번에 담기 위함.
 * 만료일 폴백·병합·이름 매칭은 서버가 흡수하므로, 모델은 모르면 비워두면 된다.
 */
const UPDATE_INVENTORY_TOOL: LlmTool = {
  name: 'update_inventory',
  terminal: true, // 종결 툴 — 실행하지 않고 확인 카드로 올린다(실제 반영은 사용자 확인 후)
  description:
    '냉장고 재고 변경을 제안한다. 사용자가 재료를 샀거나 냉장고에 있다고 하면 add 에, 실제로 먹었거나 다 썼다고 하면 consume 에 넣는다("김치찌개 만들고 두부 샀어" 처럼 둘을 한 번에 담을 수 있다). 요리를 추천만 하고 아직 안 만들었으면 consume 하지 마라. 재료 보유·소비와 무관한 대화에서는 호출하지 않는다.',
  parameters: {
    type: 'object',
    properties: {
      add: {
        type: 'array',
        description: '새로 넣을(산) 재료 목록',
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
              description:
                '지금 냉장고에 있는 총량을 사용자 표현 그대로 ("한 판", "1L", "두 봉지"). 이미 있던 재료를 더 샀다면 프롬프트의 기존 재고 수량에 이번에 산 양을 더한 합계를 적어라 (예: 기존 5개 + 2개 구매 → "7개"). 모르면 생략',
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
      consume: {
        type: 'array',
        description: '먹었거나 쓴 재료 목록',
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
    additionalProperties: false,
  },
};

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
  type: true,
  role: true,
  content: true,
  payload: true,
  createdAt: true,
} as const;

/** DB enum 을 문자열 유니온으로 받아 `===` 비교에서 no-unsafe-enum-comparison 이 안 터지게 한다(role 과 같은 패턴). */
type MessageItemTypeValue = 'TEXT' | 'FUNCTION_CALL' | 'FUNCTION_CALL_OUTPUT';

/**
 * 메모리 추출 주기를 세는 단위 — **말풍선(`TEXT`)만** 센다.
 *
 * 툴 호출·결과까지 세면 안 된다: 아이템 구조로 바뀌면서 한 턴이 1행이 아니라 2~3행
 * (`TEXT` + `FUNCTION_CALL` + `FUNCTION_CALL_OUTPUT`)이 될 수 있어, 같은 대화량에서 추출이
 * 예전보다 2~3배 자주 돌았다("억지 추출"의 원인). `extractEveryN` 이 "몇 마디마다"라는
 * 사람이 읽는 의미를 유지하려면 세는 대상이 말풍선이어야 한다.
 */
const countText = (rows: { type: MessageItemTypeValue }[]): number =>
  rows.filter((r) => r.type === 'TEXT').length;

type MessageRow = {
  id: string;
  type: MessageItemTypeValue;
  role: ChatRoleType | null;
  content: string | null;
  payload: Prisma.JsonValue | null;
  createdAt: Date;
};

type CharacterPromptSource = PromptCharacterType & {
  id: string;
  /** 캐릭터 소유 유저 — 이름을 프롬프트에 넣어 "나를 아는" 느낌을 준다 (name 은 nullable) */
  user: { name: string | null };
};

/** 저장 행 → 클라 계약(판별 유니온). payload 는 우리가 쓴 모양이 보장된다. */
const toMessage = (m: MessageRow): MessageType => {
  const createdAt = m.createdAt.toISOString();
  if (m.type === 'FUNCTION_CALL') {
    return {
      id: m.id,
      type: 'FUNCTION_CALL',
      createdAt,
      payload: m.payload as unknown as FunctionCallPayloadType,
    };
  }
  if (m.type === 'FUNCTION_CALL_OUTPUT') {
    return {
      id: m.id,
      type: 'FUNCTION_CALL_OUTPUT',
      createdAt,
      payload: m.payload as unknown as FunctionOutputPayloadType,
    };
  }
  return {
    id: m.id,
    type: 'TEXT',
    role: m.role ?? 'assistant',
    content: m.content ?? '',
    createdAt,
  };
};

/**
 * 저장 행들 → LLM 재생용 아이템.
 *
 * ⚠️ **미확인 호출에는 자리표시 결과를 붙인다.** OpenAI 는 짝 없는 `function_call` 이 입력에 있으면
 * 400(No tool output found for function call ...)으로 거절한다. 사용자가 확인 카드를 무시한 채
 * 다음 메시지를 보내면 정확히 그 상태가 되므로, 재생 시점에 `{ pending: true }` 결과를 만들어 짝을 채운다.
 * DB 에는 쓰지 않는다 — 실제 결과는 확인/취소 때 별도 행으로 남는다.
 * 덤으로 모델이 "저 제안은 아직 대기 중"임을 알게 돼 같은 제안을 반복할 이유가 줄어든다.
 */
function toLlmItems(rows: MessageRow[]): LlmInputItemType[] {
  const resolvedCallIds = new Set(
    rows
      .filter((r) => r.type === 'FUNCTION_CALL_OUTPUT')
      .map((r) => (r.payload as unknown as FunctionOutputPayloadType | null)?.callId)
      .filter((id): id is string => typeof id === 'string'),
  );

  const items: LlmInputItemType[] = [];
  for (const row of rows) {
    if (row.type === 'FUNCTION_CALL') {
      const p = row.payload as unknown as FunctionCallPayloadType | null;
      if (!p) continue;
      items.push({
        type: 'function_call',
        callId: p.callId,
        name: p.name,
        arguments: p.arguments,
      });
      if (!resolvedCallIds.has(p.callId)) {
        items.push({
          type: 'function_call_output',
          callId: p.callId,
          name: p.name,
          output: { pending: true, note: '사용자 확인 대기 중 — 아직 반영되지 않았다' },
        });
      }
      continue;
    }
    if (row.type === 'FUNCTION_CALL_OUTPUT') {
      const p = row.payload as unknown as FunctionOutputPayloadType | null;
      if (!p) continue;
      items.push({
        type: 'function_call_output',
        callId: p.callId,
        name: p.name,
        output: p.output,
      });
      continue;
    }
    items.push({ type: 'text', role: row.role ?? 'assistant', content: row.content ?? '' });
  }
  return items;
}

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
        // 미리보기는 **말풍선만** 본다 — 마지막 아이템이 툴 호출이면 보여줄 텍스트가 없다.
        messages: {
          where: { type: 'TEXT' },
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
    const prompt = buildPrompt({
      character,
      userName: character.user.name,
      memories,
      inventory,
    });
    const convo = await this.prisma.conversation.create({
      data: { userId, characterId: character.id },
      select: { id: true },
    });
    const { messageCount } = await this.exchangeWithTools(userId, convo.id, prompt, content);
    this.triggerExtraction(userId, convo.id, messageCount);
    return this.get(userId, convo.id);
  }

  /**
   * 기존 대화에 메시지 전송 → **이번 턴에 새로 생긴 아이템들** 반환 (본인 것만).
   * 한 턴에 텍스트와 툴 호출이 함께 나올 수 있어서 단건이 아니라 배열이다.
   */
  async sendMessage(
    userId: string,
    conversationId: string,
    content: string,
  ): Promise<ResolveProposalResultType> {
    const convo = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });
    if (!convo) {
      throw new NotFoundException('대화를 찾을 수 없습니다.');
    }
    const { character, memories, inventory } = await this.getPromptContext(userId);
    const prompt = buildPrompt({
      character,
      userName: character.user.name,
      memories,
      inventory,
    });
    const { created, messageCount } = await this.exchangeWithTools(
      userId,
      convo.id,
      prompt,
      content,
    );
    this.triggerExtraction(userId, conversationId, messageCount);
    return { messages: created };
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
   * 확인 대상 툴 호출을 읽어 **소유권 + 아직 미처리** 를 검증한다. 아니면 예외.
   *
   * "미처리" 판정은 상태 필드가 아니라 **같은 callId 의 FUNCTION_CALL_OUTPUT 이 없는 것**이다
   * (상태를 따로 들고 있으면 두 기록이 어긋난다). 같은 확인 요청이 두 번 와도 두 번째는 여기서 막힌다.
   */
  private async loadPendingCall(
    userId: string,
    conversationId: string,
    messageId: string,
  ): Promise<FunctionCallPayloadType> {
    const msg = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId, conversation: { userId }, type: 'FUNCTION_CALL' },
      select: { payload: true },
    });
    if (!msg) throw new NotFoundException('메시지를 찾을 수 없어요.');
    const call = (msg.payload as unknown as FunctionCallPayloadType | null) ?? null;
    if (!call) throw new BadRequestException('확인할 제안이 없어요.');

    const done = await this.prisma.message.findFirst({
      where: {
        conversationId,
        type: 'FUNCTION_CALL_OUTPUT',
        payload: { path: ['callId'], equals: call.callId },
      },
      select: { id: true },
    });
    if (done) throw new BadRequestException('이미 처리된 제안이에요.');
    return call;
  }

  /** 툴 결과 아이템을 저장하고(+대화 updatedAt 갱신) 새로 생긴 아이템들을 돌려준다. */
  private async appendOutput(
    conversationId: string,
    call: FunctionCallPayloadType,
    output: Record<string, unknown>,
  ): Promise<ResolveProposalResultType> {
    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        updatedAt: new Date(),
        messages: {
          create: {
            type: 'FUNCTION_CALL_OUTPUT',
            payload: {
              callId: call.callId,
              name: call.name,
              output,
            } as unknown as Prisma.InputJsonValue,
          },
        },
      },
      select: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: MESSAGE_SELECT },
      },
    });
    return { messages: updated.messages.map(toMessage) };
  }

  /**
   * 소비 제안 확정 — 사용자가 카드에서 확인·편집한 값으로 실제 반영한다.
   * 소유권 격리 + pending 상태일 때만(멱등). 편집값은 제안에 실제 있던 id 만 반영(임의 주입 차단).
   * 반영 뒤 pendingChange.status='applied' 로 갱신한 메시지를 돌려준다.
   * (B-완료턴 승격 지점: 지금은 completion=null 로 클라가 템플릿 표시. 여기서 LLM 완료 답변을 만들어
   *  completion 에 담으면 클라 변경 없이 "컴패니언이 결과에 반응" 으로 올라간다.)
   */
  async applyProposal(
    userId: string,
    conversationId: string,
    messageId: string,
    items: ApplyProposalRequestType['items'],
  ): Promise<ResolveProposalResultType> {
    const call = await this.loadPendingCall(userId, conversationId, messageId);
    const proposal = (call.resolved as InventoryProposalType | undefined) ?? {};

    // 소비: 사용자가 편집한 값(items) 중 제안에 실제로 있던 id 만 반영(임의 id 주입 차단).
    const allowed = new Set((proposal.consume ?? []).map((it) => it.ingredientId));
    const toConsume = items.filter((it) => allowed.has(it.ingredientId));
    const consumed: string[] = [];
    const updatedQty: string[] = [];
    if (toConsume.length > 0) {
      await this.inventory.applyConsume(userId, toConsume);
      const byId = new Map((proposal.consume ?? []).map((c) => [c.ingredientId, c.name]));
      for (const it of toConsume) {
        const name = byId.get(it.ingredientId) ?? '';
        if (it.remaining === null) consumed.push(name);
        else updatedQty.push(`${name} → ${it.remaining}`);
      }
    }

    // 추가: 확인-only 라 제안에 담긴 그대로 반영(병합·만료일 폴백은 inventory.add 가 처리).
    // 사용자가 표기일을 준 경우(USER)만 expiresAt 을 넘겨 그 값을 유지하고, 추정치면 add 가 다시 추정한다.
    if (proposal.add?.length) {
      await this.inventory.add(
        userId,
        proposal.add.map((a) => ({
          name: a.name,
          category: a.category,
          storage: a.storage,
          ...(a.quantityNote ? { quantityNote: a.quantityNote } : {}),
          ...(a.expirySource === 'USER' ? { expiresAt: a.estimatedExpiry } : {}),
        })),
      );
    }

    // 결과는 **실제로 반영한 것**을 담는다 — 클라가 보낸 값이 아니라 서버가 쓴 값이다.
    return this.appendOutput(conversationId, call, {
      applied: true,
      consumed,
      updated: updatedQty,
      added: (proposal.add ?? []).map((a) => a.name),
    });
  }

  /** 제안 취소 — 재고를 건드리지 않고 "취소됨" 결과만 남긴다. 소유권 + 미처리 검증. */
  async dismissProposal(
    userId: string,
    conversationId: string,
    messageId: string,
  ): Promise<ResolveProposalResultType> {
    const call = await this.loadPendingCall(userId, conversationId, messageId);
    return this.appendOutput(conversationId, call, {
      applied: false,
      dismissed: true,
      note: '사용자가 이 변경을 취소했다. 재고는 그대로다.',
    });
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
    prompt: BuiltPromptType,
    content: string,
  ): Promise<{ created: MessageType[]; messageCount: number }> {
    await this.prisma.message.create({
      data: { conversationId, type: 'TEXT', role: 'user', content },
    });

    // 히스토리를 아이템 그대로 읽어 재생한다 (지난 툴 호출·결과 포함).
    const history = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: MESSAGE_SELECT,
    });
    const items = toLlmItems(history);

    // 이전 검색 페이징 커서 (다음/다른 상품 요청 시 이어 검색)
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { lastSearch: true },
    });
    let cursor: LastSearch | null = (convo?.lastSearch as LastSearch | null) ?? null;
    let searched = false;

    // 검색된 상품을 클로저로 캡처 (모델 답변과 별개로, 카드 스냅샷 저장용)
    const foundProducts: ProductType[] = [];

    // add/consume 은 terminal 툴이라 실행기가 없다 — 모델이 부르면 chatWithTools 가 그 호출을
    // 그대로 올려주고(res.terminalCalls), 아래 buildProposal 이 확인 제안으로 만든다.
    const executors: Record<string, LlmToolExecutor> = {
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
    // 정적 부분(페르소나·규칙)은 instructions 로, 매 턴 바뀌는 상태는 **마지막 사용자 메시지 꼬리**로.
    // DB 에는 사용자가 친 원문만 남아 있고(위 create), 상태는 여기서 보낼 때만 덧씌워진다.
    const res = await this.llm.chatWithTools(
      prompt.system,
      attachContext(items, prompt.context),
      [UPDATE_INVENTORY_TOOL],
      executors,
      this.model,
    );

    // 모델은 **텍스트와 툴 호출을 같이 낼 수 있다** → 각각 별개 아이템으로 쌓는다.
    // 예전처럼 "반영했어요" 같은 문장을 지어내지 않는다 (그 역할은 FUNCTION_CALL_OUTPUT 이 한다).
    const create: Prisma.MessageCreateWithoutConversationInput[] = [];
    if (res.text.trim().length > 0) {
      create.push({ type: 'TEXT', role: 'assistant', content: res.text });
    }
    for (const call of await this.buildCallPayloads(userId, res.terminalCalls)) {
      create.push({
        type: 'FUNCTION_CALL',
        payload: call as unknown as Prisma.InputJsonValue,
      });
    }
    if (create.length === 0) return { created: [], messageCount: countText(history) };

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        updatedAt: new Date(),
        // 이번 턴에 검색했으면 페이징 커서 갱신 (다음 "더 보여줘" 이어가기용)
        lastSearch: searched ? (cursor as unknown as Prisma.InputJsonValue) : undefined,
        messages: { create },
      },
      select: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: create.length,
          select: MESSAGE_SELECT,
        },
      },
    });
    // desc 로 뽑았으니 시간순으로 되돌린다
    const created = updated.messages.map(toMessage).reverse();
    // created 는 판별 유니온(MessageType)이라 그대로 셀 수 있다 — create(Prisma 입력)를 세지 않는 이유.
    return { created, messageCount: countText(history) + countText(created) };
  }

  /**
   * 종결 툴 호출 → 저장할 `FUNCTION_CALL` payload 목록 — 아무것도 쓰지 않는다.
   *
   * payload 는 **모델이 한 말(`arguments`) + 서버가 화면용으로 가공한 값(`resolved`)** 을 함께 담는다.
   * 원본 인자엔 `ingredientId` 가 없어서 확인 카드가 apply 를 할 수 없기 때문이다.
   * consume 은 resolveConsume(이름→행+현재수량), add 는 previewAdd(정규화+만료일 추정).
   */
  private async buildCallPayloads(
    userId: string,
    calls: TerminalToolCall[] | undefined,
  ): Promise<FunctionCallPayloadType[]> {
    const picked = pickInventoryCall(calls);
    if (!picked) return [];
    // 버린 호출이 있으면 남긴다 — 모델이 "정당하게 나눠 부르는" 경우가 실제로 나오는지
    // 이 로그로만 알 수 있다(그런 호출이 잦으면 합치는 쪽으로 다시 판단한다).
    if (picked.ignored > 0) {
      this.logger.warn(
        `update_inventory 가 ${picked.ignored + 1}번 호출돼 첫 호출만 반영 (user=${userId}, 무시=${picked.ignored})`,
      );
    }

    const add: AddProposalItemType[] =
      picked.addItems.length > 0 ? this.inventory.previewAdd(picked.addItems) : [];
    const consume: ConsumeProposalItemType[] =
      picked.consumeItems.length > 0
        ? (await this.inventory.resolveConsume(userId, picked.consumeItems)).matched
        : [];

    // 이름이 하나도 안 잡히면 카드로 보여줄 게 없다 → 아예 저장하지 않는다.
    if (consume.length === 0 && add.length === 0) return [];

    const resolved: InventoryProposalType = {
      ...(consume.length > 0 ? { consume } : {}),
      ...(add.length > 0 ? { add } : {}),
    };
    return [
      {
        callId: picked.callId,
        name: 'update_inventory',
        arguments: { add: picked.addItems, consume: picked.consumeItems },
        resolved,
      },
    ];
  }

  /**
   * N 말풍선마다 장기 메모리 추출을 백그라운드로 돌린다 (응답을 막지 않는 fire-and-forget).
   * messageCount 는 exchange 가 이미 계산한 `TEXT` 개수 — 별도 count 쿼리를 하지 않는다(`countText` 참고).
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
    // instruction 은 저장하지 않는다 — 구조화 필드를 그대로 넘겨 프롬프트 시점에 조립한다.
    const character: CharacterPromptSource = {
      id: row.id,
      name: row.name,
      speechStyle: row.speechStyle,
      userNickname: row.userNickname,
      user: row.user,
    };
    return { character, memories, inventory };
  }
}

/**
 * 종결 툴 호출들 중 **첫 `update_inventory` 하나만** 고른다. 나머지는 버린다.
 *
 * 벤더 기본값이 병렬 툴콜이라 모델이 한 턴에 `update_inventory` 를 여러 번 부른다. 실제로 관측된
 * 호출들은 뒤로 갈수록 앞의 판단과 어긋났고(같은 소비가 두 번, 같은 재료가 add·consume 양쪽에),
 * 전부 합치면 확인 카드에 같은 재고 행이 두 줄 올라와 `ingredientId` key 가 충돌했다.
 * 그래서 합치지 않고 **첫 판단만 믿는다.**
 *
 * ⚠️ 대가: 모델이 정당하게 나눠 부르면(call1=add, call2=consume) 뒷부분이 유실된다.
 * 그런 호출이 실제로 나오는지는 호출자가 `ignored` 로 남기는 경고 로그로만 알 수 있다.
 */
export function pickInventoryCall(calls: TerminalToolCall[] | undefined):
  | {
      /** 채택한 호출의 벤더 식별자 — 결과 아이템과 짝을 맞추는 키라 반드시 함께 올린다 */
      callId: string;
      addItems: AddIngredientInputType[];
      consumeItems: ConsumeItem[];
      /** 버려진 update_inventory 호출 수 (0 이면 단일 호출) */
      ignored: number;
    }
  | undefined {
  if (!calls?.length) return undefined;
  const mine = calls.filter((c) => c.name === 'update_inventory');
  const first = mine[0];
  if (!first) return undefined;

  // 인자는 모델이 만든 JSON 이라 모양을 믿지 않는다 — 배열이 아니면 없는 것으로 친다.
  const addItems: AddIngredientInputType[] = Array.isArray(first.arguments.add)
    ? first.arguments.add
    : [];
  const consumeItems: ConsumeItem[] = Array.isArray(first.arguments.consume)
    ? first.arguments.consume
    : [];
  return { callId: first.callId, addItems, consumeItems, ignored: mine.length - 1 };
}
