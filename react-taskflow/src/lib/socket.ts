import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/** One shared connection per token; WebSocket-only so no sticky sessions are needed behind the LB. */
export function getSocket(token: string): Socket {
  if (socket && (socket.auth as { token?: string }).token === token) return socket;
  socket?.disconnect();
  socket = io({ path: '/socket.io', transports: ['websocket'], auth: { token } });
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}
