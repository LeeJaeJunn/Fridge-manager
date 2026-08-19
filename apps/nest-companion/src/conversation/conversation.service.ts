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
  ResolveProposalResultType,
} from '@companion/types';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { RecipeService } from '../recipe/recipe.service';
import {
  attachContext,
  buildPrompt,
  type BuiltPromptType,
  type PromptCharacterType,
} from './conversation.prompt';

/**
 * 한 턴에 허용하는 레시피 검색 횟수 상한.
 * 한 건이 네이버 호출 1회라, 모델이 요리를 잔뜩 나열하며 부르면 쿼터가 샌다.
 */
const MAX_RECIPE_SEARCHES_PER_TURN = 2;

/**
 * 레시피 검색 툴 — 사용자가 **자세한 레시피를 요청했을 때만** 부른다.
 *
 * 종결 툴이지만 `update_inventory` 와 실행 주체가 다르다: 재고는 **사람**이 확인해야 실행되고,
 * 레시피는 **서버가 바로 실행**한다. 그럼에도 종결로 둔 이유는 검색 결과를 모델에게 되먹여
 * 두 번째 답변을 받을 이유가 없어서다 — 카드가 이미 제목·출처·요약을 보여주므로 모델이 그걸 다시
 * 말하면 중복이고, LLM 호출만 두 배가 된다. 덤으로 `update_inventory` 와 같은 턴에 불려도
 * 둘 다 살아남는다(비-종결이면 종결 툴 분기가 먼저 반환해 이쪽이 통째로 유실된다).
 *
 * ⚠️ `terminal` 플래그는 곧 사라진다 — 모든 툴이 종결이라 provider 안의 툴 루프를 걷어낼 예정이고,
 * 그때 이 줄만 지우면 된다(동작은 그대로).
 */
