import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CreateCardDto, MoveCardDto, UpdateCardDto } from '../boards/boards.dto';
import { BoardEventBus } from '../common/board-events';
import { PrismaService } from '../infra/prisma.service';

const STEP = 1000;
const cardInclude = { assignee: { select: { id: true, name: true } } } as const;

@Injectable()
export class CardsService {
  constructor(private readonly prisma: PrismaService, private readonly events: BoardEventBus) {}

  async create(boardId: string, dto: CreateCardDto, user: AuthUser) {
    const last = await this.prisma.card.findFirst({ where: { columnId: dto.columnId }, orderBy: { position: 'desc' } });
    const card = await this.prisma.card.create({
      data: { ...dto, boardId, position: (last?.position ?? 0) + STEP },
      include: cardInclude,
    });
    this.events.publish({ type: 'card.created', boardId, actor: user, payload: card });
    return card;
  }

  async update(id: string, dto: UpdateCardDto, user: AuthUser) {
    const { version, ...data } = dto;
    // Compare-and-swap on `version`: concurrent editors can't silently overwrite each other.
    const { count } = await this.prisma.card.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
    if (count === 0) {
      const current = await this.prisma.card.findUnique({ where: { id }, include: cardInclude });
      if (!current) throw new NotFoundException('Card not found');
      throw new ConflictException({ message: 'Card was modified by someone else', current });
    }
    const card = await this.prisma.card.findUniqueOrThrow({ where: { id }, include: cardInclude });
    this.events.publish({ type: 'card.updated', boardId: card.boardId, actor: user, payload: card });
    return card;
  }

  /**
   * Fractional indexing: new position is the midpoint between neighbours,
   * so a move is a single-row UPDATE. Rebalances the column only when
   * floating point precision runs out.
   */
  async move(id: string, dto: MoveCardDto, user: AuthUser) {
    const card = await this.prisma.$transaction(async (tx) => {
      const siblings = await tx.card.findMany({
        where: { columnId: dto.columnId, NOT: { id } },
        orderBy: { position: 'asc' },
        select: { id: true, position: true },
      });
      const index = Math.min(dto.index, siblings.length);
      const before = siblings[index - 1]?.position;
      const after = siblings[index]?.position;
      let position =
        before === undefined && after === undefined ? STEP : before === undefined ? after! / 2 : after === undefined ? before + STEP : (before + after) / 2;

      if (before !== undefined && after !== undefined && after - before < 1e-6) {
        siblings.splice(index, 0, { id, position: 0 });
        await Promise.all(siblings.map((s, i) => tx.card.update({ where: { id: s.id }, data: { position: (i + 1) * STEP } })));
        position = (index + 1) * STEP;
      }
      return tx.card.update({
        where: { id },
        data: { columnId: dto.columnId, position, version: { increment: 1 } },
        include: cardInclude,
      });
    });
    this.events.publish({ type: 'card.moved', boardId: card.boardId, actor: user, payload: { ...card, index: dto.index } });
    return card;
  }

  async remove(id: string, user: AuthUser) {
    const card = await this.prisma.card.delete({ where: { id } });
    this.events.publish({ type: 'card.deleted', boardId: card.boardId, actor: user, payload: { id, columnId: card.columnId, title: card.title } });
  }
}
