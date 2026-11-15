import { Module } from '@nestjs/common';
import { CardsService } from '../cards/cards.service';
import { BoardsController, CardsController, ColumnsController } from './boards.controller';
import { BoardsService } from './boards.service';

@Module({
  controllers: [BoardsController, ColumnsController, CardsController],
  providers: [BoardsService, CardsService],
})
export class BoardsModule {}
