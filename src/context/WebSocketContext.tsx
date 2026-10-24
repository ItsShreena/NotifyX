import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { websocketClient, WebSocketStatus, RealtimeNotificationPayload } from '../services/websocketClient';
import { useAuth } from './AuthContext';

export interface ToastItem extends RealtimeNotificationPayload {
  toastId: string;
}

interface WebSocketContextType {
  status: WebSocketStatus;
  toasts: ToastItem[];
  dismissToast: (toastId: string) => void;
  latestNotification: RealtimeNotificationPayload | null;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, token } = useAuth();
  const [status, setStatus] = useState<WebSocketStatus>(() => websocketClient.getStatus());
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [latestNotification, setLatestNotification] = useState<RealtimeNotificationPayload | null>(null);

  useEffect(() => {
    // 1. Subscribe to status changes immediately so initial synchronous state is received
    const unsubStatus = websocketClient.onStatusChange((newStatus) => {
      setStatus(newStatus);
    });

    // 2. Subscribe to incoming realtime notifications
    const unsubNotif = websocketClient.onNotification((payload) => {
      setLatestNotification(payload);

      const toastId = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newToast: ToastItem = { ...payload, toastId };

      setToasts((prev) => [newToast, ...prev.slice(0, 4)]); // Keep maximum 5 toasts

      setTimeout(() => {
        setToasts((current) => current.filter((t) => t.toastId !== toastId));
      }, 6000);
    });

    // 3. Connect when authenticated with developer JWT, disconnect otherwise
    if (isAuthenticated && token) {
      websocketClient.connect(token);
    } else {
      websocketClient.disconnect();
    }

    return () => {
      unsubStatus();
      unsubNotif();
    };
  }, [isAuthenticated, token]);

  const dismissToast = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId));
  }, []);

  return (
    <WebSocketContext.Provider value={{ status, toasts, dismissToast, latestNotification }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export function useWebSocket(): WebSocketContextType {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}
