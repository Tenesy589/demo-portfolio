import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Subscription } from 'rxjs';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { BoardEventBus } from '../common/board-events';
import { config } from '../infra/config';
import { wsConnections } from '../infra/metrics';
import { PresenceService } from './presence.service';

type ClientSocket = Socket<any, any, any, { user: AuthUser; boardId?: string }>;
const room = (boardId: string) => `board:${boardId}`;

@WebSocketGateway({ path: '/socket.io' })
export class BoardGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(BoardGateway.name);
  private subscription: Subscription;

  constructor(private readonly auth: AuthService, private readonly presence: PresenceService, private readonly events: BoardEventBus) {}

  afterInit() {
    // Fan out every domain event to everyone on that board — across all instances.
    this.subscription = this.events.stream().subscribe((e) => this.server.to(room(e.boardId)).emit('board:event', e));
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe();
  }

  handleConnection(client: ClientSocket) {
    try {
      client.data.user = this.auth.verify(String(client.handshake.auth?.token ?? ''));
      wsConnections.inc();
      client.emit('hello', { instance: config.instanceId });
    } catch {
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: ClientSocket) {
    if (!client.data.user) return;
    wsConnections.dec();
    await this.leave(client);
  }

  @SubscribeMessage('board:join')
  async join(@ConnectedSocket() client: ClientSocket, @MessageBody() boardId: string) {
    await this.leave(client);
    client.data.boardId = boardId;
    await client.join(room(boardId));
    const users = await this.presence.join(boardId, client.id, client.data.user);
    this.server.to(room(boardId)).emit('presence', users);
    this.logger.debug(`${client.data.user.name} joined ${boardId}`);
    return { ok: true, instance: config.instanceId };
  }

  @SubscribeMessage('board:leave')
  leaveBoard(@ConnectedSocket() client: ClientSocket) {
    return this.leave(client);
  }

  /** Ephemeral "X is editing card Y" signal — never persisted. */
  @SubscribeMessage('card:editing')
  editing(@ConnectedSocket() client: ClientSocket, @MessageBody() body: { cardId: string; editing: boolean }) {
    if (!client.data.boardId) return;
    client.to(room(client.data.boardId)).emit('card:editing', { ...body, user: client.data.user });
  }

  private async leave(client: ClientSocket) {
    const boardId = client.data.boardId;
    if (!boardId) return;
    client.data.boardId = undefined;
    await client.leave(room(boardId));
    const users = await this.presence.leave(boardId, client.id);
    this.server.to(room(boardId)).emit('presence', users);
    this.server.to(room(boardId)).emit('card:editing', { cardId: '*', editing: false, user: client.data.user });
  }
}
