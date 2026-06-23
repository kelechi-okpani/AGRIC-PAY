import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { logger } from '../shared/utils/logger';

let io: SocketServer;

export const initSocket = (httpServer: HttpServer): SocketServer => {
  io = new SocketServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    logger.debug(`[Socket] Client connected: ${socket.id}`);

    socket.on('join:room', (userId: string) => {
      socket.join(`user:${userId}`);
      logger.debug(`[Socket] ${socket.id} joined room user:${userId}`);
    });

    socket.on('disconnect', () => {
      logger.debug(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = (): SocketServer => {
  if (!io) throw new Error('Socket.io not initialised');
  return io;
};

export const emitToUser = (userId: string, event: string, data: any): void => {
  getIO().to(`user:${userId}`).emit(event, data);
};