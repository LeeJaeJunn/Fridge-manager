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

  /** GET /characters/presets — 세팅용 프리셋 목록 */
  @Get('presets')
  presets() {
    return this.characters.listPresets();
  }

  /** GET /characters/me — 내 캐릭터 (없으면 null) */
  @Get('me')
  me(@CurrentUser() userId: string) {
    return this.characters.getMine(userId);
  }

  /** POST /characters — 프리셋 선택해 내 캐릭터 생성 */
  @Post()
  create(@CurrentUser() userId: string, @Body() body: CreateCharacterDto) {
    return this.characters.create(userId, body.presetId);
  }

  /** PATCH /characters/me — 이름 수정 */
  @Patch('me')
  updateName(@CurrentUser() userId: string, @Body() body: UpdateCharacterDto) {
    return this.characters.updateName(userId, body.name);
  }

  /** DELETE /characters/me — 내 캐릭터 삭제 (테스트/리셋용). 대화도 cascade 삭제 */
  @Delete('me')
  @HttpCode(204)
  remove(@CurrentUser() userId: string) {
    return this.characters.remove(userId);
  }
}
