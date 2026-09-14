import type {
  AddIngredientInputType,
  AddProposalItemType,
  ConsumeProposalItemType,
  DishIngredientType,
  ExpirySourceType,
  IngredientCategoryType,
  IngredientType,
  StorageAreaType,
  UpdateIngredientRequestType,
} from '@companion/types';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LIMITS } from './shelf-life';

/**
 * 채팅 툴이 넘기는 소비 항목.
 *
 * **두 값이 나뉘어 있는 게 요점이다:**
 *  - `finished` — 다 써서 냉장고에서 뺄지. **명시적으로 true 일 때만** 제거한다.
 *  - `remaining` — 쓴 양이 아니라 **남은 양**. 없으면 "얼마인지 모름"이라 수량을 건드리지 않는다.
 *
 * 예전엔 `remaining` 하나가 둘을 겸해서(없으면 = 다 씀), 수량 메모가 없는 재고를 일부만 쓴 경우
 * 모델이 남은 양을 적을 방법이 없어 **재료가 통째로 제거**됐다("고추장 좀 썼어" → 고추장 사라짐).
 * 이제 위험한 쪽(제거)이 명시적 신호를 요구하므로, 모델이 애매하면 재고가 유지되는 쪽으로 실패한다.
 */
export type ConsumeItem = { name: string; finished?: boolean; remaining?: string };

/**
 * 프롬프트 주입용 경량 재고 — 채팅이 "지금 냉장고에 뭐가 있는지" 를 알기 위한 최소 형태.
 *
 * `id` 는 프롬프트에 안 들어가지만 함께 담는다. 같은 턴에서 이 목록이 **확인 카드 조립에도
 * 재사용**되는데(`resolveConsume` 이 이름→행을 찾을 때), id 가 없으면 같은 테이블을 한 번 더
 * 읽어야 한다. 모델에게 보여줄 것과 서버가 쓸 것을 한 번의 조회로 끝내려는 것이다.
 */
export type RecalledIngredient = {
  id: string;
  name: string;
  category: IngredientCategoryType;
  storage: StorageAreaType;
  quantityNote: string | null;
  /** null = 미설정. 서버가 추정해 채우지 않으므로 대부분의 재료가 null 이다. */
  expiresAt: Date | null;
  expirySource: string;
};

type IngredientRow = {
  id: string;
  name: string;
  category: IngredientCategoryType;
  quantityNote: string | null;
  storage: StorageAreaType;
  addedAt: Date;
  expiresAt: Date | null;
  expirySource: string;
  consumedAt: Date | null;
};

/** DB 값(문자열) → 계약 타입. 모르는 값은 미설정으로 떨어뜨린다. */
const toSource = (v: string): ExpirySourceType =>
  v === 'USER' ? 'USER' : v === 'ESTIMATED' ? 'ESTIMATED' : 'NONE';

/**
 * 날짜와 **함께 올 때만** 쓰는 출처 — 클라가 "기본값"이라고 밝혔을 때만 `ESTIMATED`, 나머지는 `USER`.
 * (`NONE` 은 날짜가 없다는 뜻이라 여기서 나올 수 없다 — 그 경우 호출자가 아예 안 쓴다.)
 */
const sourceOf = (v: ExpirySourceType | undefined): ExpirySourceType =>
  v === 'ESTIMATED' ? 'ESTIMATED' : 'USER';

/**
 * 요청에 실려온 만료일 파싱 — 값이 없거나 날짜로 안 읽히면 null(미설정).
 * 예전엔 여기서 추정치로 폴백했지만, 이제 **비어 있는 게 정상**이다.
 */
const parseExpiry = (raw: string | null | undefined): Date | null => {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
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
  expiresAt: i.expiresAt?.toISOString() ?? null,
  expirySource: toSource(i.expirySource),
  consumedAt: i.consumedAt?.toISOString(),
});

/**
 * 재료명 정규화 — 중복 판정 키. memory.service 의 normalize 와 같은 규칙.
 * 스캔 제안이 "이미 있는 재료"를 **저장 시 병합과 같은 기준**으로 판정해야 해서 export 한다
 * (표시와 실제 동작이 어긋나지 않으려면 같은 함수를 써야 한다).
 */
