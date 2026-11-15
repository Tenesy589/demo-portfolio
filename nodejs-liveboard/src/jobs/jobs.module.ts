import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { JobsProducer } from './jobs.producer';
import { ACTIVITY_QUEUE, NOTIFY_QUEUE } from './queues';

const defaultJobOptions = { attempts: 5, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 1000, removeOnFail: 5000 };

export const QueuesModule = BullModule.registerQueue(
  { name: ACTIVITY_QUEUE, defaultJobOptions },
  { name: NOTIFY_QUEUE, defaultJobOptions },
);

@Module({ imports: [QueuesModule], providers: [JobsProducer] })
export class JobsModule {}
