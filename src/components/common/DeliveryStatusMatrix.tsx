import React from 'react';
import {
  Bell,
  Mail,
  Smartphone,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  MinusCircle,
  Radio,
} from 'lucide-react';
import { NotificationDeliveryInfo } from '../../types/notification';

export interface DeliveryStatusMatrixProps {
  deliveries?: NotificationDeliveryInfo[];
  priority?: string;
  className?: string;
  compact?: boolean;
}

interface ChannelResolution {
  channel: 'in_app' | 'email' | 'push';
  label: string;
  icon: React.ElementType;
  status: 'delivered' | 'failed' | 'skipped' | 'processing' | 'pending';
  provider: string;
  latencyMs?: number | null;
  attempts: number;
  maxAttempts: number;
  errorMessage?: string | null;
  statusCode?: number | null;
}

export const DeliveryStatusMatrix: React.FC<DeliveryStatusMatrixProps> = ({
  deliveries = [],
  priority = 'normal',
  className = '',
  compact = false,
}) => {
  const p = priority.toLowerCase();
  const isCritical = p === 'critical';
  const isHigh = p === 'high' || p === 'urgent';

  const channels: Array<{
    key: 'in_app' | 'email' | 'push';
    label: string;
    icon: React.ElementType;
    defaultEligible: boolean;
  }> = [
    { key: 'in_app', label: 'In-App', icon: Bell, defaultEligible: true },
    { key: 'email', label: 'Email', icon: Mail, defaultEligible: isHigh || isCritical },
    { key: 'push', label: 'Push', icon: Smartphone, defaultEligible: isCritical },
  ];

  const formatProviderName = (raw?: string | null, channel?: string): string => {
    if (!raw) {
      if (channel === 'email') return 'Mock Email Gateway (Simulated)';
      if (channel === 'push') return 'Mock Push Gateway (Simulated)';
      if (channel === 'in_app') return 'In-App Live Stream';
      return 'NotifyX Pipeline';
    }
    if (raw === 'MockEmailProvider' || raw.toLowerCase().includes('mockemail')) {
      return 'Mock Email Gateway (Simulated)';
    }
    if (raw === 'MockPushProvider' || raw.toLowerCase().includes('mockpush')) {
      return 'Mock Push Gateway (Simulated)';
    }
    if (raw === 'InAppWebSocket' || raw.toLowerCase().includes('websocket')) {
      return 'In-App Live Stream';
    }
    if (raw === 'NotifyX-Pipeline') {
      return 'NotifyX Pipeline';
    }
    if (raw === 'PriorityPolicyEngine') {
      return 'Priority Policy Engine';
    }
    return raw;
  };

  const resolvedChannels: ChannelResolution[] = channels.map(({ key, label, icon, defaultEligible }) => {
    const existing = deliveries.find((d) => d.channel.toLowerCase() === key);

    if (existing) {
      const rawStatus = (existing.status || 'pending').toLowerCase() as ChannelResolution['status'];
      return {
        channel: key,
        label,
        icon,
        status: rawStatus,
        provider: formatProviderName(existing.provider, key),
        latencyMs: existing.latencyMs,
        attempts: existing.attempts || (rawStatus === 'delivered' ? 1 : 0),
        maxAttempts: existing.maxAttempts || 3,
        errorMessage: existing.errorMessage,
        statusCode: existing.statusCode,
      };
    }

    // Channel had no delivery record created
    return {
      channel: key,
      label,
      icon,
      status: defaultEligible ? 'pending' : 'skipped',
      provider: defaultEligible ? 'NotifyX Pipeline' : 'Priority Policy Engine',
      latencyMs: null,
      attempts: 0,
      maxAttempts: 3,
      errorMessage: defaultEligible
        ? 'Pending dispatch in queue'
        : `Policy: Not candidate for ${priority.toUpperCase()} priority`,
      statusCode: defaultEligible ? null : 403,
    };
  });

  const getStatusBadge = (status: ChannelResolution['status']) => {
    switch (status) {
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 font-bold">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>DELIVERED</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/80 font-bold">
            <XCircle className="w-3 h-3 text-rose-400" />
            <span>FAILED</span>
          </span>
        );
      case 'skipped':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-400 border border-neutral-800 font-medium">
            <MinusCircle className="w-3 h-3 text-neutral-500" />
            <span>SKIPPED</span>
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-950/80 text-sky-300 border border-sky-800/80 font-semibold animate-pulse">
            <Activity className="w-3 h-3 text-sky-400" />
            <span>PROCESSING</span>
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/80 font-medium">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>PENDING</span>
          </span>
        );
    }
  };

  // Compact badge row (used on notification lists and rows)
  if (compact) {
    return (
      <div className={`flex flex-wrap items-center gap-1.5 text-[11px] font-mono ${className}`}>
        {resolvedChannels.map((item) => {
          const Icon = item.icon;
          const isDelivered = item.status === 'delivered';
          const isFailed = item.status === 'failed';
          const isSkipped = item.status === 'skipped';

          return (
            <span
              key={item.channel}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] ${
                isDelivered
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/70 font-semibold'
                  : isFailed
                  ? 'bg-rose-950/60 text-rose-300 border-rose-800/70 font-semibold'
                  : isSkipped
                  ? 'bg-neutral-900 text-neutral-400 border-neutral-800'
                  : 'bg-amber-950/60 text-amber-300 border-amber-800/70'
              }`}
              title={`${item.label}: ${item.status.toUpperCase()} (${item.provider}${
                item.latencyMs ? ` · ${item.latencyMs}ms` : ''
              })`}
            >
              <Icon className="w-2.5 h-2.5 shrink-0" />
              <span>{item.label}</span>
              <span className="opacity-90">
                {isDelivered ? '✓' : isFailed ? '✕' : isSkipped ? '—' : '⏳'}
              </span>
            </span>
          );
        })}
      </div>
    );
  }

  // Detailed multi-channel status table (used in expanded view)
  return (
    <div className={`space-y-2 bg-neutral-950 p-3 rounded-lg border border-neutral-800 text-xs font-mono ${className}`}>
      <div className="flex items-center justify-between border-b border-neutral-850 pb-2 text-neutral-300 font-bold">
        <span className="flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5 text-emerald-400" />
          <span>Multi-Channel Delivery Status</span>
        </span>
        <span className="text-[10px] text-neutral-500 font-normal">
          Active Delivery Gateways
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] uppercase text-neutral-500 border-b border-neutral-850">
              <th className="py-1.5 px-2">Channel</th>
              <th className="py-1.5 px-2">Status</th>
              <th className="py-1.5 px-2">Provider Adapter</th>
              <th className="py-1.5 px-2">Latency</th>
              <th className="py-1.5 px-2">Attempts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-850 text-[11px]">
            {resolvedChannels.map((item) => {
              const Icon = item.icon;
              return (
                <tr key={item.channel} className="hover:bg-neutral-900/40">
                  <td className="py-2 px-2 font-semibold text-neutral-200">
                    <div className="flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5 text-neutral-400" />
                      <span>{item.label}</span>
                    </div>
                  </td>
                  <td className="py-2 px-2">{getStatusBadge(item.status)}</td>
                  <td className="py-2 px-2 text-neutral-300 font-mono">
                    <span className="text-neutral-200">{item.provider}</span>
                    {item.errorMessage && (
                      <div className="text-[10px] text-neutral-500 mt-0.5 line-clamp-1" title={item.errorMessage}>
                        {item.errorMessage}
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-2 text-neutral-400">
                    {item.latencyMs !== null && item.latencyMs !== undefined ? `${item.latencyMs}ms` : '—'}
                  </td>
                  <td className="py-2 px-2 text-neutral-400">
                    {item.attempts} / {item.maxAttempts}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
