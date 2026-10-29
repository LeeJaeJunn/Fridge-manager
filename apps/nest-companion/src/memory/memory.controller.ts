import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';
import { MemoryService } from './memory.service';

/** "AI가 기억하는 나" — 전부 현재 유저 기준. */
@UseGuards(JwtAuthGuard)
@Controller('memories')
export class MemoryController {
  constructor(private readonly memories: MemoryService) {}

  /** GET /memories — 내 장기 메모리 전체 */
  @Get()
  list(@CurrentUser() userId: string) {
    return this.memories.list(userId);
  }

  /** GET /memories/options — 직접 추가용 예시와 입력 제한 */
  @Get('options')
  options() {
    return this.memories.options();
  }

  @Post()
  create(@CurrentUser() userId: string, @Body() dto: CreateMemoryDto) {
    return this.memories.create(userId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() userId: string, @Param('id') id: string, @Body() dto: UpdateMemoryDto) {
    return this.memories.update(userId, id, dto);
  }

  /** DELETE /memories/:id — 메모리 삭제 (교정용). 본인 것만, 멱등 */
  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.memories.remove(userId, id);
  }
}