export const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

const clip = (s: string, max: number) => s.trim().slice(0, max);

/** 스키마 기본값 — 모델이 "그냥 채운" 값인지 판단하는 기준이라 상수로 둔다. */
const DEFAULT_STORAGE: StorageAreaType = 'FRIDGE';

/**
 * 제안에 쓸 보관 위치를 고른다 — **모델이 보낸 `FRIDGE` 는 의도가 아니라 기본값 채우기로 본다.**
 *
 * 툴 설명이 "이미 재고 목록에 있는 재료는 생략하라"고 못박아도 실측에서 모델은 매번 `FRIDGE` 를
 * 채워 보냈다. 그대로 쓰면 **냉동실 재료가 냉장으로 뒤집힌다** — 화면에 틀린 보관 위치가 뜨고,
 * 나중에 그 재료로 "기본값" 유통기한을 고르면 엉뚱한 표(냉동 180일 → 냉장 3일)로 계산된다.
 * 반면 `FREEZER`/`PANTRY` 는 기본값이 아니라 사용자가 말했을 때만
 * 나오므로 그대로 존중한다("사서 냉동실에 넣었어").
 *
 * ⚠️ **제안 단계에서만 보정한다.** 사용자가 정말 냉장으로 옮기려면 확인 카드에서 직접 고르면 되고,
 * 그렇게 확인된 값은 `add()` 가 그대로 저장한다(사용자 의도 > 모델 추측).
 */
