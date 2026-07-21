import { Controller, Delete, Get, HttpCode, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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

  /** DELETE /memories/:id — 메모리 삭제 (교정용). 본인 것만, 멱등 */
  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.memories.remove(userId, id);
  }
}