const SEARCH_RECIPES_TOOL: LlmTool = {
  name: 'search_recipes',
  terminal: true,
  description:
    '특정 요리의 **자세한 레시피 글**을 웹에서 찾아 카드로 보여준다. 사용자가 "자세한 레시피 보여줘", "만드는 법 더 알려줘", "레시피 찾아줘"처럼 **구체적인 조리법을 원할 때만** 호출한다. 뭘 해먹을지 정하는 단계나 간단한 조리법을 말로 설명하는 단계에서는 호출하지 마라.',
  parameters: {
    type: 'object',
    properties: {
      dishName: {
        type: 'string',
        description: '요리 이름만 짧게 ("김치찌개", "된장찌개"). "레시피" 같은 말은 붙이지 마라',
      },
    },
    required: ['dishName'],
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
  // ⚠️ 문구를 고칠 때 주의할 것 두 가지:
  //  1. "재고 목록에 없는 재료" 는 system 의 `# 재고 관리` 와 **같은 낱말**이어야 한다. 모델이
  //     프롬프트에 주입된 재고 목록을 기준으로 판단하게 만드는 표현이고, 둘이 어긋나면 힘이 빠진다.
  //     (예전 "냉장고에 있다고 하면" 은 이미 목록에 있는 재료와 구분이 안 돼 애매했다)
  //  2. "한 번만 부른다" 를 빼지 말 것 — 모델이 한 턴에 이 툴을 두 번 불러 뒤 호출이 통째로
  //     버려지는 걸 실측했다(`pickInventoryCall` 의 ignored 경고).
  description:
    '냉장고 재고 변경을 제안한다. 재료가 추가되는 상황(이미 있는 재료를 더 샀거나, 현재 재고 목록에 없는 재료를 새로 보유하고 있다고 알려준 경우)에는 add 에 넣는다. 재고가 소비되는 상황(실제로 먹었거나, 요리에 썼거나, 다 써서 없어진 경우)에는 consume 에 넣는다. 구매와 소비가 한 메시지에 함께 나타나면 한 번의 호출에 add 와 consume 을 함께 담아라(예: "김치찌개 만들고 두부 샀어"). 이 도구는 한 답변에서 한 번만 부른다. 요리를 추천하거나 만들 계획만 말한 경우에는 consume 하지 마라. 재료의 추가·소비와 무관한 대화에서는 호출하지 않는다.',
  parameters: {
    type: 'object',
    properties: {
      add: {
        type: 'array',
        // 여기엔 **이름표만** 둔다 — "언제 add 에 넣는지"는 위 tool description 이 소유한다.
        // 양쪽에 나눠 적으면 고칠 때 한쪽만 바뀌어 모델이 상충하는 지시를 받는다.
        description: '냉장고에 넣을 재료 목록',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description:
                '재료명. 재고 목록에 이미 같은 재료가 있으면 목록의 이름을 그대로 사용(예: "달걀"과 "계란"은 같은 품목.). 목록에 없는 새 재료면 짧은 일반명으로 ("계란", "대파")',
            },
            category: {
              type: 'string',
              enum: CATEGORY_VALUES,
              description:
                '재료 분류. 소비기한 추정에 쓰이니 반드시 채워라. 어느 것에도 속하지 않을 경우 ETC',
            },
            quantityNote: {
              type: 'string',
              // ⚠️ **단위가 다를 때의 탈출구를 빼지 말 것.** 합계만 요구하면 모델이 못 합치는 경우
              // (기존 "6개" + "한 판")에 아무 숫자나 지어낸다 — 실측에서 "10개" 가 나왔다.
              // 이 값은 표시 전용 자유텍스트라 "6개 + 한 판" 이 유효하고, 틀린 숫자보다 훨씬 낫다
              // (사용자가 확인 카드에서 고칠 수 있고, 서버는 자유텍스트라 검증할 방법이 없다).
              description:
                '등록 후 냉장고에 있는 총량. 사용자가 말한 표현을 그대로 쓴다 ("한 판", "1L", "두 봉지"). 현재 재고 목록에 없는 재료라면 이번에 추가한 수량이 곧 총량이다. 이미 있는 재료를 더 산 경우에는 재고 목록의 기존 수량과 이번에 산 수량을 합산해 적는다 (예: 기존 "5개" + "2개" → "7개"). 단위가 달라 합칠 수 없으면 억지로 계산하지 말고 둘을 함께 적는다 (예: 기존 "6개" + "한 판" → "6개 + 한 판"). 사용자가 수량을 말하지 않았으면 추측하거나 지어내지 말고 생략한다 (예: "삼겹살 샀어" → 생략).',
            },
            storage: {
              type: 'string',
              enum: STORAGE_VALUES,
              // ⚠️ **생략을 권하는 게 방어책이다.** 서버는 값이 없을 때만 기존 재고의 보관 위치를
              // 유지하고(`previewAdd`/`add` 의 폴백), 값이 오면 그대로 덮어쓴다. 그래서 모델이
              // 친절하게 FRIDGE 를 채우면 냉동실 재료가 냉장으로 바뀌고 만료일까지 짧게 재추정된다.
              description:
                '보관 위치. 사용자가 냉동·실온에 둔다고 말했을 때만 채우고 기본은 생략(냉장). 이미 재고 목록에 있는 재료는 보관 위치를 옮긴다고 말하지 않는 한 반드시 생략한다 — 생략하면 기존 위치가 유지되고, 채우면 덮어쓴다.',
            },
            expiresAt: {
              type: 'string',
              // ⚠️ 프롬프트는 일부러 **날짜 대신 남은 일수**를 준다(모델이 오늘 날짜를 모르거나 틀리게
              // 안다). 그래서 상대적 표현을 ISO 로 변환시키면 틀린 날짜가 USER 로 확정 저장된다.
              description:
                '사용자가 유통기한·소비기한을 직접 말한 경우에만 ISO 날짜로. 모르면 반드시 생략해라(서버가 추정한다). 지어내지 마라. "내일", "다음 주" 같은 상대적 표현은 오늘 날짜를 알 수 없으므로 ISO 로 바꾸지 말고 생략한다.',
            },
          },
          required: ['name', 'category'],
          additionalProperties: false,
        },
      },
      consume: {
        type: 'array',
        description: '냉장고에서 줄어든 재료 목록',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '재고 목록에 있는 재료명 그대로' },
            // 필수로 두는 이유: 스캔 프롬프트에서 배운 대로 **조건부 필드는 작은 모델에서 자주 빈다.**
            // 그리고 제거가 이 값으로**만** 일어나므로, 모델이 값을 빠뜨리면 재고가 유지되는 쪽으로
            // 실패한다(`resolveConsume` 이 `=== true` 일 때만 다 씀으로 본다).
            finished: {
              type: 'boolean',
              description:
                '이 재료를 다 써서 냉장고에서 빼야 하면 true, 아직 남아 있으면 false. 다 썼는지 확실하지 않으면 false 로 둔다.',
            },
            remaining: {
              type: 'string',
              description:
                '쓰고 남은 양 ("2개", "반 팩"). finished 가 false 이고 남은 양을 알 때만 적는다. 재고 목록의 현재 수량을 근거로 판단하고, 얼마나 남았는지 알 수 없으면 추측하지 말고 생략한다 (예: 현재 "반 통"인 김치를 "좀 썼어" → 얼마인지 모르므로 생략).',
            },
          },
          required: ['name', 'finished'],
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
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
    private readonly recipes: RecipeService,
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
    const { messageCount } = await this.exchangeWithTools(
      userId,
      convo.id,
      prompt,
      content,
      inventory,
    );
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
      inventory,
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
    req: ApplyProposalRequestType,
  ): Promise<ResolveProposalResultType> {
    const call = await this.loadPendingCall(userId, conversationId, messageId);
    const proposal = (call.resolved as InventoryProposalType | undefined) ?? {};

    // 소비: 사용자가 편집한 값 중 제안에 실제로 있던 id 만 반영(임의 id 주입 차단).
    const allowed = new Set((proposal.consume ?? []).map((it) => it.ingredientId));
    const toConsume = req.consume.filter((it) => allowed.has(it.ingredientId));
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

    // 추가: **클라가 보낸 최종 목록**을 반영한다(사용자가 카드에서 고치거나 뺀 결과).
    // 제안과 대조해 거르지 않는 이유는 이름·수량을 고치는 게 목적이라 대조할 키가 없어서다.
    // 권한 상승도 아니다 — 어차피 POST /inventory 로 아무 재료나 넣을 수 있고, 길이·개수 방어는
    // DTO 와 inventory.add(clip/LIMITS)가 한다. 병합·만료일 폴백도 add 가 처리한다.
    const added = await this.inventory.add(userId, req.add);

    // 결과는 **실제로 반영한 것**을 담는다 — 클라가 보낸 값이 아니라 서버가 쓴 값이다.
    // (이름이 비어 잘리거나 개수 상한에 걸린 항목은 여기 안 들어온다)
    return this.appendOutput(conversationId, call, {
      applied: true,
      consumed,
      updated: updatedQty,
      added: added.map((a) => a.name),
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
   * 한 번의 교환 — 사용자 메시지를 저장하고, 히스토리를 재생해 모델을 부르고, 결과를 아이템으로 쌓는다.
   *
   * 툴 **둘 다 종결 툴**이라 `executors` 가 비어 있다 — 모델이 부르면 `chatWithTools` 가 호출을
   * 그대로 올려주고(`res.terminalCalls`), 실행 주체는 여기서 갈린다:
   *  - `update_inventory` → **사람이 실행기**. 확인 카드로 올리고 실제 반영은 apply 때(`buildCallPayloads`)
   *  - `search_recipes`   → **서버가 즉시 실행**. 여기서 검색하고 결과까지 함께 저장(`runRecipeSearches`)
   *
   * **아이템 순서를 여기서 정한다.** 텍스트 → 레시피(호출+결과) → 재고 확인 카드 순으로 쌓고,
   * 저장할 때 `createdAt` 을 1ms 씩 밀어 넣는다. `@default(now())` 는 **트랜잭션 시각**이라
   * 한 배치의 행이 전부 같은 값을 받는데, 그러면 정렬이 비결정적이 돼서 말풍선이 카드 아래로 가거나
   * `function_call_output` 이 짝보다 앞서 재생돼 벤더가 400 을 낸다.
   */
  private async exchangeWithTools(
    userId: string,
    conversationId: string,
    prompt: BuiltPromptType,
    content: string,
    /**
     * 이 턴의 재고 스냅샷 — 프롬프트에 주입한 바로 그 목록이다(`getPromptContext` 가 읽은 것).
     * 확인 카드 조립(`buildCallPayloads`)이 이걸 재사용해 같은 테이블을 다시 읽지 않는다.
     * 모델이 본 것과 같은 목록에 매칭한다는 뜻이기도 하다.
     */
    inventory: RecalledIngredient[],
  ): Promise<{ created: MessageType[]; messageCount: number }> {
    // createdAt 을 돌려받아 이번 턴 아이템들의 시각 기준으로 삼는다 — 앱 시계가 DB 시계보다
    // 뒤처져 있어도 답변이 질문보다 앞서지 않게 (아래 배치는 명시 createdAt 을 쓴다).
    const userMsg = await this.prisma.message.create({
      data: { conversationId, type: 'TEXT', role: 'user', content },
      select: { createdAt: true },
    });

    // 히스토리를 아이템 그대로 읽어 재생한다 (지난 툴 호출·결과 포함).
    const history = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: MESSAGE_SELECT,
    });
    const items = toLlmItems(history);

    // 종결 툴뿐이라 실행기가 없다. (툴 루프를 걷어낼 때 이 인자 자체가 사라진다)
    const executors: Record<string, LlmToolExecutor> = {};

    // 지침 순서는 buildPrompt 가 통제한다 (금지 재료가 반드시 맨 끝에 오도록).
    // 정적 부분(페르소나·규칙)은 instructions 로, 매 턴 바뀌는 상태는 **마지막 사용자 메시지 꼬리**로.
    // DB 에는 사용자가 친 원문만 남아 있고(위 create), 상태는 여기서 보낼 때만 덧씌워진다.
    const res = await this.llm.chatWithTools(
      prompt.system,
      attachContext(items, prompt.context),
      [UPDATE_INVENTORY_TOOL, SEARCH_RECIPES_TOOL],
      executors,
      this.model,
    );

    // 모델은 **텍스트와 툴 호출을 같이 낼 수 있다** → 각각 별개 아이템으로 쌓는다.
    // 예전처럼 "반영했어요" 같은 문장을 지어내지 않는다 (그 역할은 FUNCTION_CALL_OUTPUT 이 한다).
    const create: Prisma.MessageCreateWithoutConversationInput[] = [];
    if (res.text.trim().length > 0) {
      create.push({ type: 'TEXT', role: 'assistant', content: res.text });
    }
    // 레시피는 서버가 지금 실행한다 — 호출과 결과가 **항상 짝으로** 저장된다.
    // (짝 없이 남으면 toLlmItems 가 "사용자 확인 대기"로 오해해 재생하므로 반드시 함께 쓴다)
    create.push(...(await this.runRecipeSearches(res.terminalCalls)));
    // 재고는 사람이 확인해야 하므로 호출만 저장하고 결과는 apply/dismiss 때 붙는다.
    for (const call of this.buildCallPayloads(userId, res.terminalCalls, inventory)) {
      create.push({
        type: 'FUNCTION_CALL',
        payload: call as unknown as Prisma.InputJsonValue,
      });
    }
    if (create.length === 0) return { created: [], messageCount: countText(history) };

    // 배열 순서를 시각으로 고정한다 (위 주석 참고 — 기본값은 배치 전체가 같은 값을 받는다).
    const base = Math.max(userMsg.createdAt.getTime(), Date.now());
    create.forEach((m, i) => {
      m.createdAt = new Date(base + 1 + i);
    });

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        updatedAt: new Date(),
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
   * `search_recipes` 호출들을 **지금 실행하고** 저장할 아이템(호출 + 결과)을 만든다.
   *
   * 재고 툴과 달리 사람의 확인이 필요 없어서 서버가 바로 검색한다. 호출과 결과를 **같은 배치에
   * 함께** 돌려주는 게 중요하다 — 짝이 없으면 `toLlmItems` 가 "사용자 확인 대기 중"으로 채워
   * 재생하는데, 서버가 실행하는 툴엔 틀린 상태다.
   *
   * ⚠️ **검색 실패를 예외로 흘리지 않는다.** `RecipeService` 는 벤더 층이라 던지는 게 맞지만,
   * 여기서 잡아 `reason` 이 붙은 결과로 바꾼다. 그래야 (i) 검색이 실패해도 대화 자체는 계속되고,
   * (ii) 다음 턴에 모델이 "결과가 없었다"와 "검색이 실패했다"를 구분해 말할 수 있다.
   */
  private async runRecipeSearches(
    calls: TerminalToolCall[] | undefined,
  ): Promise<Prisma.MessageCreateWithoutConversationInput[]> {
    const picked = pickRecipeCalls(calls);
    const items: Prisma.MessageCreateWithoutConversationInput[] = [];

    for (const { callId, dishName } of picked) {
      let output: Record<string, unknown>;
      try {
        const result = await this.recipes.search(dishName);
        output = {
          dishName: result.dishName,
          recipes: result.recipes,
          ...(result.recipes.length === 0 ? { reason: 'empty' } : {}),
        };
      } catch (err) {
        this.logger.error(`레시피 검색 실패 (dish=${dishName})`, err as Error);
        output = { dishName, recipes: [], reason: 'unavailable' };
      }

      items.push({
        type: 'FUNCTION_CALL',
        payload: { callId, name: 'search_recipes', arguments: { dishName } },
      });
      items.push({
        type: 'FUNCTION_CALL_OUTPUT',
        payload: { callId, name: 'search_recipes', output } as unknown as Prisma.InputJsonValue,
      });
    }
    return items;
  }

  /**
   * 종결 툴 호출 → 저장할 `FUNCTION_CALL` payload 목록 — 아무것도 쓰지 않는다.
   *
   * payload 는 **모델이 한 말(`arguments`) + 서버가 화면용으로 가공한 값(`resolved`)** 을 함께 담는다.
   * 원본 인자엔 `ingredientId` 가 없어서 확인 카드가 apply 를 할 수 없기 때문이다.
   * consume 은 resolveConsume(이름→행+현재수량), add 는 previewAdd(정규화+만료일 추정).
   */
  private buildCallPayloads(
    userId: string,
    calls: TerminalToolCall[] | undefined,
    inventory: RecalledIngredient[],
  ): FunctionCallPayloadType[] {
    const picked = pickInventoryCall(calls);
    if (!picked) return [];
    // 버린 호출이 있으면 남긴다 — 모델이 "정당하게 나눠 부르는" 경우가 실제로 나오는지
    // 이 로그로만 알 수 있다(그런 호출이 잦으면 합치는 쪽으로 다시 판단한다).
    if (picked.ignored > 0) {
      this.logger.warn(
        `update_inventory 가 ${picked.ignored + 1}번 호출돼 첫 호출만 반영 (user=${userId}, 무시=${picked.ignored})`,
      );
    }

    // 재고는 이 턴 시작에 이미 한 번 읽어서(프롬프트 주입용) 여기까지 흘러온 것을 그대로 쓴다.
    // previewAdd·resolveConsume 둘 다 DB 를 모르는 순수 함수라 호출자가 목록을 넘긴다.
    const add: AddProposalItemType[] =
      picked.addItems.length > 0 ? this.inventory.previewAdd(picked.addItems, inventory) : [];
    const consume: ConsumeProposalItemType[] =
      picked.consumeItems.length > 0
        ? this.inventory.resolveConsume(picked.consumeItems, inventory).matched
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
 * 종결 툴 호출들 중 `search_recipes` 를 골라 요리명을 뽑는다.
 *
 * 재고 툴(`pickInventoryCall`)과 달리 **여러 개를 허용**한다 — "김치찌개랑 된장찌개 레시피 보여줘"
 * 처럼 서로 다른 요리는 각각 별개 카드 묶음이 되므로 합칠 이유도, 충돌할 이유도 없다.
 * 대신 같은 요리를 두 번 부르면 하나로 줄이고(같은 검색을 두 번 할 이유가 없다),
 * 호출 수를 상한으로 막는다 — 한 건이 네이버 호출 1회라 모델이 폭주하면 쿼터가 샌다.
 */
export function pickRecipeCalls(
  calls: TerminalToolCall[] | undefined,
): Array<{ callId: string; dishName: string }> {
  if (!calls?.length) return [];
  const picked: Array<{ callId: string; dishName: string }> = [];
  const seen = new Set<string>();

  for (const c of calls) {
    if (c.name !== 'search_recipes') continue;
    // 인자는 모델이 만든 JSON 이라 모양을 믿지 않는다.
    const raw = c.arguments.dishName;
    const dishName = typeof raw === 'string' ? raw.trim() : '';
    if (!dishName) continue;
    const key = dishName.replace(/\s+/g, ' ').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push({ callId: c.callId, dishName });
    if (picked.length >= MAX_RECIPE_SEARCHES_PER_TURN) break;
  }
  return picked;
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
