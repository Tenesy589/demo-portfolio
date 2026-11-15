import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/jwt.guard';
import { CardsService } from '../cards/cards.service';
import { ColumnDto, CreateBoardDto, CreateCardDto, MoveCardDto, UpdateCardDto } from './boards.dto';
import { BoardsService } from './boards.service';

@ApiTags('boards')
@ApiBearerAuth()
@Controller('boards')
export class BoardsController {
  constructor(private readonly boards: BoardsService, private readonly cards: CardsService) {}

  @Get() list() { return this.boards.list(); }
  @Post() create(@Body() dto: CreateBoardDto, @CurrentUser() u: AuthUser) { return this.boards.create(dto, u); }
  @Get(':id') get(@Param('id') id: string) { return this.boards.get(id); }
  @Patch(':id') rename(@Param('id') id: string, @Body() dto: CreateBoardDto, @CurrentUser() u: AuthUser) { return this.boards.rename(id, dto, u); }
  @Delete(':id') @HttpCode(204) remove(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.boards.remove(id, u); }

  @Get(':id/activity')
  activity(@Param('id') id: string, @Query('take') take?: string) {
    return this.boards.activity(id, Math.min(Number(take) || 30, 100));
  }

  @Get(':id/export.csv')
  @ApiProduces('text/csv')
  async export(@Param('id') id: string, @Res() res: Response) {
    await this.boards.get(id); // 404 before we start streaming
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="board-${id}.csv"`);
    await pipeline(this.boards.exportCsv(id), res);
  }

  @Post(':id/columns') addColumn(@Param('id') id: string, @Body() dto: ColumnDto, @CurrentUser() u: AuthUser) { return this.boards.addColumn(id, dto, u); }
  @Post(':id/cards') addCard(@Param('id') id: string, @Body() dto: CreateCardDto, @CurrentUser() u: AuthUser) { return this.cards.create(id, dto, u); }
}

@ApiTags('columns')
@ApiBearerAuth()
@Controller('columns')
export class ColumnsController {
  constructor(private readonly boards: BoardsService) {}
  @Patch(':id') rename(@Param('id') id: string, @Body() dto: ColumnDto, @CurrentUser() u: AuthUser) { return this.boards.renameColumn(id, dto, u); }
  @Delete(':id') @HttpCode(204) remove(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.boards.removeColumn(id, u); }
}

@ApiTags('cards')
@ApiBearerAuth()
@Controller('cards')
export class CardsController {
  constructor(private readonly cards: CardsService) {}
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateCardDto, @CurrentUser() u: AuthUser) { return this.cards.update(id, dto, u); }
  @Post(':id/move') @HttpCode(200) move(@Param('id') id: string, @Body() dto: MoveCardDto, @CurrentUser() u: AuthUser) { return this.cards.move(id, dto, u); }
  @Delete(':id') @HttpCode(204) remove(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.cards.remove(id, u); }
}
