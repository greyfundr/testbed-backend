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
  cors: { origin: '*' },
  namespace: 'live-updates',
})
export class AppLiveGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('AppLiveGateway');

  /**
   * Required by OnGatewayInit
   */
  afterInit(server: Server) {
    this.logger.log('Live Updates Gateway Initialized');
  }

  /**
   * Required by OnGatewayConnection
   */
  handleConnection(client: Socket, ...args: any[]) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  /**
   * Required by OnGatewayDisconnect
   */
  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribeToResource')
  handleSubscribe(
    client: Socket,
    payload: { resource: 'bill' | 'event' | 'campaign'; id: string },
  ): void {
    const room = `${payload.resource}_${payload.id}`;
    client.join(room);
    this.logger.log(`Client ${client.id} subscribed to ${room}`);
  }

  @SubscribeMessage('unsubscribeFromResource')
  handleUnsubscribe(
    client: Socket,
    payload: { resource: 'bill' | 'event' | 'campaign'; id: string },
  ): void {
    const room = `${payload.resource}_${payload.id}`;
    client.leave(room);
    this.logger.log(`Client ${client.id} unsubscribed from ${room}`);
  }

  @OnEvent('split_bill.*')
  handleSplitBillUpdates(payload: { billId: string; type: string; data: any }) {
    this.logger.log(`Broadcasting socket update for bill ${payload.billId}`);
    this.server.to(`bill_${payload.billId}`).emit('liveUpdate', payload);
  }

  @OnEvent('event.*')
  handleEventUpdates(payload: { eventId: string; type: string; data: any }) {
    this.logger.log(`Broadcasting socket update for event ${payload.eventId}`);
    this.server.to(`event_${payload.eventId}`).emit('liveUpdate', payload);
  }

  @OnEvent('campaign.*')
  handleCampaignUpdates(payload: {
    campaignId: string;
    type: string;
    data: any;
  }) {
    this.logger.log(
      `Broadcasting socket update for campaign ${payload.campaignId}`,
    );
    this.server
      .to(`campaign_${payload.campaignId}`)
      .emit('liveUpdate', payload);
  }
}
