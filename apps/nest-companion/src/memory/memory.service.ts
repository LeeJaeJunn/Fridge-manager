import type {
  CreateMemoryRequestType,
  MemoryCategoryType,
  MemoryOptionsType,
  MemoryType,
  UpdateMemoryRequestType,
} from '@companion/types';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../llm/llm.service';
import { PrismaService } from '../prisma/prisma.service';
import { MEMORY_CATEGORIES, memoryOptions } from './memory.options';
import {
  buildExtractionInstruction,
  EXTRACTION_SCHEMA_NAME,
  ExtractionSchema,
} from './memory.prompt';

/** 프롬프트 주입용 경량 메모리 (recall seam 의 반환 형태) */
export type RecalledMemory = { category: MemoryCategoryType; content: string };

type MemoryRow = {
  id: string;
  category: MemoryCategoryType;
  content: string;
  createdAt: Date;
};

const toDto = (m: MemoryRow): MemoryType => ({
  id: m.id,
  category: m.category,
  content: m.content,
  createdAt: m.createdAt.toISOString(),
});

const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  /** 추출 시 LLM 에 넣는 최근 메시지 수 */
  private readonly window: number;
  /** 추출 모델 — 비우면 채팅 모델(LLM_MODEL) 재사용 */
  private readonly model: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    config: ConfigService,
  ) {
    this.window = Number(config.get<string>('MEMORY_EXTRACT_WINDOW') ?? 12);
    this.model =
      config.get<string>('MEMORY_EXTRACT_MODEL') || config.getOrThrow<string>('LLM_MODEL');
  }

  /**
   * 주입용 메모리 선택 (← 벡터 교체 seam). 지금은 오래된 순으로 전부 반환.
   *
   * 정렬이 사실상 의미가 없는 게 정상이다 — 호출자(`buildPrompt`)가 `splitMemories` 로
   * **카테고리별 섹션**을 만들고 각 섹션을 전부 렌더하므로, 여기서 무슨 순으로 주든
   * 섹션 안 줄 순서만 바뀐다. 수가 많아지면 이 메서드 **내부만** 카테고리별 top-N /
   * 유사도 top-k(pgvector `vector` 컬럼 추가)로 바꾼다.
   *
   * ⚠️ 그때도 `ALLERGY` 는 **자르지 말 것** — 안전 정보라 하나 빠지면 사람이 다친다.
   */
  recall(userId: string): Promise<RecalledMemory[]> {
    return this.prisma.memory.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { category: true, content: true },
    });
  }

  /** 표시용 — 내 메모리 전부 (관리 화면). 카테고리별로 묶어 오래된 순. */
  async list(userId: string): Promise<MemoryType[]> {
    const rows = await this.prisma.memory.findMany({
      where: { userId },
      orderBy: [{ category: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, category: true, content: true, createdAt: true },
    });
    return rows.map(toDto);
  }

  options(): MemoryOptionsType {
    return memoryOptions();
  }

  /** 직접 입력은 AI 가공 없이 공백만 정리해 저장한다. */
  async create(userId: string, req: CreateMemoryRequestType): Promise<MemoryType> {
    if (!MEMORY_CATEGORIES.includes(req.category)) {
      throw new BadRequestException('기억의 분류를 선택해 주세요.');
    }
    const content = this.cleanContent(req.content);
    await this.checkDuplicate(userId, content);
    const row = await this.prisma.memory.create({
      data: { userId, category: req.category, content },
      select: { id: true, category: true, content: true, createdAt: true },
    });
    return toDto(row);
  }

  async update(userId: string, id: string, patch: UpdateMemoryRequestType): Promise<MemoryType> {
    const existing = await this.prisma.memory.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('기억을 찾을 수 없어요.');
    if (typeof patch.category !== 'undefined' && !MEMORY_CATEGORIES.includes(patch.category)) {
      throw new BadRequestException('기억의 분류를 선택해 주세요.');
    }
    let content: string | undefined;
    if (typeof patch.content !== 'undefined') {
      content = this.cleanContent(patch.content);
      await this.checkDuplicate(userId, content, id);
    }
    const row = await this.prisma.memory.update({
      where: { id, userId },
      data: { category: patch.category, content },
      select: { id: true, category: true, content: true, createdAt: true },
    });
    return toDto(row);
  }

  private cleanContent(value: unknown): string {
    if (typeof value !== 'string') {
      throw new BadRequestException('기억할 내용을 입력해 주세요.');
    }
    const content = value.trim().replace(/\s+/g, ' ');
    if (!content) throw new BadRequestException('기억할 내용을 입력해 주세요.');
    return content;
  }

  private async checkDuplicate(userId: string, content: string, excludeId?: string): Promise<void> {
    const existing = await this.prisma.memory.findMany({
      where: { userId },
      select: { id: true, content: true },
    });
    const normalized = normalize(content);
    if (
      existing.some(
        (memory) =>
          (typeof excludeId === 'undefined' || memory.id !== excludeId) &&
          normalize(memory.content) === normalized,
      )
    ) {
      throw new ConflictException('이미 기억하고 있는 내용이에요.');
    }
  }

  /** 메모리 삭제 (본인 것만, 멱등). */
  async remove(userId: string, memoryId: string): Promise<void> {
    await this.prisma.memory.deleteMany({ where: { id: memoryId, userId } });
  }

  /**
   * 대화에서 장기 기억을 추출해 저장한다 (지금 수행 — '언제' 부를지는 호출자가 결정).
   * 백그라운드(fire-and-forget)로 불리므로 에러는 안에서 삼키고 로깅만 한다.
   */
  async extractMemory(userId: string, conversationId: string): Promise<void> {
    try {
      // 1. 최근 윈도우 **말풍선**(본인 대화만) — 오래된 사실은 이전 패스에서 처리됨
      //
      // ⚠️ **`TEXT` 만 읽는다** (`countText` 가 트리거를 셀 때와 같은 규칙). 아이템 구조로 바뀐 뒤
      // 같은 테이블에 `FUNCTION_CALL`·`FUNCTION_CALL_OUTPUT` 이 함께 쌓이는데, 그 행들은
      // `role`·`content` 가 **둘 다 null** 이라 필터가 없으면 두 가지가 동시에 망가진다:
      //  1. transcript 에 `컴패니언: null` 줄이 섞여 들어간다 (추출 LLM 이 읽는 입력이 오염된다)
      //  2. 한 턴이 2~3행이라 툴 행이 window 정원을 잡아먹어 **실제로 보는 말풍선 수가 줄어든다**
      // "몇 마디를 넣는가"라는 window 의 의미를 유지하려면 세는 대상이 말풍선이어야 한다.
      const recent = await this.prisma.message.findMany({
        where: { conversationId, conversation: { userId }, type: 'TEXT' },
        orderBy: { createdAt: 'desc' },
        take: this.window,
        select: { role: true, content: true },
      });
      if (recent.length < 2) return;
      const transcript = recent
        .reverse()
        .map((m) => `${m.role === 'user' ? '사용자' : '컴패니언'}: ${m.content}`)
        .join('\n');

      // 2. 기존 메모리 (의미 중복 판단용으로 프롬프트에 전달)
      const existing = await this.prisma.memory.findMany({
        where: { userId },
        select: { content: true },
      });
      const existingContents = existing.map((e) => e.content);

      // 3. LLM 추출 (구조화 출력)
      const { parsed } = await this.llm.structured(
        {
          instructions: buildExtractionInstruction(existingContents),
          input: transcript,
          schema: ExtractionSchema,
          schemaName: EXTRACTION_SCHEMA_NAME,
          model: this.model,
        },
        // ⚠️ **billable: false** — 유저가 시킨 적 없는 백그라운드 작업이다. 여기서 한도를 깎으면
        // `MEMORY_EXTRACT_EVERY_N` 을 6→3 으로 튜닝하는 순간 모든 유저의 한도가 조용히 줄어든다.
        // 원가에는 잡히되(행은 남는다) 쿼터에서만 빠진다.
        { userId, feature: 'memory_extract', conversationId, billable: false },
      );

      // 4. 코드측 안전망 중복 제거 (LLM 의 의미 중복 제거에 더한 정확일치 2중 방어)
      const known = new Set(existingContents.map(normalize));
      const fresh = parsed.memories
        .map((m) => ({ ...m, content: m.content.trim() }))
        .filter((m) => m.content && !known.has(normalize(m.content)))
        .map((m) => ({
          userId,
          category: m.category,
          content: m.content,
        }));
      if (fresh.length === 0) return;

      await this.prisma.memory.createMany({ data: fresh });
      this.logger.log(`메모리 ${fresh.length}건 저장 (user=${userId})`);
    } catch (err) {
      this.logger.error(`메모리 추출 실패 (user=${userId})`, err as Error);
    }
  }
}
