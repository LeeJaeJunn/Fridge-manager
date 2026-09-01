import type {
  AddIngredientInputType,
  AddProposalItemType,
  IngredientCategoryType,
  ScanKindType,
  StorageAreaType,
} from '@companion/types';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LlmService } from '../llm/llm.service';
// 모델이 "없음"을 문자열로 흘리는 걸 막는 경계 방어 — 소비 계산도 같은 걸 겪어서 공용으로 뺐다.
import { cleanLlmText as clean } from '../llm/sentinels';
import { OcrService } from '../ocr/ocr.service';
import { InventoryService, normalize } from './inventory.service';
import { buildScanInstruction, RECEIPT_SCHEMA_NAME, ScanSchema } from './scan.prompt';

/** 스캔에 넘길 이미지 — 컨트롤러가 업로드에서 뽑아 넘긴다. */
export type ScanImage = { buffer: Buffer; mimeType: string };

/**
 * 영수증·사진에서 재료를 뽑아 **확인용 제안**으로 바꾼다. 아무것도 저장하지 않는다.
 *
 * 저장은 사용자가 확인 화면에서 `POST /inventory` 로 한다 — 채팅 툴과 같은 방침이다
 * (오인식이 반드시 있는데, 잘못 들어간 재료는 사용자가 알아채기 어렵다).
 */
