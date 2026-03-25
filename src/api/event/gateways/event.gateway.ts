import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'events',
})
export class EventGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('EventGateway');

  afterInit(server: Server) {
    this.logger.log('Init');
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  handleConnection(client: Socket, ...args: any[]) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  @SubscribeMessage('joinEvent')
  handleJoinEvent(client: Socket, eventId: string): void {
    client.join(`event_${eventId}`);
    this.logger.log(`Client ${client.id} joined event event_${eventId}`);
  }

  @SubscribeMessage('leaveEvent')
  handleLeaveEvent(client: Socket, eventId: string): void {
    client.leave(`event_${eventId}`);
    this.logger.log(`Client ${client.id} left event event_${eventId}`);
  }

  @OnEvent('event.contribution_created')
  handleContributionCreated(payload: {
    eventId: string;
    contribution: any;
    newTotal: number;
  }) {
    this.server
      .to(`event_${payload.eventId}`)
      .emit('contributionUpdate', payload);
  }
}
