import type {
  AddIngredientInputType,
  AddProposalItemType,
  ConsumeProposalItemType,
  IngredientCategoryType,
  IngredientType,
  StorageAreaType,
  UpdateIngredientRequestType,
} from '@companion/types';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { estimateExpiry, LIMITS } from './shelf-life';

/**
 * 채팅 툴이 넘기는 소비 항목.
 * `remaining` 은 **쓴 양이 아니라 남은 양**이다 — 있으면 부분 소비(수량만 갱신),
 * 없으면 전부 소비(냉장고에서 제거). 산수는 재고를 프롬프트로 받은 모델이 하고 서버는 결과만 저장한다.
 */
export type ConsumeItem = { name: string; remaining?: string };

/** 프롬프트 주입용 경량 재고 — 채팅이 "지금 냉장고에 뭐가 있는지" 를 알기 위한 최소 형태. */
export type RecalledIngredient = {
  name: string;
  quantityNote: string | null;
  expiresAt: Date;
  expirySource: string;
};

type IngredientRow = {
  id: string;
  name: string;
  category: IngredientCategoryType;
  quantityNote: string | null;
  storage: StorageAreaType;
  addedAt: Date;
  expiresAt: Date;
  expirySource: string;
  consumedAt: Date | null;
};

const SELECT = {
  id: true,
  name: true,
  category: true,
  quantityNote: true,
  storage: true,
  addedAt: true,
  expiresAt: true,
  expirySource: true,
  consumedAt: true,
} as const;

const toDto = (i: IngredientRow): IngredientType => ({
  id: i.id,
  name: i.name,
  category: i.category,
  quantityNote: i.quantityNote ?? undefined,
  storage: i.storage,
  addedAt: i.addedAt.toISOString(),
  expiresAt: i.expiresAt.toISOString(),
  expirySource: i.expirySource === 'USER' ? 'USER' : 'ESTIMATED',
  consumedAt: i.consumedAt?.toISOString(),
});

/** 재료명 정규화 — 중복 판정 키. memory.service 의 normalize 와 같은 규칙. */
const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

