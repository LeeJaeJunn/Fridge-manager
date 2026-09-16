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
import { SaveDishDto } from './dto/save-dish.dto';
import { UpdateSavedDishDto } from './dto/update-saved-dish.dto';
import { SavedDishService } from './saved-dish.service';

/** 저장한 요리 — 전부 현재 유저 기준. */
@UseGuards(JwtAuthGuard)
@Controller('saved-dishes')
export class SavedDishController {
  constructor(private readonly savedDishes: SavedDishService) {}

  @Get()
  list(@CurrentUser() userId: string) {
    return this.savedDishes.list(userId);
  }

  @Post()
  save(@CurrentUser() userId: string, @Body() dto: SaveDishDto) {
    return this.savedDishes.save(userId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() userId: string, @Param('id') id: string, @Body() dto: UpdateSavedDishDto) {
    return this.savedDishes.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.savedDishes.remove(userId, id);
  }
}
