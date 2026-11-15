import { Injectable, NotFoundException } from '@nestjs/common';
import { Readable } from 'node:stream';
import { AuthUser } from '../auth/auth.types';
import { BoardEventBus } from '../common/board-events';
import { PrismaService } from '../infra/prisma.service';
import { ColumnDto, CreateBoardDto } from './boards.dto';

const DEFAULT_COLUMNS = ['Backlog', 'In progress', 'Review', 'Done'];

@Injectable()
export class BoardsService {
  constructor(private readonly prisma: PrismaService, private readonly events: BoardEventBus) {}

  list() {
    return this.prisma.board.findMany({
      orderBy: { createdAt: 'desc' },
      include: { owner: { select: { id: true, name: true } }, _count: { select: { cards: true } } },
    });
  }

  async get(id: string) {
    const board = await this.prisma.board.findUnique({
      where: { id },
      include: {
        columns: {
          orderBy: { position: 'asc' },
          include: { cards: { orderBy: { position: 'asc' }, include: { assignee: { select: { id: true, name: true } } } } },
        },
      },
    });
    if (!board) throw new NotFoundException('Board not found');
    return board;
  }

  create(dto: CreateBoardDto, user: AuthUser) {
    return this.prisma.board.create({
      data: {
        title: dto.title,
        ownerId: user.id,
        columns: { create: DEFAULT_COLUMNS.map((title, i) => ({ title, position: (i + 1) * 1000 })) },
      },
    });
  }

  async remove(id: string) {
    await this.prisma.board.delete({ where: { id } });
  }

  async addColumn(boardId: string, dto: ColumnDto, user: AuthUser) {
    const last = await this.prisma.column.findFirst({ where: { boardId }, orderBy: { position: 'desc' } });
    const column = await this.prisma.column.create({ data: { boardId, title: dto.title, position: (last?.position ?? 0) + 1000 } });
    this.events.publish({ type: 'column.created', boardId, actor: user, payload: { ...column, cards: [] } });
    return column;
  }

  async renameColumn(id: string, dto: ColumnDto, user: AuthUser) {
    const column = await this.prisma.column.update({ where: { id }, data: { title: dto.title } });
    this.events.publish({ type: 'column.updated', boardId: column.boardId, actor: user, payload: column });
    return column;
  }

  async removeColumn(id: string, user: AuthUser) {
    const column = await this.prisma.column.delete({ where: { id } });
    this.events.publish({ type: 'column.deleted', boardId: column.boardId, actor: user, payload: { id } });
  }

  activity(boardId: string, take = 30) {
    return this.prisma.activity.findMany({
      where: { boardId },
      orderBy: { createdAt: 'desc' },
      take,
      include: { user: { select: { id: true, name: true } } },
    });
  }

  /**
   * Streams the board as CSV using keyset pagination: memory stays flat
   * whether the board has 10 or 10 million cards, and backpressure is
   * handled by the stream machinery.
   */
  exportCsv(boardId: string): Readable {
    const prisma = this.prisma;
    const escape = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`;

    async function* rows() {
      yield 'id,title,column,priority,assignee,created_at\n';
      let cursor: string | undefined;
      for (;;) {
        const batch = await prisma.card.findMany({
          where: { boardId },
          take: 500,
          ...(cursor && { skip: 1, cursor: { id: cursor } }),
          orderBy: { id: 'asc' },
          include: { column: { select: { title: true } }, assignee: { select: { name: true } } },
        });
        if (!batch.length) return;
        yield batch
          .map((c) => [c.id, c.title, c.column.title, c.priority, c.assignee?.name, c.createdAt.toISOString()].map(escape).join(',') + '\n')
          .join('');
        cursor = batch.at(-1)!.id;
      }
    }
    return Readable.from(rows());
  }
}