const clip = (s: string, max: number) => s.trim().slice(0, max);

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 재고 추가 (여러 건). 채팅 툴과 수동 UI 가 같은 경로를 탄다.
   *
   * 두 가지를 여기서 흡수한다:
   *  1. `expiresAt` 폴백 — 유저가 표기일을 알려주지 않으면 카테고리×보관위치로 추정해 **항상** 채운다.
   *     (읽을 때 분기하면 임박 조회·정렬 경로가 전부 분기를 떠안는다)
   *  2. 같은 이름의 미소비 재고와 병합 — "계란" 이 두 줄로 쌓이는 걸 막는다.
   */
  async add(userId: string, items: AddIngredientInputType[]): Promise<IngredientType[]> {
    const clean = items
      .map((it) => ({ ...it, name: clip(it.name ?? '', LIMITS.nameMax) }))
      .filter((it) => it.name.length > 0)
      .slice(0, LIMITS.itemsMax);
    if (clean.length === 0) return [];

    // 기존 미소비 재고를 한 번에 읽어 정규화 이름으로 색인 (건당 쿼리 방지)
    const existing = await this.prisma.ingredient.findMany({
      where: { userId, consumedAt: null },
      select: SELECT,
    });
    const byName = new Map(existing.map((e) => [normalize(e.name), e]));

    const saved: IngredientType[] = [];
    for (const item of clean) {
      const category = item.category ?? 'ETC';
      const storage = item.storage ?? 'FRIDGE';
      const addedAt = new Date();
      const userExpiry = item.expiresAt ? new Date(item.expiresAt) : null;
      const hasUserExpiry = userExpiry !== null && !Number.isNaN(userExpiry.getTime());
      const expiresAt = hasUserExpiry ? userExpiry : estimateExpiry(category, storage, addedAt);
      const quantityNote = item.quantityNote
        ? clip(item.quantityNote, LIMITS.quantityNoteMax)
        : null;

      const prev = byName.get(normalize(item.name));
      if (prev) {
        // 재입고 = 방금 산 게 주가 된다. 만료일·보관·분류를 **새로 넣은 값으로 갱신**한다
        // (수량을 개별 추적하지 않으므로 옛 재고 기준으로 잡을 근거가 없다 — 새 물건 기준이 직관적).
        // 수량 메모는 이번에 안 적었으면 기존 표시를 유지한다.
        const row = await this.prisma.ingredient.update({
          where: { id: prev.id },
          data: {
            category,
            storage,
            quantityNote: quantityNote ?? prev.quantityNote,
            addedAt,
            expiresAt,
            expirySource: hasUserExpiry ? 'USER' : 'ESTIMATED',
          },
          select: SELECT,
        });
        saved.push(toDto(row));
        byName.set(normalize(row.name), row);
        continue;
      }

      const row = await this.prisma.ingredient.create({
        data: {
          userId,
          name: item.name,
          category,
          quantityNote,
          storage,
          addedAt,
          expiresAt,
          expirySource: hasUserExpiry ? 'USER' : 'ESTIMATED',
        },
        select: SELECT,
      });
      saved.push(toDto(row));
      byName.set(normalize(row.name), row);
    }

    this.logger.log(`재고 ${saved.length}건 추가 (user=${userId})`);
    return saved;
  }

  /** 냉장고 화면용 — 아직 안 먹은 재고 전부, 임박순. */
  async list(userId: string): Promise<IngredientType[]> {
    const rows = await this.prisma.ingredient.findMany({
      where: { userId, consumedAt: null },
      orderBy: [{ expiresAt: 'asc' }, { name: 'asc' }],
      select: SELECT,
    });
    return rows.map(toDto);
  }

  /**
   * 프롬프트 주입용 재고 (← 나중에 축약/요약 seam).
   * 지금은 전부 반환한다 — 재고는 수십 개 규모라 전량 주입이 더 싸고 정확하다
   * (MemoryService.recall 과 같은 판단). 커지면 이 메서드 내부만 임박순 top-N 으로 바꾼다.
   */
  recall(userId: string): Promise<RecalledIngredient[]> {
    return this.prisma.ingredient.findMany({
      where: { userId, consumedAt: null },
      orderBy: { expiresAt: 'asc' },
      select: { name: true, quantityNote: true, expiresAt: true, expirySource: true },
    });
  }

  /** 임박 재고 — 홈 "곧 상해요" 섹션. 이미 지난 것도 포함한다(더 급한 정보라서). */
  async expiringSoon(userId: string, days: number): Promise<IngredientType[]> {
    const until = new Date(Date.now() + days * 86_400_000);
    const rows = await this.prisma.ingredient.findMany({
      where: { userId, consumedAt: null, expiresAt: { lte: until } },
      orderBy: { expiresAt: 'asc' },
      select: SELECT,
    });
    return rows.map(toDto);
  }

  /**
   * 교정용 부분 수정 (본인 것만).
   * 만료일 갱신 규칙 (우선순위 순):
   *  1. 유저가 `expiresAt` 을 직접 주면 그 값 + `USER` 승격.
   *  2. 표기일이 없고 **분류·보관이 실제로 바뀌면** 재추정 — 냉장 두부를 냉동으로 옮기면 더 오래가야
   *     하는데, 유통기한 직접 편집이 없는 v1 에선 이게 유일한 조정 수단이다. (이미 USER 로 확정한 값은 건드리지 않는다)
   *  3. 그 외엔 만료일 유지.
   */
  async update(
    userId: string,
    id: string,
    patch: UpdateIngredientRequestType,
  ): Promise<IngredientType> {
    const owned = await this.prisma.ingredient.findFirst({
      where: { id, userId },
      select: { category: true, storage: true, addedAt: true, expirySource: true },
    });
    if (!owned) {
      throw new NotFoundException('재료를 찾을 수 없습니다.');
    }

    const userExpiry = patch.expiresAt ? new Date(patch.expiresAt) : null;
    const hasUserExpiry = userExpiry !== null && !Number.isNaN(userExpiry.getTime());

    const nextCategory = patch.category ?? owned.category;
    const nextStorage = patch.storage ?? owned.storage;
    const storageChanged = nextCategory !== owned.category || nextStorage !== owned.storage;
    // 유저가 확정한 값(USER)은 존중하고, 추정치일 때만 분류·보관 변경에 맞춰 다시 추정한다.
    const reEstimate = !hasUserExpiry && owned.expirySource !== 'USER' && storageChanged;

    const expiryData = hasUserExpiry
      ? { expiresAt: userExpiry, expirySource: 'USER' as const }
      : reEstimate
        ? { expiresAt: estimateExpiry(nextCategory, nextStorage, owned.addedAt) }
        : {};

    const row = await this.prisma.ingredient.update({
      where: { id },
      data: {
        name: patch.name ? clip(patch.name, LIMITS.nameMax) : undefined,
        category: patch.category,
        quantityNote: patch.quantityNote
          ? clip(patch.quantityNote, LIMITS.quantityNoteMax)
          : undefined,
        storage: patch.storage,
        ...expiryData,
      },
      select: SELECT,
    });
    return toDto(row);
  }

  /** 소비 처리 (soft delete, 멱등). 이미 소비한 건 건드리지 않는다. */
  async consume(userId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const res = await this.prisma.ingredient.updateMany({
      where: { id: { in: ids }, userId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return res.count;
  }

  /**
   * 이름으로 소비 처리 — 채팅 툴 경로. LLM 은 id 를 모르고 "대파, 계란" 처럼 이름만 안다.
   *
   * **얼마를 썼는지가 아니라 뭐가 남았는지**(`remaining`)를 받는다. 그래야 서버가 산수를 안 한다 —
   * "계란 5개 중 3개" 같은 계산은 재고가 프롬프트에 주입된 모델이 한 번 판단하고 결과만 넘긴다.
   *  - `remaining` 있음 → 아직 남았다. quantityNote 만 갱신하고 냉장고에 그대로 둔다.
   *  - `remaining` 없음 → 다 썼다. consumedAt 을 찍어 냉장고에서 뺀다.
   *
   * 다 쓴 재료의 quantityNote 는 **건드리지 않는다**. consumedAt 이 이미 "없음"을 뜻하는데
   * 수량에도 "0개"를 적으면 같은 사실이 두 군데에 생겨 어긋날 수 있고, 마지막 수량을 남겨두는 쪽이
   * 이력으로도 정확하다("2개 남은 상태에서 다 먹었다").
   *
   * 매칭 실패한 이름을 함께 돌려줘서, 모델이 "대파는 원래 없었어" 라고 솔직히 말할 수 있게 한다.
   */
  async consumeByNames(
    userId: string,
    items: ConsumeItem[],
  ): Promise<{ consumed: string[]; updated: string[]; notFound: string[] }> {
    const wanted = items
      .map((it) => ({ name: it.name?.trim() ?? '', remaining: it.remaining?.trim() }))
      .filter((it) => it.name.length > 0);
    if (wanted.length === 0) return { consumed: [], updated: [], notFound: [] };

    const rows = await this.prisma.ingredient.findMany({
      where: { userId, consumedAt: null },
      select: { id: true, name: true },
    });
    const byName = new Map(rows.map((r) => [normalize(r.name), r]));

    const usedUpIds: string[] = [];
    const consumed: string[] = [];
    const updated: string[] = [];
    const notFound: string[] = [];

    for (const item of wanted) {
      const hit = byName.get(normalize(item.name));
      if (!hit) {
        notFound.push(item.name);
        continue;
      }
      if (item.remaining) {
        // 일부만 씀 — 남은 양으로 갱신하고 재고에 유지
        await this.prisma.ingredient.update({
          where: { id: hit.id },
          data: { quantityNote: clip(item.remaining, LIMITS.quantityNoteMax) },
        });
        updated.push(hit.name);
      } else {
        usedUpIds.push(hit.id);
        consumed.push(hit.name);
      }
    }

    await this.consume(userId, usedUpIds);
    // 모델이 사용자가 말하지 않은 재료를 건드리는 일이 실제로 관측됐다(자동 차감의 고질적 위험).
    // 무엇이 왜 사라졌는지 사후에 추적할 수 있어야 해서 남긴다.
    this.logger.log(
      `재고 소비 (user=${userId}) 다씀=[${consumed.join(', ')}] 일부=[${updated.join(', ')}] 없음=[${notFound.join(', ')}]`,
    );
    return { consumed, updated, notFound };
  }

  /**
   * 소비 "제안" 생성 — 채팅 소비 툴의 **비-mutating** 버전 (확인 카드용).
   * `consumeByNames` 와 같은 이름 매칭을 쓰되 아무것도 쓰지 않고, 현재 수량 + 제안된 남은 양을 돌려준다.
   * 실제 반영은 사용자 확인 후 `applyConsume` 가 id 기준으로 한다.
   * 같은 행에 중복 제안이 오면(모델이 같은 재료를 두 번) 하나로 합친다.
   */
  async resolveConsume(
    userId: string,
    items: ConsumeItem[],
  ): Promise<{ matched: ConsumeProposalItemType[]; notFound: string[] }> {
    const wanted = items
      .map((it) => ({ name: it.name?.trim() ?? '', remaining: it.remaining?.trim() }))
      .filter((it) => it.name.length > 0);
    if (wanted.length === 0) return { matched: [], notFound: [] };

    const rows = await this.prisma.ingredient.findMany({
      where: { userId, consumedAt: null },
      select: { id: true, name: true, quantityNote: true },
    });
    const byName = new Map(rows.map((r) => [normalize(r.name), r]));

    const matched: ConsumeProposalItemType[] = [];
    const notFound: string[] = [];
    const seen = new Set<string>();

    for (const item of wanted) {
      const hit = byName.get(normalize(item.name));
      if (!hit) {
        notFound.push(item.name);
        continue;
      }
      if (seen.has(hit.id)) continue; // 같은 행 중복 제안 방지
      seen.add(hit.id);
      matched.push({
        ingredientId: hit.id,
        name: hit.name,
        currentQuantityNote: hit.quantityNote,
        remaining: item.remaining ? clip(item.remaining, LIMITS.quantityNoteMax) : null,
      });
    }
    return { matched, notFound };
  }

  /**
   * 확인된 소비 제안을 실제로 반영 — id 기준 (사용자가 확인·편집한 최종 값).
   * `remaining=null` → 소비(soft delete), 값 → `quantityNote` 갱신. 전부 본인(userId) 것만, 멱등.
   */
  async applyConsume(
    userId: string,
    items: { ingredientId: string; remaining: string | null }[],
  ): Promise<{ consumedIds: string[]; updatedIds: string[] }> {
    const usedUpIds: string[] = [];
    const updatedIds: string[] = [];

    for (const item of items) {
      if (item.remaining === null) {
        usedUpIds.push(item.ingredientId);
      } else {
        const res = await this.prisma.ingredient.updateMany({
          where: { id: item.ingredientId, userId, consumedAt: null },
          data: { quantityNote: clip(item.remaining, LIMITS.quantityNoteMax) },
        });
        if (res.count > 0) updatedIds.push(item.ingredientId);
      }
    }
    const consumedCount = await this.consume(userId, usedUpIds); // userId + consumedAt:null 로 격리
    this.logger.log(
      `재고 소비 확정 (user=${userId}) 다씀=${consumedCount} 부분갱신=${updatedIds.length}`,
    );
    return { consumedIds: usedUpIds, updatedIds };
  }

  /**
   * 추가 "제안" 생성 — `add` 의 정규화(기본 분류·보관 + 만료일 추정)를 **쓰지 않고** 미리 계산만 한다.
   * 확인 카드에 보여줄 값이며, 실제 저장(병합 포함)은 확인 후 `add` 가 그대로 다시 계산해 처리한다.
   * DB·병합을 안 타는 순수 함수라 동기다.
   *
   * 같은 이름이 한 호출 안에 두 번 오면 **첫 번째만** 남긴다 — `resolveConsume` 의 dedupe 와 같은 방향이라
   * "같은 재료가 여러 번 오면 첫 번째가 이긴다" 한 규칙으로 제안 전체가 설명된다.
   * (중복이 `itemsMax` 정원을 잡아먹지 않게 자르기 **전에** 제거한다)
   */
  previewAdd(items: AddIngredientInputType[]): AddProposalItemType[] {
    const now = new Date();
    const clean = items
      .map((it) => ({ ...it, name: clip(it.name ?? '', LIMITS.nameMax) }))
      .filter((it) => it.name.length > 0);

    const unique = new Map<string, (typeof clean)[number]>();
    for (const it of clean) {
      const key = normalize(it.name);
      if (!unique.has(key)) unique.set(key, it);
    }

    return [...unique.values()].slice(0, LIMITS.itemsMax).map((item) => {
      const category = item.category ?? 'ETC';
      const storage = item.storage ?? 'FRIDGE';
      const userExpiry = item.expiresAt ? new Date(item.expiresAt) : null;
      const hasUserExpiry = userExpiry !== null && !Number.isNaN(userExpiry.getTime());
      const expiresAt = hasUserExpiry ? userExpiry : estimateExpiry(category, storage, now);
      const quantityNote = item.quantityNote
        ? clip(item.quantityNote, LIMITS.quantityNoteMax)
        : undefined;
      return {
        name: item.name,
        category,
        storage,
        ...(quantityNote ? { quantityNote } : {}),
        estimatedExpiry: expiresAt.toISOString(),
        expirySource: hasUserExpiry ? 'USER' : 'ESTIMATED',
      };
    });
  }

  /** 소비 취소 (오차감 되돌리기). soft delete 라 UPDATE 한 번. 멱등. */
  async restore(userId: string, id: string): Promise<void> {
    await this.prisma.ingredient.updateMany({
      where: { id, userId },
      data: { consumedAt: null },
    });
  }

  /** 완전 삭제 — 잘못 등록한 재료를 이력에도 안 남기고 지운다. 본인 것만, 멱등. */
  async remove(userId: string, id: string): Promise<void> {
    await this.prisma.ingredient.deleteMany({ where: { id, userId } });
  }
}
