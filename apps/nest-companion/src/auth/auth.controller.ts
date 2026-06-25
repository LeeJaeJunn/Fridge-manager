import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from './current-user.decorator';
import { DevAuthGuard } from './dev-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  /** 현재 유저 조회 — 이음새(가드 + @CurrentUser) 동작 검증용 */
  @UseGuards(DevAuthGuard)
  @Get('me')
  async me(@CurrentUser() userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, loginId: true, name: true, createdAt: true },
    });
    if (!user) {
      throw new NotFoundException('유저를 찾을 수 없습니다.');
    }
    return user;
  }
}
