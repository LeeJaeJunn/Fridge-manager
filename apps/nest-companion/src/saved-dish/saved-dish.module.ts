import { Module } from '@nestjs/common';
import { SavedDishController } from './saved-dish.controller';
import { SavedDishService } from './saved-dish.service';

@Module({
  controllers: [SavedDishController],
  providers: [SavedDishService],
})
export class SavedDishModule {}
