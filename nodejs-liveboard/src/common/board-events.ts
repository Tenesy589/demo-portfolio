import { Injectable } from '@nestjs/common';
import { Observable, Subject, filter } from 'rxjs';
import { boardEvents } from '../infra/metrics';

export type BoardEventType =
  | 'card.created'
  | 'card.updated'
  | 'card.moved'
  | 'card.deleted'
  | 'column.created'
  | 'column.updated'
  | 'column.deleted'
  | 'board.updated'
  | 'board.deleted';

export interface BoardEvent<T = unknown> {
  type: BoardEventType;
  boardId: string;
  actor: { id: string; name: string };
  payload: T;
  at: string;
}

/**
 * In-process domain event bus. Services publish, and independent consumers
 * (WebSocket gateway, background job producer) subscribe without coupling.
 */
@Injectable()
export class BoardEventBus {
  private readonly subject = new Subject<BoardEvent>();

  publish<T>(event: Omit<BoardEvent<T>, 'at'>) {
    boardEvents.inc({ type: event.type });
    this.subject.next({ ...event, at: new Date().toISOString() });
  }

  stream(...types: BoardEventType[]): Observable<BoardEvent> {
    return types.length ? this.subject.pipe(filter((e) => types.includes(e.type))) : this.subject.asObservable();
  }
}
