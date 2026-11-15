import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../auth/jwt.guard';
import { Counter, Gauge, collectDefaultMetrics, register } from 'prom-client';

collectDefaultMetrics({ prefix: 'liveboard_' });

export const wsConnections = new Gauge({ name: 'liveboard_ws_connections', help: 'Open WebSocket connections on this instance' });
export const boardEvents = new Counter({ name: 'liveboard_board_events_total', help: 'Domain events published', labelNames: ['type'] });

@Public()
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  @Get()
  @Header('Content-Type', register.contentType)
  metrics() {
    return register.metrics();
  }
}
