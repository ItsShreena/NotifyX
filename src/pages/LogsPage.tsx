import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Copy,
  Check,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { logService } from '../services/logService';
import { NotificationLog, DeliveryStatus } from '../types/logs';
import { copyToClipboard } from '../utils/clipboard';
import { formatDateTime, formatRelativeTime } from '../utils/formatters';

export const LogsPage: React.FC = () => {
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | 'all'>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected log for detailed payload inspection
  const [selectedLog, setSelectedLog] = useState<NotificationLog | null>(null);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const loadLogs = async () => {
    try {
      const data = await logService.getLogs({
        status: statusFilter,
        channel: channelFilter,
        searchQuery,
      });
      setLogs(data);
    } catch (err) {
      console.error('Failed to load delivery logs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [statusFilter, channelFilter, searchQuery]);

  const handleCopyJson = async (section: string, data: unknown) => {
    const success = await copyToClipboard(JSON.stringify(data, null, 2));
    if (success) {
      setCopiedSection(section);
      setTimeout(() => setCopiedSection(null), 2000);
    }
  };

  const getStatusBadge = (status: DeliveryStatus, code: number) => {
    switch (status) {
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            200 OK
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono text-rose-400">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            {code} FAIL
          </span>
        );
      case 'retrying':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            {code} RETRY
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono text-neutral-400">
            <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
            QUEUED
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Delivery & Audit Logs
          </h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            Low-latency observability stream for every inbound event, routing step, and downstream carrier response.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={loadLogs}>
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Feed</span>
        </Button>
      </div>

      {/* Filter and Query Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-neutral-900/40 p-2.5 rounded-lg border border-neutral-800">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 p-0.5 bg-neutral-950 rounded-md border border-neutral-800 text-xs">
            {[
              { id: 'all', label: 'All Statuses' },
              { id: 'delivered', label: 'Delivered' },
              { id: 'retrying', label: 'Retrying' },
              { id: 'failed', label: 'Failed' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id as any)}
                className={`px-3 py-1 rounded text-xs transition-colors ${
                  statusFilter === tab.id
                    ? 'bg-neutral-800 text-white font-medium shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Channel selector */}
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="text-xs bg-neutral-950 border border-neutral-800 rounded-md px-2.5 py-1.5 text-neutral-300 focus:outline-none focus:border-neutral-600"
          >
            <option value="all">All Channels</option>
            <option value="in_app">In-App</option>
            <option value="email">Email</option>
            <option value="webhook">Webhook</option>
            <option value="sms">SMS</option>
            <option value="push">Push</option>
          </select>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search event ID, recipient, app..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md pl-8 pr-3 py-1.5 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
          />
        </div>
      </div>

      {/* Logs Table (Dense developer data grid) */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900/80 text-neutral-400 font-mono text-[11px] uppercase">
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Event Name</th>
                <th className="py-2.5 px-4">Application</th>
                <th className="py-2.5 px-4">Recipient</th>
                <th className="py-2.5 px-4">Channel</th>
                <th className="py-2.5 px-4">Attempts</th>
                <th className="py-2.5 px-4 text-right">Latency</th>
                <th className="py-2.5 px-4 text-right">Timestamp</th>
                <th className="py-2.5 px-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/80">
              {logs.map((log) => (
                <tr
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className="hover:bg-neutral-900/50 cursor-pointer transition-colors group"
                >
                  <td className="py-3 px-4 whitespace-nowrap">
                    {getStatusBadge(log.status, log.statusCode)}
                  </td>
                  <td className="py-3 px-4 font-mono font-medium text-neutral-200 whitespace-nowrap">
                    {log.eventName}
                  </td>
                  <td className="py-3 px-4 text-neutral-300 whitespace-nowrap">
                    {log.applicationName}
                  </td>
                  <td className="py-3 px-4 font-mono text-neutral-400 truncate max-w-[140px]">
                    {log.recipient}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] uppercase text-neutral-400">
                    {log.channel}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-neutral-400">
                    {log.attempts}/{log.maxAttempts}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-right text-neutral-400">
                    {log.latencyMs}ms
                  </td>
                  <td className="py-3 px-4 text-neutral-500 font-mono text-right whitespace-nowrap">
                    {formatRelativeTime(log.timestamp)}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <ChevronRight className="w-3.5 h-3.5 text-neutral-600 group-hover:text-neutral-300 transition-colors" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detail Modal for Log Inspection */}
      {selectedLog && (
        <Modal
          isOpen={Boolean(selectedLog)}
          onClose={() => setSelectedLog(null)}
          title={`Delivery Log: ${selectedLog.eventName}`}
          description={`Event ID: ${selectedLog.eventId} · Transport: ${selectedLog.channel.toUpperCase()}`}
          maxWidth="xl"
        >
          <div className="space-y-4 text-xs">
            {/* Quick summary grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-neutral-950 p-3 rounded border border-neutral-800 font-mono">
              <div>
                <span className="text-neutral-500 block text-[10px]">STATUS</span>
                <span className="text-neutral-200">{selectedLog.statusCode} ({selectedLog.status.toUpperCase()})</span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[10px]">LATENCY</span>
                <span className="text-neutral-200 tabular-nums">{selectedLog.latencyMs}ms</span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[10px]">ATTEMPTS</span>
                <span className="text-neutral-200 tabular-nums">{selectedLog.attempts} of {selectedLog.maxAttempts}</span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[10px]">TIMESTAMP</span>
                <span className="text-neutral-200">{formatDateTime(selectedLog.timestamp)}</span>
              </div>
            </div>

            {/* Error message banner if any */}
            {selectedLog.errorMessage && (
              <div className="p-3 rounded bg-rose-950/40 border border-rose-900/60 text-rose-300">
                <span className="font-semibold block mb-0.5">Delivery Error Trace</span>
                <p className="font-mono text-xs">{selectedLog.errorMessage}</p>
              </div>
            )}

            {/* Request Payload */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-medium text-neutral-300">Inbound Event Payload</span>
                <button
                  onClick={() => handleCopyJson('payload', selectedLog.payload)}
                  className="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-white"
                >
                  {copiedSection === 'payload' ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy JSON</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3 bg-neutral-950 border border-neutral-800 rounded font-mono text-neutral-300 text-xs overflow-x-auto max-h-48">
                {JSON.stringify(selectedLog.payload, null, 2)}
              </pre>
            </div>

            {/* Headers */}
            <div>
              <span className="font-medium text-neutral-300 block mb-1.5">Request Headers</span>
              <pre className="p-3 bg-neutral-950 border border-neutral-800 rounded font-mono text-neutral-400 text-xs overflow-x-auto max-h-32">
                {JSON.stringify(selectedLog.headers, null, 2)}
              </pre>
            </div>

            {/* Downstream Response Body */}
            {selectedLog.responseBody && (
              <div>
                <span className="font-medium text-neutral-300 block mb-1.5">Downstream Carrier Response</span>
                <pre className="p-3 bg-neutral-950 border border-neutral-800 rounded font-mono text-neutral-300 text-xs overflow-x-auto">
                  {selectedLog.responseBody}
                </pre>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-neutral-800">
              <Button variant="outline" size="sm" onClick={() => setSelectedLog(null)}>
                Close Inspector
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
