import { getWebSocketUrl } from './urlConfig';

export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface RealtimeNotificationPayload {
  id: string;
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  createdAt: string;
  recipientId?: string;
  type?: string;
  applicationId?: string;
  applicationName?: string;
  channel?: string;
}

type NotificationListener = (notification: RealtimeNotificationPayload) => void;
type StatusListener = (status: WebSocketStatus) => void;

class WebSocketClient {
  private socket: WebSocket | null = null;
  private status: WebSocketStatus = 'disconnected';
  private token: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 10000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private notificationListeners = new Set<NotificationListener>();
  private statusListeners = new Set<StatusListener>();

  public connect(token: string) {
    if (!token) {
      this.disconnect();
      return;
    }

    const previousToken = this.token;
    this.token = token;

    // If socket already exists
    if (this.socket) {
      if (this.socket.readyState === WebSocket.OPEN) {
        // If already connected with the same token, no work needed
        if (this.status === 'connected' && previousToken === token) {
          return;
        }
        // If open but pending authentication or token refreshed, transmit auth frame
        try {
          console.info('[NotifyX WebSocket] Transmitting auth frame on open socket');
          this.socket.send(JSON.stringify({ type: 'auth', token: this.token }));
        } catch (err) {
          console.warn('[NotifyX WebSocket] Failed to send auth frame on open socket:', err);
        }
        return;
      }

      if (this.socket.readyState === WebSocket.CONNECTING) {
        // Handshake in progress; onopen will transmit this.token
        return;
      }

      // Socket is closing or closed: nullify stale handlers before recreating
      this.detachSocketHandlers(this.socket);
      this.socket = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.setStatus('connecting');

    try {
      const wsUrl = getWebSocketUrl();
      console.info(`[NotifyX WebSocket] Connecting to ${wsUrl}...`);
      const currentSocket = new WebSocket(wsUrl);
      this.socket = currentSocket;

      currentSocket.onopen = () => {
        // Guard against stale socket instances
        if (this.socket !== currentSocket) return;

        console.info('[NotifyX WebSocket] Connection established. Transmitting auth frame...');
        if (this.token && currentSocket.readyState === WebSocket.OPEN) {
          try {
            currentSocket.send(JSON.stringify({ type: 'auth', token: this.token }));
          } catch (sendErr) {
            console.warn('[NotifyX WebSocket] Failed to dispatch auth frame:', sendErr);
          }
        }
      };

      currentSocket.onmessage = (event) => {
        // Guard against stale socket instances
        if (this.socket !== currentSocket) return;

        try {
          const data = JSON.parse(event.data);

          if (data.event === 'notification:new' && data.payload) {
            this.notifyListeners(data.payload);
          } else if (data.type === 'auth:success') {
            console.info(`[NotifyX WebSocket] Authenticated successfully as user: ${data.userId}`);
            this.reconnectAttempts = 0;
            this.setStatus('connected');
            this.startHeartbeat();
          } else if (data.type === 'auth:error') {
            console.warn(`[NotifyX WebSocket] Server rejected authentication: ${data.error || 'unauthorized'}`);
            this.token = null;
            this.setStatus('disconnected');
            this.cleanup();
            if (currentSocket.readyState === WebSocket.OPEN) {
              currentSocket.close(1008, 'Auth rejected');
            }
          }
        } catch (e) {
          console.warn('[NotifyX WebSocket] Malformed message received:', e);
        }
      };

      currentSocket.onclose = (event) => {
        // Stale socket protection: ignore closure of superseded socket
        if (this.socket !== currentSocket) return;

        this.cleanup();
        console.info(`[NotifyX WebSocket] Socket closed (code: ${event.code}, reason: ${event.reason || 'normal'}, clean: ${event.wasClean})`);

        // Close code 1008 is Policy Violation (auth failed)
        // Close code 1000 is Normal Closure (intentional disconnect)
        if (event.code === 1008 || event.code === 1000 || !this.token) {
          this.setStatus('disconnected');
          return;
        }

        if (this.reconnectAttempts >= 8) {
          console.warn('[NotifyX WebSocket] Maximum reconnect attempts reached (8). Halting reconnect loop.');
          this.setStatus('disconnected');
          return;
        }

        this.scheduleReconnect();
      };

      currentSocket.onerror = () => {
        if (this.socket !== currentSocket) return;
        console.warn('[NotifyX WebSocket] Transport error encountered on socket');
      };
    } catch (err) {
      console.warn('[NotifyX WebSocket] Initialization failed:', err);
      this.scheduleReconnect();
    }
  }

  public disconnect() {
    this.token = null;
    this.setStatus('disconnected');
    this.cleanup();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      const sock = this.socket;
      this.socket = null;
      this.detachSocketHandlers(sock);
      if (sock.readyState === WebSocket.OPEN || sock.readyState === WebSocket.CONNECTING) {
        sock.close(1000, 'Client disconnected');
      }
    }
  }

  private detachSocketHandlers(socket: WebSocket) {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
  }

  private scheduleReconnect() {
    if (!this.token) {
      this.setStatus('disconnected');
      return;
    }

    this.setStatus('reconnecting');

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;
    console.info(`[NotifyX WebSocket] Scheduling reconnect attempt ${this.reconnectAttempts}/8 in ${Math.round(delay)}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.token) {
        this.connect(this.token);
      } else {
        this.setStatus('disconnected');
      }
    }, delay);
  }

  private startHeartbeat() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);
  }

  private cleanup() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private setStatus(newStatus: WebSocketStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      for (const listener of this.statusListeners) {
        try {
          listener(newStatus);
        } catch (err) {
          console.error('[NotifyX WebSocket] Status listener threw error:', err);
        }
      }
    }
  }

  private notifyListeners(notification: RealtimeNotificationPayload) {
    for (const listener of this.notificationListeners) {
      try {
        listener(notification);
      } catch (err) {
        console.error('[NotifyX WebSocket] Notification listener threw error:', err);
      }
    }
  }

  public onNotification(listener: NotificationListener): () => void {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  public onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  public getStatus(): WebSocketStatus {
    return this.status;
  }
}

export const websocketClient = new WebSocketClient();
