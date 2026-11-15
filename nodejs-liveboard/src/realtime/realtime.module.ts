import { Module } from '@nestjs/common';
import { BoardGateway } from './board.gateway';
import { PresenceService } from './presence.service';

@Module({ providers: [BoardGateway, PresenceService] })
export class RealtimeModule {}