function pickStorage(
  fromModel: StorageAreaType | undefined,
  fromExisting: StorageAreaType | undefined,
): StorageAreaType {
  if (fromModel && fromModel !== DEFAULT_STORAGE) return fromModel;
  return fromExisting ?? fromModel ?? DEFAULT_STORAGE;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 재고 추가 (여러 건). 채팅 툴과 수동 UI 가 같은 경로를 탄다.
   *
   * ⚠️ **만료일을 추정해 채우지 않는다.** 안 주면 미설정(null)이 그대로 저장된다.
   * 대신 같은 이름의 미소비 재고와 **병합**한다 — "계란" 이 두 줄로 쌓이는 걸 막는다.
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
      const prev = byName.get(normalize(item.name));
      // ⚠️ 폴백이 **기존 재고 → 기본값** 순인 게 중요하다. 재입고에선 호출자가 분류·보관을 자주
      // 생략한다(채팅 툴 설명이 "냉동/실온이라고 말했을 때만 채우라"고 시킨다). 그때 곧장 기본값을
      // 쓰면 **말한 적 없는 값이 기존 재고를 덮어써서** 냉동실 삼겹살이 냉장으로 둔갑한다.
      // "새로 넣은 값으로 갱신"은 실제로 값이 왔을 때 얘기지, 생략을 기본값으로 읽으라는 뜻이 아니다.
      const category = item.category ?? prev?.category ?? 'ETC';
      const storage = item.storage ?? prev?.storage ?? 'FRIDGE';
      const addedAt = new Date();
      const quantityNote = item.quantityNote
        ? clip(item.quantityNote, LIMITS.quantityNoteMax)
        : null;

      // 만료일: 값이 왔을 때만 쓰고, **안 왔으면 아예 건드리지 않는다**(빈 객체를 편다).
      // 신규면 컬럼 기본값(null · NONE)이 그대로 들어가고, 병합이면 기존 값이 유지된다.
      // ⚠️ 여기서 null 로 덮어쓰면, 채팅 툴이 날짜를 거의 안 실어 보내므로 **"계란 더 샀어"
      //    한 마디에 애써 넣어둔 유통기한이 날아간다.** 조용한 데이터 손실이라 눈에 안 띈다.
      const given = parseExpiry(item.expiresAt);
      const expiry = given ? { expiresAt: given, expirySource: sourceOf(item.expirySource) } : {};

      if (prev) {
        // 재입고 = 방금 산 게 주가 된다. 분류·보관·수량 메모·만료일 모두 **이번에 값이 왔을 때만**
        // 갱신하고, 안 왔으면 기존 값을 유지한다 — 분류·보관은 `?? prev` 폴백으로, 만료일은
        // 아예 안 실어서(위 `expiry` 참고). 방식은 달라도 규칙은 하나다.
        const row = await this.prisma.ingredient.update({
          where: { id: prev.id },
          data: {
            category,
            storage,
            quantityNote: quantityNote ?? prev.quantityNote,
            addedAt,
            ...expiry,
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
          ...expiry,
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
      select: {
        id: true,
        name: true,
        category: true,
        storage: true,
        quantityNote: true,
        expiresAt: true,
        expirySource: true,
      },
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
   *
   * 만료일은 **세 갈래**다 — 생략(미변경) / 날짜(그 날로) / **`null`(미설정으로 되돌리기)**.
   * 미설정이 정상 상태가 되면서 "정해둔 날짜를 지운다"는 조작이 생겼고, 그건 생략과 달라야 한다.
   *
   * ⚠️ **서버는 만료일을 추정하지 않는다 — 여기도 예외가 아니다.** 예전엔 사용자가 "기본값"에
   * 맡겨둔 재료의 분류·보관이 바뀌면 서버가 추정치를 다시 계산했는데(`reEstimate`), 그건 **앱이
   * 날짜를 안 보내던 시절의 보완 장치**였다. 지금은 폼이 분류·보관을 바꿀 때마다 추정일을 다시
   * 계산해 **화면에 보여주고 그 값을 그대로 보내므로**, 서버가 한 번 더 계산할 자리가 없다
   * (계산이 양쪽에 있으면 화면에 본 날짜와 저장된 날짜가 조용히 갈라질 수 있다).
   */
  async update(
    userId: string,
    id: string,
    patch: UpdateIngredientRequestType,
  ): Promise<IngredientType> {
    // 소유권 확인만 하면 된다 — 만료일을 서버가 계산하지 않으므로 기존 분류·보관·등록일이 필요 없다.
    const owned = await this.prisma.ingredient.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!owned) {
      throw new NotFoundException('재료를 찾을 수 없습니다.');
    }

    const clearExpiry = patch.expiresAt === null;
    const given = parseExpiry(patch.expiresAt);

    const expiryData: { expiresAt?: Date | null; expirySource?: ExpirySourceType } = clearExpiry
      ? { expiresAt: null, expirySource: 'NONE' }
      : given
        ? { expiresAt: given, expirySource: sourceOf(patch.expirySource) }
        : {}; // 생략 = 미변경

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
   * 소비 "제안" 생성 — 채팅 소비 툴의 **비-mutating** 버전 (확인 카드용).
   * 이름으로 재고 행을 찾아 현재 수량 + 제안된 남은 양을 돌려주고, 아무것도 쓰지 않는다.
   * 실제 반영은 사용자 확인 후 `applyConsume` 가 id 기준으로 한다.
   * 같은 행에 중복 제안이 오면(모델이 같은 재료를 두 번) 하나로 합친다.
   *
   * `previewAdd` 와 마찬가지로 **DB 를 직접 안 보고 호출자가 읽은 재고를 받는다.** 채팅 한 턴은
   * 이미 프롬프트 주입용으로 재고를 읽어놨으므로(`recall`), 그걸 그대로 넘기면 같은 테이블을
   * 다시 읽지 않는다. 덤으로 **모델이 프롬프트에서 본 것과 정확히 같은 목록**에 매칭돼,
   * 카드와 모델의 판단이 어긋날 여지가 없다.
   */
  /**
   * 요리 제안의 재료 → 재고 매칭 (`propose_dish` 카드용). 아무것도 쓰지 않는다.
   *
   * ⚠️ **"냉장고에 있나"를 모델에게 묻지 않는 게 요점이다.** 서버가 재고 목록을 정확히 알고
   * `resolveConsume` 과 **같은 정규화 규칙**을 쓰므로, 카드의 판정과 냉장고 화면이 어긋날 수 없다.
   * 모델에게 물으면 두 판단이 갈리고, 그 어긋남은 사용자가 알아채기 어렵다.
   *
   * 매칭되면 **재고 쪽 이름으로 바꿔** 담는다 — 모델이 "달걀", 냉장고가 "계란"이면 카드와
   * 냉장고가 다른 말을 하게 되고, 나중에 소비로 이어질 때 이름이 또 안 맞는다.
   *
   * `previewAdd`·`resolveConsume` 과 마찬가지로 **DB 를 직접 안 보고 호출자가 읽은 재고를 받는다**
   * (이 턴의 프롬프트에 주입한 바로 그 목록 = 모델이 본 것과 같은 목록).
   */
  resolveDishIngredients(
    items: { name?: string; amount?: string }[],
    existing: { id: string; name: string; quantityNote: string | null }[],
  ): DishIngredientType[] {
    const byName = new Map(existing.map((r) => [normalize(r.name), r]));

    const out: DishIngredientType[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      const name = item.name?.trim() ?? '';
      if (name.length === 0) continue;
      // 같은 재료가 두 줄로 오면 첫 줄만 남긴다 (resolveConsume 의 dedupe 와 같은 방향).
      const key = normalize(name);
      if (seen.has(key)) continue;
      seen.add(key);

      const hit = byName.get(key);
      out.push({
        name: hit?.name ?? clip(name, LIMITS.nameMax),
        amount: clip(item.amount ?? '', LIMITS.quantityNoteMax),
        ingredientId: hit?.id ?? null,
        currentQuantityNote: hit?.quantityNote ?? null,
      });
    }
    return out;
  }

  resolveConsume(
    items: ConsumeItem[],
    existing: { id: string; name: string; quantityNote: string | null }[],
  ): { matched: ConsumeProposalItemType[]; notFound: string[] } {
    const wanted = items
      .map((it) => ({
        name: it.name?.trim() ?? '',
        // ⚠️ **명시적으로 true 일 때만 "다 씀"** 이다. 값이 빠졌으면(모델이 안 채웠거나 옛 형식)
        // 제거가 아니라 유지 쪽으로 떨어뜨린다 — 잘못 지운 재고는 사용자가 알아채기 어렵다.
        finished: it.finished === true,
        remaining: it.remaining?.trim(),
      }))
      .filter((it) => it.name.length > 0);
    if (wanted.length === 0) return { matched: [], notFound: [] };

    const byName = new Map(existing.map((r) => [normalize(r.name), r]));

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
        finished: item.finished,
        // 다 썼다면 남은 양은 의미가 없다(카드도 입력칸을 잠근다).
        remaining:
          !item.finished && item.remaining ? clip(item.remaining, LIMITS.quantityNoteMax) : null,
      });
    }
    return { matched, notFound };
  }

  /**
   * 확인된 소비 제안을 실제로 반영 — id 기준 (사용자가 확인·편집한 최종 값).
   *
   * 세 갈래다:
   *  - `finished` → 소비 처리(soft delete)
   *  - `remaining` 값 있음 → `quantityNote` 갱신
   *  - 둘 다 아님 → **아무것도 하지 않는다** (썼지만 얼마 남았는지 모르는 경우)
   *
   * 전부 본인(userId) 것만, 멱등.
   */
  async applyConsume(
    userId: string,
    items: { ingredientId: string; finished: boolean; remaining: string | null }[],
  ): Promise<{ consumedIds: string[]; updatedIds: string[] }> {
    const usedUpIds: string[] = [];
    const updatedIds: string[] = [];

    for (const item of items) {
      if (item.finished) {
        usedUpIds.push(item.ingredientId);
      } else if (item.remaining !== null) {
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
   * 추가 "제안" 생성 — `add` 의 정규화(기본 분류·보관 + 병합 판정)를 **쓰지 않고** 미리 계산만 한다.
   * 확인 카드에 보여줄 값이며, 실제 저장(병합 포함)은 확인 후 `add` 가 그대로 다시 계산해 처리한다.
   * DB 를 직접 안 보는 순수 함수라 동기다 — 기존 재고가 필요하면 **호출자가 읽어서 넘긴다**.
   *
   * `existing` 을 넘기면 같은 이름의 재고를 찾아 **`merge.existing`(합산 근거)** 을 채운다.
   * 저장은 `quantityNote` 하나로 끝나지만, 카드가 "왜 그 숫자인지"(기존 2개 → 추가 후 4개)를
   * 설명하려면 이 값이 필요하다. 채팅 툴과 스캔이 같은 이유로 쓴다 — 채우는 규칙을 두 곳에
   * 흩지 않으려고 여기 둔다(스캔은 여기에 "이번에 산 양"만 덧붙인다).
   *
   * 같은 이름이 한 호출 안에 두 번 오면 **첫 번째만** 남긴다 — `resolveConsume` 의 dedupe 와 같은 방향이라
   * "같은 재료가 여러 번 오면 첫 번째가 이긴다" 한 규칙으로 제안 전체가 설명된다.
   * (중복이 `itemsMax` 정원을 잡아먹지 않게 자르기 **전에** 제거한다)
   */
  previewAdd(
    items: AddIngredientInputType[],
    existing?: {
      name: string;
      category?: IngredientCategoryType;
      storage?: StorageAreaType;
      quantityNote: string | null;
      expiresAt?: Date | null;
      expirySource?: string;
    }[],
  ): AddProposalItemType[] {
    const clean = items
      .map((it) => ({ ...it, name: clip(it.name ?? '', LIMITS.nameMax) }))
      .filter((it) => it.name.length > 0);

    const unique = new Map<string, (typeof clean)[number]>();
    for (const it of clean) {
      const key = normalize(it.name);
      if (!unique.has(key)) unique.set(key, it);
    }

    // 저장 시 병합 판정(`add`)과 **같은 정규화 키**를 써야 표시와 실제 동작이 어긋나지 않는다.
    const existingByName = new Map((existing ?? []).map((e) => [normalize(e.name), e]));

    return [...unique.values()].slice(0, LIMITS.itemsMax).map((item) => {
      const prev = existingByName.get(normalize(item.name));
      // ⚠️ 폴백이 **기존 재고 → 기본값** 순인 게 `add()` 와 같아야 한다. 여기서 기본값을 박으면
      // 그 값이 제안에 실려 나가고, 앱이 확인하며 **그대로 되돌려보내** `add()` 의 폴백이
      // 무력화된다(명시적으로 온 값이라 기존 재고를 못 본다). 실제로 모델이 category 를 생략했을 때
      // 냉장고의 `계란(EGG·3주)` 이 `ETC(7일)` 로 덮어써지는 걸 확인했다.
      const category = item.category ?? prev?.category ?? 'ETC';
      // 보관은 폴백이 아니라 `pickStorage` 로 고른다 — 모델이 보낸 기본값(FRIDGE)을 의도로 읽으면
      // 재입고 때 냉동 재료가 냉장으로 뒤집힌다(위 함수 주석 참고).
      const storage = pickStorage(item.storage, prev?.storage);
      const quantityNote = item.quantityNote
        ? clip(item.quantityNote, LIMITS.quantityNoteMax)
        : undefined;

      // 만료일은 **추정하지 않는다.** 온 값이 있으면 그 값, 없으면 기존 재고의 값을 이어받고,
      // 신규면 미설정으로 둔다 — `add()` 가 저장할 때 하는 계산과 정확히 같아야, 카드에 보인 값과
      // 실제 저장값이 어긋나지 않는다.
      const given = parseExpiry(item.expiresAt);
      const expiresAt = given ?? prev?.expiresAt ?? null;
      const expirySource = given ? sourceOf(item.expirySource) : toSource(prev?.expirySource ?? '');

      // 이미 있는 재료면 기존 수량을 함께 싣는다 — 카드가 "기존 2개 → 추가 후 4개"로 설명한다.
      // 수량 메모가 없던 재고는 보여줄 근거가 없으므로 merge 를 붙이지 않는다(빈 칸이 더 혼란스럽다).
      return {
        name: item.name,
        category,
        storage,
        ...(quantityNote ? { quantityNote } : {}),
        expiresAt: expiresAt?.toISOString() ?? null,
        expirySource,
        ...(prev?.quantityNote ? { merge: { existing: prev.quantityNote } } : {}),
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
