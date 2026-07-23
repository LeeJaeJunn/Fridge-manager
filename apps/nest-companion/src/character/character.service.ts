import type {
  CharacterOptionsType,
  CharacterType,
  CreateCharacterRequestType,
  SpeechStyleType,
  UpdateCharacterRequestType,
} from '@companion/types';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { characterOptions, tagToMemory } from './persona';
import { PrismaService } from '../prisma/prisma.service';

/** Prisma row → 클라이언트 계약(CharacterType) 변환. instruction 등 내부 필드는 애초에 없음(조립식). */
type CharacterRow = {
  id: string;
  name: string;
  speechStyle: string | null;
  userNickname: string | null;
  createdAt: Date;
};

const toDto = (c: CharacterRow): CharacterType => ({
  id: c.id,
  name: c.name,
  speechStyle: c.speechStyle as SpeechStyleType | null,
  userNickname: c.userNickname,
  createdAt: c.createdAt.toISOString(),
});

const SELECT = {
  id: true,
  name: true,
  speechStyle: true,
  userNickname: true,
  createdAt: true,
} as const;

const trimOrNull = (v: string | null | undefined): string | null | undefined =>
  typeof v === 'string' ? v.trim() : v;

@Injectable()
export class CharacterService {
  constructor(private readonly prisma: PrismaService) {}

  /** 온보딩 폼이 렌더할 선택지 vocab (말투/관심사) — 서버 소유 단일 진실원천 */
  options(): CharacterOptionsType {
    return characterOptions();
  }

  /** 내 캐릭터 조회 — 아직 없으면 null */
  async getMine(userId: string): Promise<CharacterType | null> {
    const row = await this.prisma.character.findUnique({
      where: { userId },
      select: SELECT,
    });
    return row ? toDto(row) : null;
  }

  /**
   * 캐릭터 상세 생성 (유저당 1개).
   * 캐릭터 생성 + 온보딩 태그를 메모리로 시드하는 걸 **한 트랜잭션**으로 묶는다(반쪽 생성 방지).
   * 태그는 그룹에 따라 서로 다른 카테고리·중요도로 들어간다
   * (식성→PREFERENCE / 알레르기→PROFILE importance 3 / 조리도구→OWNERSHIP).
   * instruction 은 저장하지 않는다 — 프롬프트 시점에 필드에서 조립.
   */
  async create(userId: string, dto: CreateCharacterRequestType): Promise<CharacterType> {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.character.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('이미 캐릭터가 있습니다.');
      }

      const created = await tx.character.create({
        data: {
          userId,
          name: dto.name.trim(),
          speechStyle: dto.speechStyle,
          userNickname: trimOrNull(dto.userNickname) || null,
        },
        select: SELECT,
      });

      // 온보딩 태그 → 메모리 시드 (기존과 정확일치 중복은 건너뜀 — 재생성 시 중복 방지)
      // 요청 안의 중복도 먼저 제거한다 — DTO 는 값이 vocab 에 있는지만 보므로 같은 태그가 여러 번 올 수 있다.
      const seeds = [...new Set(dto.tags ?? [])]
        .map(tagToMemory)
        .filter((s): s is NonNullable<typeof s> => s !== null);
      if (seeds.length > 0) {
        const known = await tx.memory.findMany({
          where: { userId, content: { in: seeds.map((s) => s.content) } },
          select: { content: true },
        });
        const knownSet = new Set(known.map((k) => k.content));
        const fresh = seeds.filter((s) => !knownSet.has(s.content)).map((s) => ({ userId, ...s }));
        if (fresh.length > 0) {
          await tx.memory.createMany({ data: fresh });
        }
      }

      return created;
    });

    return toDto(row);
  }

  /** 캐릭터 부분 수정 (보낸 필드만) */
  async update(userId: string, dto: UpdateCharacterRequestType): Promise<CharacterType> {
    const existing = await this.prisma.character.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('캐릭터가 없습니다. 먼저 생성하세요.');
    }

    // 보낸 필드만 갱신 — class-transformer 는 DTO 의 선언 필드를 전부 own 프로퍼티(값 undefined)로
    // 만들 수 있어 hasOwnProperty 로는 "보냄/안보냄"을 못 가른다. 그래서 값의 undefined 여부로 판단한다.
    // 단 `!== undefined` 는 no-unsafe-enum-comparison 규칙이 크래시하므로 `typeof` 로 검사한다.
    // (undefined = 안 보냄 → 건너뜀, 명시적 null = 비우기 → 반영)
    const isSet = (v: unknown): boolean => typeof v !== 'undefined';
    const data: Record<string, unknown> = {};
    if (isSet(dto.name)) data.name = (dto.name as string).trim();
    if (isSet(dto.speechStyle)) data.speechStyle = dto.speechStyle;
    if (isSet(dto.userNickname)) data.userNickname = trimOrNull(dto.userNickname) || null;

    const row = await this.prisma.character.update({
      where: { userId },
      data,
      select: SELECT,
    });
    return toDto(row);
  }

  /** 캐릭터 삭제 (1:1이라 deleteMany 로 멱등 처리). 대화/메시지는 cascade 로 함께 삭제됨. */
  async remove(userId: string): Promise<void> {
    await this.prisma.character.deleteMany({ where: { userId } });
  }
}