@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);
  /** 인식 모델 — 비우면 채팅 모델 재사용 (memory 추출과 같은 패턴) */
  private readonly model: string;

  constructor(
    private readonly llm: LlmService,
    private readonly inventory: InventoryService,
    private readonly ocr: OcrService,
    config: ConfigService,
  ) {
    this.model = config.get<string>('SCAN_MODEL') || config.getOrThrow<string>('LLM_MODEL');
    this.debugDir = config.get<string>('SCAN_DEBUG_DIR');
  }

  /**
   * 받은 이미지를 파일로 떨궈 **눈으로 확인**하기 위한 개발용 경로 (env `SCAN_DEBUG_DIR`).
   * 비어 있으면 아무것도 하지 않는다 — 프로덕션에서 사용자 사진이 디스크에 남지 않게 기본 꺼둔다.
   * 예: `SCAN_DEBUG_DIR=/tmp/companion-scan`
   */
  private readonly debugDir?: string;

  /** 개발용 — 실패해도 스캔 흐름을 막지 않는다(로깅만). */
  private async dumpForDebug(kind: ScanKindType, image: ScanImage): Promise<void> {
    if (!this.debugDir) return;
    try {
      await mkdir(this.debugDir, { recursive: true });
      const path = join(this.debugDir, `${kind}-${Date.now()}.jpg`);
      await writeFile(path, image.buffer);
      this.logger.debug(`스캔 이미지 저장: ${path}`);
    } catch (err) {
      this.logger.warn(`스캔 이미지 저장 실패: ${String(err)}`);
    }
  }

  /**
   * 이미지 단독으로 인식한다 (OCR 없음).
   * OCR 을 붙였을 때와 **비교하기 위해** 남겨둔 경로다 — 어느 쪽이 나은지는 실측으로 정한다.
   */
  scan(userId: string, kind: ScanKindType, image: ScanImage): Promise<AddProposalItemType[]> {
    return this.extract(userId, kind, image, '');
  }

  /**
   * OCR 텍스트 + 이미지를 **함께** 넘겨 인식한다.
   *
   * 둘이 잘하는 게 달라서다 — OCR 은 글자를 정확히 읽고, 이미지는 열 구분·줄 묶음 같은 표의 구조를
   * 안다(수량이 텍스트만으론 특히 약하다). 우선순위 규칙은 프롬프트가 못박고 있다.
   *
   * OCR 이 실패해도 빈 문자열이 와서 이미지 단독으로 진행된다(`OcrService` 가 예외를 던지지 않는다).
   */
  async scanWithOcr(
    userId: string,
    kind: ScanKindType,
    image: ScanImage,
  ): Promise<AddProposalItemType[]> {
    const ocrText = await this.ocr.readText(image);
    return this.extract(userId, kind, image, ocrText);
  }

  /**
   * 공통 추출 — 텍스트(있으면)와 이미지를 모델에 넘기고 제안 목록으로 바꾼다.
   *
   * **현재 재고를 함께 넣는다** — 이미 있는 재료면 모델이 합산한 총량을 내도록. 재고는 클라가 아니라
   * 서버가 읽는다(프롬프트에 들어가는 값이라 신뢰 경계, 그리고 저장 시 병합과 같은 소스여야 한다).
   *
   * `detail: 'high'` 는 영수증 때문이다 — 작은 글자라 해상도를 낮추면 인식이 급락한다.
   * 냉장고 사진은 사물만 알아보면 되므로 나중에 `'auto'` 로 낮춰 토큰을 아낀다.
   */
  private async extract(
    userId: string,
    kind: ScanKindType,
    image: ScanImage,
    ocrText: string,
  ): Promise<AddProposalItemType[]> {
    // 도착한 이미지가 멀쩡한지 한 줄로 확인 (base64 본문은 수 MB라 절대 로그에 찍지 않는다).
    this.logger.log(
      `스캔(${kind}) 수신 ${(image.buffer.length / 1024).toFixed(0)}KB ${image.mimeType}` +
        (ocrText ? ` + OCR ${ocrText.length}자` : ' (OCR 없음)'),
    );
    await this.dumpForDebug(kind, image);

    const dataUrl = `data:${image.mimeType};base64,${image.buffer.toString('base64')}`;

    // 합산 근거 — 저장 시 병합(`add`)과 **같은 소스·같은 이름 규칙**을 써야 표시와 동작이 안 어긋난다.
    const existing = await this.inventory.recall(userId);
    const existingByName = new Map(existing.map((e) => [normalize(e.name), e]));

    // 영수증은 작은 글자를 읽어야 해 해상도를 낮추면 인식이 급락한다. 사진은 사물·포장 라벨만
    // 알아보면 되므로 낮춰 토큰을 아낀다.
    const detail = kind === 'receipt' ? 'high' : 'auto';

    const { parsed, usage } = await this.llm.structured(
      {
        // 재고는 **입력이 아니라 instruction** 에 넣는다 — 사진에서 뽑을 대상이 아니라 합산 판단용
        // 배경 정보라서다. 입력에 섞으면 모델이 그걸 이번에 산 품목으로 착각한다.
        instructions: buildScanInstruction(kind, existing),
        input: ocrText,
        images: [{ dataUrl, detail }],
        schema: ScanSchema,
        schemaName: RECEIPT_SCHEMA_NAME,
        model: this.model,
      },
      // 유저가 사진을 올려 시킨 일이라 쿼터에 센다. 대화 밖이라 conversationId 는 없다.
      // 이미지 토큰이 붙어 건당 원가가 큰 경로라 기능을 따로 가르는 값어치가 크다.
      { userId, feature: 'scan', billable: true },
    );

    // category/storage 는 zod enum 이 `CATEGORY_VALUES`/`STORAGE_VALUES` 로 이미 제약했지만,
    // 그 vocab 을 문자열 유니온으로 좁히지 않는 레포 방침 때문에 타입이 `string` 이라 경계에서 단언한다.
    //
    // 저장될 값은 `total`(등록 후 총량)이다. 모델이 새 재료엔 purchased 와 같은 값을 넣게 돼 있어
    // 폴백은 사실상 안 타지만, 빠졌을 때 수량을 통째로 잃지 않도록 남겨둔다.
    const items: AddIngredientInputType[] = parsed.items.map((it) => {
      const total = clean(it.total) ?? clean(it.purchased);
      return {
        name: it.name,
        category: it.category as IngredientCategoryType,
        ...(total ? { quantityNote: total } : {}),
        ...(clean(it.storage) ? { storage: it.storage as StorageAreaType } : {}),
        ...(clean(it.expiresAt) ? { expiresAt: it.expiresAt as string } : {}),
      };
    });
    /** 이름(정규화) → 이번에 산 양. previewAdd 를 거친 뒤 화면 표시용으로 다시 붙인다. */
    const purchasedByName = new Map<string, string>();
    for (const it of parsed.items) {
      const purchased = clean(it.purchased);
      if (purchased) purchasedByName.set(normalize(it.name), purchased);
    }

    this.logger.log(
      `스캔(${kind}) 추출 ${items.length}건 (model=${this.model}, tokens=${usage?.totalTokens ?? '?'})`,
    );

    // 기본값·만료일 추정·이름 중복 제거·기존 수량(`merge.existing`)은 previewAdd 가 흡수한다
    // (채팅 제안과 같은 경로). 여기서 얹는 건 스캔에만 있는 값 — **이번에 산 양**이다.
    return this.inventory.previewAdd(items, existing).map((item) => {
      const key = normalize(item.name);
      const prev = existingByName.get(key);
      if (!prev) return item;

      const added = purchasedByName.get(key);
      // 이미 있는 재료인데 총량이 구매량과 같다 = 모델이 합산을 건너뛴 것. 값은 그대로 두고
      // **얼마나 자주 일어나는지만** 남긴다 — 잦으면 서버 합산으로 옮길 근거가 된다.
      if (added && item.quantityNote === added && prev.quantityNote) {
        this.logger.warn(`합산 누락 의심: ${item.name} (기존 ${prev.quantityNote} + ${added})`);
      }
      if (!added) return item;
      return { ...item, merge: { ...item.merge, added } };
    });
  }
}
