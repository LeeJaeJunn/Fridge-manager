import type {
  FunctionCallPayloadType,
  SaveDishRequestType,
  SavedDishIngredientType,
  SavedDishType,
  UpdateSavedDishRequestType,
} from '@companion/types';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { isUniqueViolation } from '../prisma/is-unique-violation';
import { PrismaService } from '../prisma/prisma.service';

/** 저장 대상은 요리 카드뿐이다 — 툴 이름이 이 값이어야 한다. */
const DISH_TOOL = 'propose_dish';

const SELECT = {
  id: true,
  sourceMessageId: true,
  dishName: true,
  servings: true,
  cookMinutes: true,
  ingredients: true,
  steps: true,
  createdAt: true,
  updatedAt: true,
} as const;

type SavedDishRow = {
  id: string;
  sourceMessageId: string;
  dishName: string;
  servings: number;
  cookMinutes: number | null;
  ingredients: unknown;
  steps: unknown;
  createdAt: Date;
  updatedAt: Date;
};

const toDto = (row: SavedDishRow): SavedDishType => ({
  id: row.id,
  sourceMessageId: row.sourceMessageId,
  dishName: row.dishName,
  servings: row.servings,
  cookMinutes: row.cookMinutes,
  ingredients: (row.ingredients as SavedDishIngredientType[] | null) ?? [],
  steps: (row.steps as string[] | null) ?? [],
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

@Injectable()
export class SavedDishService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<SavedDishType[]> {
    const rows = await this.prisma.savedDish.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: SELECT,
    });
    return rows.map(toDto);
  }

  async save(userId: string, req: SaveDishRequestType): Promise<SavedDishType> {
    await this.assertDishCard(userId, req.sourceMessageId);

    try {
      const row = await this.prisma.savedDish.create({
        data: {
          userId,
          sourceMessageId: req.sourceMessageId,
          dishName: req.dishName,
          servings: req.servings,
          cookMinutes: req.cookMinutes ?? null,
          ingredients: req.ingredients as unknown as Prisma.InputJsonValue,
          steps: req.steps,
        },
        select: SELECT,
      });
      return toDto(row);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('이미 저장한 요리예요.');
      }
      throw err;
    }
  }

  async update(
    userId: string,
    id: string,
    patch: UpdateSavedDishRequestType,
  ): Promise<SavedDishType> {
    const owned = await this.prisma.savedDish.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException('저장한 요리를 찾을 수 없어요.');

    const row = await this.prisma.savedDish.update({
      where: { id },
      data: {
        dishName: patch.dishName,
        servings: patch.servings,
        cookMinutes: patch.cookMinutes,
        ingredients: patch.ingredients
          ? (patch.ingredients as unknown as Prisma.InputJsonValue)
          : undefined,
        steps: patch.steps ? (patch.steps as unknown as Prisma.InputJsonValue) : undefined,
      },
      select: SELECT,
    });
    return toDto(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.prisma.savedDish.deleteMany({ where: { id, userId } });
  }

  /** 메시지가 현재 유저 대화의 요리 카드인지 확인한다. */
  private async assertDishCard(userId: string, messageId: string): Promise<void> {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, type: 'FUNCTION_CALL', conversation: { userId } },
      select: { payload: true },
    });
    const payload = (message?.payload as unknown as FunctionCallPayloadType | null) ?? null;
    if (!payload || payload.name !== DISH_TOOL) {
      throw new NotFoundException('요리 카드를 찾을 수 없어요.');
    }
  }
}
