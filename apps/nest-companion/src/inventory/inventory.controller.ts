import type { IngredientType, InventoryOptionsType } from '@companion/types';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddIngredientsDto } from './dto/add-ingredients.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';
import { InventoryService } from './inventory.service';
import { inventoryOptions } from './shelf-life';

/** 임박 판정 기본 창(일) — 홈 "곧 상해요" 섹션이 쓰는 값. */
const DEFAULT_SOON_DAYS = 3;

/**
 * 냉장고 재고 — 전부 현재 유저 기준.
 * 채팅 툴이 같은 서비스를 직접 쓰므로, 여기 컨트롤러는 **수동 교정 경로**(화면에서 직접 고치기)다.
 */
@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

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
