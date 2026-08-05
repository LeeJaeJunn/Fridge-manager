import type {
  AddIngredientInputType,
  AddProposalItemType,
  IngredientCategoryType,
  ScanKindType,
  StorageAreaType,
} from '@companion/types';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../llm/llm.service';
import { InventoryService } from './inventory.service';
import { RECEIPT_INSTRUCTION, RECEIPT_SCHEMA_NAME, ScanSchema } from './scan.prompt';

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
    config: ConfigService,
  ) {
    this.model = config.get<string>('SCAN_MODEL') || config.getOrThrow<string>('LLM_MODEL');
  }

  /**
   * 이미지(+선택적 OCR 텍스트) → 넣기 제안 목록.
   *
   * `detail: 'high'` 는 영수증 때문이다 — 작은 글자를 읽어야 해서 해상도를 낮추면 인식이 급락한다.
   * 냉장고 사진은 사물만 알아보면 되므로 나중에 `'auto'` 로 낮춰 토큰을 아낀다.
   *
   * OCR 텍스트는 M4(Clova)에서 채워진다. 지금은 빈 문자열이고, 프롬프트가 "없으면 이미지만으로
   * 판단하라"고 이미 안내하고 있어 배선만 이어주면 된다.
   */
  async scan(kind: ScanKindType, image: ScanImage, ocrText = ''): Promise<AddProposalItemType[]> {
    const dataUrl = `data:${image.mimeType};base64,${image.buffer.toString('base64')}`;

    const { parsed, usage } = await this.llm.structured({
      instructions: RECEIPT_INSTRUCTION,
      input: ocrText,
      images: [{ dataUrl, detail: 'high' }],
      schema: ScanSchema,
      schemaName: RECEIPT_SCHEMA_NAME,
      model: this.model,
    });

    // 스키마가 required+nullable 이라(Structured Outputs 제약) null 을 여기서 undefined 로 되돌린다.
    // category/storage 는 zod enum 이 `CATEGORY_VALUES`/`STORAGE_VALUES` 로 이미 제약했지만,
    // 그 vocab 을 문자열 유니온으로 좁히지 않는 레포 방침 때문에 타입이 `string` 이라 경계에서 단언한다.
    const items: AddIngredientInputType[] = parsed.items.map((it) => ({
      name: it.name,
      category: it.category as IngredientCategoryType,
      ...(it.quantityNote ? { quantityNote: it.quantityNote } : {}),
      ...(it.storage ? { storage: it.storage as StorageAreaType } : {}),
      ...(it.expiresAt ? { expiresAt: it.expiresAt } : {}),
    }));

    this.logger.log(
      `스캔(${kind}) 추출 ${items.length}건 (model=${this.model}, tokens=${usage?.totalTokens ?? '?'})`,
    );

    // 기본값·만료일 추정·이름 중복 제거는 previewAdd 가 흡수한다 (채팅 제안과 같은 경로).
    return this.inventory.previewAdd(items);
  }
}
