import React from 'react';
import { useWebSocket } from '../../context/WebSocketContext';
import { WifiOff } from 'lucide-react';

export const WebSocketBadge: React.FC = () => {
  const { status } = useWebSocket();

  if (status === 'connected') {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-900/60 transition-colors shadow-xs"
        title="Live updates active. Instant push delivery enabled."
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        <span className="text-neutral-200">Live</span>
      </div>
    );
  }

  if (status === 'connecting') {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-neutral-900 text-neutral-400 border border-neutral-800 transition-colors"
        title="Connecting to live updates..."
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        <span>Connecting...</span>
      </div>
    );
  }

  if (status === 'reconnecting') {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-950/60 text-amber-400 border border-amber-900/60 transition-colors"
        title="Reconnecting to live updates..."
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        <span>Reconnecting...</span>
      </div>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-neutral-900 text-neutral-400 border border-neutral-800 transition-colors"
      title="Live updates disconnected. Polling mode active."
    >
      <WifiOff className="w-3 h-3 text-neutral-500" />
      <span>Offline</span>
    </div>
  );
};
