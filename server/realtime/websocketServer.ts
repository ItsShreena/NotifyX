import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../middleware/authMiddleware.ts';
import type { JwtAuthPayload } from '../types/auth.ts';
import { userStore } from '../db/userStore.ts';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
}

// User-to-sockets mapping supporting multi-tab connections per developer
const userSockets = new Map<string, Set<AuthenticatedWebSocket>>();

let wssInstance: WebSocketServer | null = null;

/**
 * Initializes the WebSocket server attached to the existing HTTP server.
 */
export function initWebSocketServer(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
  });

  wssInstance = wss;

  console.log('⚡ NotifyX Real-Time WebSocket Server initialized on path /ws');

  wss.on('connection', (socket: AuthenticatedWebSocket, req) => {
    socket.isAlive = true;

    // Close unauthenticated sockets after 10 seconds to prevent connection slot exhaustion DoS
    const authTimeout = setTimeout(() => {
      if (!socket.userId && socket.readyState === WebSocket.OPEN) {
        console.warn('⏱️ WebSocket authentication timeout (no valid credentials provided within 10s)');
        socket.close(1008, 'Authentication timeout: token not provided within 10 seconds');
      }
    }, 10000);

    // Handle pong heartbeats
    socket.on('pong', () => {
      socket.isAlive = true;
    });

    // Check for token in URL query string: ws://host/ws?token=<JWT>
    let token: string | null = null;
    if (req.url) {
      try {
        const url = new URL(req.url, 'http://localhost');
        token = url.searchParams.get('token');
      } catch (e) {
        // Ignore URL parsing errors
      }
    }

    if (token) {
      authenticateSocket(socket, token).then((authed) => {
        if (authed) clearTimeout(authTimeout);
      });
    }

    socket.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'auth') {
          const authed = await authenticateSocket(socket, message.token);
          if (authed) {
            clearTimeout(authTimeout);
          }
        } else if (message.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch (err) {
        console.warn('Invalid WebSocket message received:', err);
      }
    });

    socket.on('close', (code, reason) => {
      clearTimeout(authTimeout);
      if (socket.userId) {
        removeUserSocket(socket.userId, socket);
        console.log(`🔌 WebSocket disconnected for user ${socket.userId} (code: ${code})`);
      }
    });

    socket.on('error', (err) => {
      console.warn(`⚠️ WebSocket error on socket (user: ${socket.userId || 'unauthenticated'}):`, err.message);
    });
  });

  // Heartbeat interval to detect stale/dead connections
  const interval = setInterval(() => {
    wss.clients.forEach((client: AuthenticatedWebSocket) => {
      if (client.isAlive === false) {
        if (client.userId) {
          removeUserSocket(client.userId, client);
        }
        return client.terminate();
      }
      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  return wss;
}

/**
 * Authenticates the socket using JWT token and validates developer account exists.
 */
export async function authenticateSocket(socket: AuthenticatedWebSocket, token: string): Promise<boolean> {
  try {
    if (!token) {
      socket.send(JSON.stringify({ type: 'auth:error', error: 'Authentication token required' }));
      socket.close(1008, 'Token required');
      return false;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as JwtAuthPayload;
    const userId = decoded.sub;

    if (!userId) {
      socket.send(JSON.stringify({ type: 'auth:error', error: 'Missing subject in token' }));
      socket.close(1008, 'Authentication failed');
      return false;
    }

    // Idempotent: if socket is already authenticated for this exact user, refresh ack
    if (socket.userId === userId) {
      socket.send(
        JSON.stringify({
          type: 'auth:success',
          userId,
          timestamp: new Date().toISOString(),
        })
      );
      return true;
    }

    const user = await userStore.findById(userId);
    if (!user) {
      console.warn(`🔒 WebSocket authentication rejected: Account ${userId} not found`);
      socket.send(JSON.stringify({ type: 'auth:error', error: 'Developer account not found or deleted' }));
      socket.close(1008, 'Account not found');
      return false;
    }

    socket.userId = userId;
    addUserSocket(userId, socket);

    console.log(`✅ Real-time WebSocket authenticated for user ${userId}`);

    socket.send(
      JSON.stringify({
        type: 'auth:success',
        userId,
        timestamp: new Date().toISOString(),
      })
    );
    return true;
  } catch (err: any) {
    console.warn(`🔒 WebSocket authentication rejected: ${err.message}`);
    socket.send(JSON.stringify({ type: 'auth:error', error: 'Invalid or expired token' }));
    socket.close(1008, 'Token invalid');
    return false;
  }
}

function addUserSocket(userId: string, socket: AuthenticatedWebSocket): void {
  let sockets = userSockets.get(userId);
  if (!sockets) {
    sockets = new Set();
    userSockets.set(userId, sockets);
  }
  sockets.add(socket);
}

function removeUserSocket(userId: string, socket: AuthenticatedWebSocket): void {
  const sockets = userSockets.get(userId);
  if (sockets) {
    sockets.delete(socket);
    if (sockets.size === 0) {
      userSockets.delete(userId);
    }
  }
}

/**
 * Dispatches a real-time event to a connected user.
 * If the user is currently offline, returns 0 (the notification is safely preserved in DB).
 */
export function emitNotificationToUser(
  userId: string,
  notification: {
    id: string;
    title: string;
    message: string;
    priority: string;
    createdAt: Date | string;
    recipientId?: string;
    type?: string;
    applicationId?: string;
    applicationName?: string;
    channel?: string;
  }
): number {
  const sockets = userSockets.get(userId);
  if (!sockets || sockets.size === 0) {
    // User is offline; notification safely retained in PostgreSQL
    return 0;
  }

  const messagePayload = JSON.stringify({
    event: 'notification:new',
    payload: {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      priority: notification.priority,
      createdAt:
        typeof notification.createdAt === 'string'
          ? notification.createdAt
          : notification.createdAt.toISOString(),
      recipientId: notification.recipientId,
      type: notification.type,
      applicationId: notification.applicationId,
      applicationName: notification.applicationName,
      channel: notification.channel || 'in_app',
    },
  });

  let deliveredCount = 0;
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(messagePayload);
      deliveredCount++;
    }
  }

  return deliveredCount;
}

/**
 * Returns the count of currently active WebSocket connections for a user.
 */
export function getConnectedClientCount(userId?: string): number {
  if (userId) {
    return userSockets.get(userId)?.size || 0;
  }
  return wssInstance?.clients.size || 0;
}
