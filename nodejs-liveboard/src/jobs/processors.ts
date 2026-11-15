import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../infra/prisma.service';
import { ACTIVITY_QUEUE, ActivityJob, NOTIFY_QUEUE, NotifyJob } from './queues';

@Processor(ACTIVITY_QUEUE, { concurrency: 20 })
export class ActivityProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<ActivityJob>) {
    const { boardId, userId, type, payload } = job.data;
    await this.prisma.activity.create({ data: { boardId, userId, type, payload: payload as object } });
  }
}

@Processor(NOTIFY_QUEUE, { concurrency: 5, limiter: { max: 10, duration: 1000 } })
export class NotifyProcessor extends WorkerHost {
  private readonly logger = new Logger('Mailer');

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<NotifyJob>) {
    const user = await this.prisma.user.findUnique({ where: { id: job.data.to } });
    if (!user) return;
    // A real SMTP / SES call would go here; the rate limiter above protects the provider.
    this.logger.log(`📧 to=${user.email} subject="${job.data.subject}" (attempt ${job.attemptsMade + 1})`);
  }
}
