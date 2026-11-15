import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Subscription } from 'rxjs';
import { BoardEventBus } from '../common/board-events';
import { ACTIVITY_QUEUE, ActivityJob, NOTIFY_QUEUE, NotifyJob } from './queues';

/**
 * Turns domain events into background jobs. The HTTP request returns as
 * soon as the DB write is done; audit logging and e-mails happen in the
 * worker process with retries and exponential backoff.
 */
@Injectable()
export class JobsProducer implements OnModuleInit, OnModuleDestroy {
  private subscription: Subscription;

  constructor(
    private readonly events: BoardEventBus,
    @InjectQueue(ACTIVITY_QUEUE) private readonly activity: Queue<ActivityJob>,
    @InjectQueue(NOTIFY_QUEUE) private readonly notify: Queue<NotifyJob>,
  ) {}

  onModuleInit() {
    this.subscription = this.events.stream().subscribe(async (e) => {
      const p = e.payload as Record<string, any>;
      await this.activity.add(e.type, {
        boardId: e.boardId,
        userId: e.actor.id,
        type: e.type,
        payload: { id: p.id, title: p.title, columnId: p.columnId },
      });

      if ((e.type === 'card.created' || e.type === 'card.updated') && p.assignee && p.assignee.id !== e.actor.id) {
        await this.notify.add('assigned', {
          to: p.assignee.id,
          subject: `${e.actor.name} assigned you a card`,
          body: `"${p.title}" is now yours.`,
        });
      }
    });
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe();
  }
}
