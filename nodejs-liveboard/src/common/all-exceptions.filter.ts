import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/** Maps Prisma errors to proper HTTP codes and hides internals from clients. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') throw exception;
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      return res.status(exception.getStatus()).json(exception.getResponse());
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const map: Record<string, number> = { P2002: HttpStatus.CONFLICT, P2025: HttpStatus.NOT_FOUND, P2003: HttpStatus.BAD_REQUEST };
      const status = map[exception.code];
      if (status) return res.status(status).json({ statusCode: status, message: exception.meta?.cause ?? exception.code });
    }
    this.logger.error(exception instanceof Error ? exception.stack : exception);
    return res.status(500).json({ statusCode: 500, message: 'Internal server error' });
  }
}
