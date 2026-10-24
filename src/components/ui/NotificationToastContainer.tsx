import React from 'react';
import { useWebSocket } from '../../context/WebSocketContext';
import { Bell, X, AlertTriangle, Shield, CheckCircle, Info } from 'lucide-react';
import { formatRelativeTime } from '../../utils/formatters';

export const NotificationToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useWebSocket();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-3 sm:px-0"
    >
      {toasts.map((toast) => {
        const isCritical = toast.priority === 'critical';
        const isHigh = toast.priority === 'high';

        return (
          <div
            key={toast.toastId}
            className={`pointer-events-auto p-3.5 rounded-lg border shadow-xl backdrop-blur-md transition-all transform animate-in slide-in-from-bottom-5 duration-300 ${
              isCritical
                ? 'bg-rose-950/95 border-rose-800 text-rose-100 shadow-rose-950/50'
                : isHigh
                ? 'bg-amber-950/95 border-amber-800 text-amber-100 shadow-amber-950/50'
                : 'bg-neutral-900/95 border-neutral-750 text-neutral-100 shadow-black/60'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <div
                  className={`p-1.5 rounded-md shrink-0 mt-0.5 ${
                    isCritical
                      ? 'bg-rose-900/80 text-rose-300'
                      : isHigh
                      ? 'bg-amber-900/80 text-amber-300'
                      : 'bg-neutral-800 text-emerald-400'
                  }`}
                >
                  {isCritical ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : (
                    <Bell className="w-4 h-4" />
                  )}
                </div>

                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono">
                    <span className="font-semibold truncate text-white">
                      {toast.applicationName || 'NotifyX'}
                    </span>
                    <span className="text-neutral-500">·</span>
                    <span
                      className={`uppercase text-[10px] px-1 rounded ${
                        isCritical
                          ? 'bg-rose-900 text-rose-200'
                          : isHigh
                          ? 'bg-amber-900 text-amber-200'
                          : 'bg-neutral-800 text-neutral-300'
                      }`}
                    >
                      {toast.priority}
                    </span>
                    <span className="text-neutral-500">·</span>
                    <span className="text-neutral-400">Just now</span>
                  </div>

                  <h4 className="text-xs font-semibold tracking-tight text-white leading-snug">
                    {toast.title}
                  </h4>

                  <p className="text-[11px] text-neutral-300 line-clamp-2 leading-relaxed">
                    {toast.message}
                  </p>
                </div>
              </div>

              <button
                onClick={() => dismissToast(toast.toastId)}
                className="text-neutral-400 hover:text-white p-1 rounded hover:bg-black/30 transition-colors shrink-0"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
