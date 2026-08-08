import type {
  IngredientType,
  InventoryOptionsType,
  ScanKindType,
  ScanResultType,
} from '@companion/types';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddIngredientsDto } from './dto/add-ingredients.dto';
import { ScanDto } from './dto/scan.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';
import { InventoryService } from './inventory.service';
import { ScanService } from './scan.service';
import { inventoryOptions } from './shelf-life';

/** 임박 판정 기본 창(일) — 홈 "곧 상해요" 섹션이 쓰는 값. */
const DEFAULT_SOON_DAYS = 3;

/** 업로드 상한 — 앱이 리사이즈해 보내지만 원본이 그대로 올라오는 경우를 서버가 막는다. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * 업로드된 파일 중 **우리가 실제로 쓰는 필드만**.
 *
 * multer 가 주는 값은 `Express.Multer.File` 인데, 그 타입은 `@types/multer` 가 `declare global` 로
 * 심는 전역 증강이라 **프로그램에 포함돼야만 보인다**. 코드가 그 패키지를 직접 참조하지 않으면
 * 자동 `@types` 수집에만 의존하게 되고, pnpm hoisted 모노레포에선 에디터 TS 서버가 이를 놓쳐
 * `tsc` 는 통과하는데 IDE 에만 빨간 줄이 뜨는 일이 생긴다. 쓰는 필드가 둘뿐이라 직접 선언한다.
 */
type UploadedImage = { buffer: Buffer; mimetype: string };

/**
 * 냉장고 재고 — 전부 현재 유저 기준.
 * 채팅 툴이 같은 서비스를 직접 쓰므로, 여기 컨트롤러는 **수동 교정 경로**(화면에서 직접 고치기)다.
 */
@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly scanner: ScanService,
  ) {}

  /** GET /inventory/options — 카테고리·보관위치 라벨 + 입력 제한 (서버 소유 단일 출처) */
  @Get('options')
  options(): InventoryOptionsType {
    return inventoryOptions();
  }

  /** GET /inventory/expiring?days=3 — 곧 상하는 재료 (이미 지난 것 포함, 임박순) */
  @Get('expiring')
  expiring(@CurrentUser() userId: string, @Query('days') days?: string): Promise<IngredientType[]> {
    const parsed = Number(days);
    const window = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SOON_DAYS;
    return this.inventory.expiringSoon(userId, window);
  }

  /** GET /inventory — 아직 안 먹은 재고 전부 (임박순) */
  @Get()
  list(@CurrentUser() userId: string): Promise<IngredientType[]> {
    return this.inventory.list(userId);
  }

  /** POST /inventory — 재료 추가 (여러 건). 만료일은 서버가 항상 채운다. */
  @Post()
  add(@CurrentUser() userId: string, @Body() dto: AddIngredientsDto): Promise<IngredientType[]> {
    return this.inventory.add(userId, dto.items);
  }

  /**
   * POST /inventory/scan — 영수증·사진 이미지에서 재료를 뽑아 **제안만** 돌려준다 (저장 안 함).
   * 클라가 확인·편집한 뒤 `POST /inventory` 로 저장한다 (채팅 확인 카드와 같은 방침).
   */
  @Post('scan')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  async scan(
    @CurrentUser() userId: string,
    @UploadedFile() file: UploadedImage | undefined,
    @Body() dto: ScanDto,
  ): Promise<ScanResultType> {
    // 클라 검증은 UX, 서버 검증이 방어다 — 앱이 리사이즈해 보내지만 여기서도 막는다.
    if (!file) {
      throw new BadRequestException('이미지를 첨부해 주세요.');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('이미지 파일만 올릴 수 있습니다.');
    }
    const kind: ScanKindType = dto.kind === 'photo' ? 'photo' : 'receipt';
    const image = { buffer: file.buffer, mimeType: file.mimetype };
    // OCR 사용 여부는 요청으로 고른다 — 어느 쪽이 정확한지 비교하는 동안만 두는 스위치다.
    const items =
      dto.ocr === 'true'
        ? await this.scanner.scanWithOcr(userId, kind, image)
        : await this.scanner.scan(userId, kind, image);

    return { items };
  }

  /** PATCH /inventory/:id — 교정 (이름·분류·수량메모·보관위치·만료일) */
  @Patch(':id')
  update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateIngredientDto,
  ): Promise<IngredientType> {
    return this.inventory.update(userId, id, dto);
  }

  /** POST /inventory/:id/restore — 소비 취소 (오차감 되돌리기). 멱등 */
  @Post(':id/restore')
  @HttpCode(204)
  restore(@CurrentUser() userId: string, @Param('id') id: string): Promise<void> {
    return this.inventory.restore(userId, id);
  }

  /** DELETE /inventory/:id — 다 먹음 처리 (soft delete, 복구 가능). 멱등 */
  @Delete(':id')
  @HttpCode(204)
  async consume(@CurrentUser() userId: string, @Param('id') id: string): Promise<void> {
    await this.inventory.consume(userId, [id]);
  }

  /** DELETE /inventory/:id/hard — 잘못 등록한 재료를 이력에도 안 남기고 완전 삭제. 멱등 */
  @Delete(':id/hard')
  @HttpCode(204)
  remove(@CurrentUser() userId: string, @Param('id') id: string): Promise<void> {
    return this.inventory.remove(userId, id);
  }
}
