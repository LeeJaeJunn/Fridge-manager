import { Body, Controller, Delete, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CharacterService } from './character.service';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';

/** 전부 현재 유저 기준. 입력 검증은 전역 ValidationPipe가 처리. */
@UseGuards(JwtAuthGuard)
@Controller('characters')
export class CharacterController {
  constructor(private readonly characters: CharacterService) {}

  /** GET /characters/options — 온보딩 폼 선택지 vocab (말투/관심사) */
  @Get('options')
  options() {
    return this.characters.options();
  }

  /** GET /characters/me — 내 캐릭터 (없으면 null) */
  @Get('me')
  me(@CurrentUser() userId: string) {
    return this.characters.getMine(userId);
  }

  /** POST /characters — 캐릭터 상세 생성 (필드 세트 + 관심사) */
  @Post()
  create(@CurrentUser() userId: string, @Body() body: CreateCharacterDto) {
    return this.characters.create(userId, body);
  }

  /** PATCH /characters/me — 캐릭터 부분 수정 (보낸 필드만) */
  @Patch('me')
  update(@CurrentUser() userId: string, @Body() body: UpdateCharacterDto) {
    return this.characters.update(userId, body);
  }

  /** DELETE /characters/me — 내 캐릭터 삭제 (테스트/리셋용). 대화도 cascade 삭제 */
  @Delete('me')
  @HttpCode(204)
  remove(@CurrentUser() userId: string) {
    return this.characters.remove(userId);
  }
}
