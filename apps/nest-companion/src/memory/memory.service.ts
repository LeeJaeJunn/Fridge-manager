import type { MemoryCategoryType, MemoryType } from '@companion/types';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../llm/llm.service';
import { PrismaService } from '../prisma/prisma.service';
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
  importance: number;
  createdAt: Date;
};

const toDto = (m: MemoryRow): MemoryType => ({
  id: m.id,
  category: m.category,
  content: m.content,
  importance: m.importance,
  createdAt: m.createdAt.toISOString(),
});

const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

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
   * 주입용 메모리 선택 (← 벡터 교체 seam). 지금은 importance 높은 순으로 전부 반환.
   * 수가 많아지면 이 메서드 내부만 top-N(importance) / 유사도 top-k 로 바꾸면 된다.
   */
  recall(userId: string): Promise<RecalledMemory[]> {
    return this.prisma.memory.findMany({
      where: { userId },
      orderBy: [{ importance: 'desc' }, { createdAt: 'asc' }],
      select: { category: true, content: true },
    });
  }

  /** 표시용 — 내 메모리 전부 (관리 화면). 카테고리·중요도 순. */
  async list(userId: string): Promise<MemoryType[]> {
    const rows = await this.prisma.memory.findMany({
      where: { userId },
      orderBy: [{ category: 'asc' }, { importance: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, category: true, content: true, importance: true, createdAt: true },
    });
    return rows.map(toDto);
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
      // 1. 최근 윈도우 메시지 (본인 대화만) — 오래된 사실은 이전 패스에서 처리됨
      const recent = await this.prisma.message.findMany({
        where: { conversationId, conversation: { userId } },
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
        buildExtractionInstruction(existingContents),
        transcript,
        ExtractionSchema,
        EXTRACTION_SCHEMA_NAME,
        this.model,
      );

      // 4. 코드측 안전망 중복 제거 + importance 클램프
      const known = new Set(existingContents.map(normalize));
      const fresh = parsed.memories
        .map((m) => ({ ...m, content: m.content.trim() }))
        .filter((m) => m.content && !known.has(normalize(m.content)))
        .map((m) => ({
          userId,
          category: m.category,
          content: m.content,
          importance: clamp(m.importance, 1, 3),
        }));
      if (fresh.length === 0) return;

      await this.prisma.memory.createMany({ data: fresh });
      this.logger.log(`메모리 ${fresh.length}건 저장 (user=${userId})`);
    } catch (err) {
      this.logger.error(`메모리 추출 실패 (user=${userId})`, err as Error);
    }
  }
}
