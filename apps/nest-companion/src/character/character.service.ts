import type { CharacterType, PresetSummaryType } from '@companion/types';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CHARACTERS, findCharacter } from './characters';
import { PrismaService } from '../prisma/prisma.service';

/** Prisma row → 클라이언트 계약(CharacterType) 변환. instruction 등 내부 필드는 제외. */
type CharacterRow = {
  id: string;
  name: string;
  description: string | null;
  presetId: string | null;
  createdAt: Date;
};
const toDto = (c: CharacterRow): CharacterType => ({
  id: c.id,
  name: c.name,
  description: c.description,
  presetId: c.presetId,
  createdAt: c.createdAt.toISOString(),
});

const SELECT = {
  id: true,
  name: true,
  description: true,
  presetId: true,
  createdAt: true,
} as const;

@Injectable()
export class CharacterService {
  constructor(private readonly prisma: PrismaService) {}

  /** 세팅 화면용 프리셋 목록 (instruction 비노출) */
  listPresets(): PresetSummaryType[] {
    return CHARACTERS.map(({ id, name, description }) => ({
      id,
      name,
      description,
    }));
  }

  /** 내 캐릭터 조회 — 아직 없으면 null */
  async getMine(userId: string): Promise<CharacterType | null> {
    const row = await this.prisma.character.findUnique({
      where: { userId },
      select: SELECT,
    });
    return row ? toDto(row) : null;
  }

  /** 프리셋을 골라 내 캐릭터 생성 (유저당 1개). 이름은 프리셋 기본값 — 수정은 PATCH로 나중. */
  async create(userId: string, presetId: string): Promise<CharacterType> {
    const preset = findCharacter(presetId);
    if (!preset) {
      throw new NotFoundException(`존재하지 않는 프리셋입니다: ${presetId}`);
    }

    const existing = await this.prisma.character.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('이미 캐릭터가 있습니다.');
    }

    const row = await this.prisma.character.create({
      data: {
        userId,
        name: preset.name, // 생성 시엔 프리셋 기본 이름
        description: preset.description, // 프리셋에서 복사 (표시용)
        instruction: preset.instruction, // 프리셋에서 복사 (이후 사용자 수정은 나중)
        presetId: preset.id,
      },
      select: SELECT,
    });
    return toDto(row);
  }

  /** 캐릭터 이름 수정 */
  async updateName(userId: string, name: string): Promise<CharacterType> {
    const existing = await this.prisma.character.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('캐릭터가 없습니다. 먼저 생성하세요.');
    }

    const row = await this.prisma.character.update({
      where: { userId },
      data: { name: name.trim() },
      select: SELECT,
    });
    return toDto(row);
  }

  /** 캐릭터 삭제 (1:1이라 deleteMany 로 멱등 처리). 대화/메시지는 cascade 로 함께 삭제됨. */
  async remove(userId: string): Promise<void> {
    await this.prisma.character.deleteMany({ where: { userId } });
  }
}
