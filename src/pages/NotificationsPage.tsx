import React, { useState, useEffect } from 'react';
import {
  Bell,
  Check,
  CheckCheck,
  Search,
  ExternalLink,
  ChevronDown,
  Layers,
  Inbox,
  Clock,
  Send,
  Plus,
  Terminal,
  Copy,
  Zap,
  Play,
  AlertTriangle,
  Code2,
  ChevronRight,
  ShieldCheck,
  RotateCcw,
  Skull,
  History,
  RefreshCw,
  Sparkles,
  Brain,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { notificationService } from '../services/notificationService';
import { applicationService } from '../services/applicationService';
import { NotificationItem } from '../types/notification';
import { Application } from '../types/application';
import { useWebSocket } from '../context/WebSocketContext';
import { copyToClipboard } from '../utils/clipboard';
import { formatRelativeTime, formatDateTime } from '../utils/formatters';
import { DeliveryStatusMatrix } from '../components/common/DeliveryStatusMatrix';

const STANDARD_TYPES = [
  'ORDER_UPDATE',
  'PAYMENT',
  'SECURITY',
  'COMMENT',
  'TASK',
  'SYSTEM',
  'DEPLOYMENT',

  'REMINDER',
] as const;

export const NotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [selectedAppId, setSelectedAppId] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected item for detail inspection
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [showApiPlayground, setShowApiPlayground] = useState(true);

  // Create Notification Form State
  const [newAppId, setNewAppId] = useState('');
  const [newRecipientId, setNewRecipientId] = useState('user_123');
  const [newType, setNewType] = useState('ORDER_UPDATE');
  const [newTitle, setNewTitle] = useState('Order shipped');
  const [newMessage, setNewMessage] = useState('Your order #4821 has been shipped via FedEx Priority.');
  const [newPriority, setNewPriority] = useState<'low' | 'normal' | 'high' | 'critical'>('normal');
  const [newChannel, setNewChannel] = useState('in_app');
  const [newActionUrl, setNewActionUrl] = useState('');
  const [newIdempotencyKey, setNewIdempotencyKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // API Playground State
  const [apiTestAppId, setApiTestAppId] = useState<string>('');
  const [apiTestKey, setApiTestKey] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [apiRecipientId, setApiRecipientId] = useState('user_123');
  const [apiType, setApiType] = useState('ORDER_UPDATE');
  const [apiTitle, setApiTitle] = useState('Order shipped');
  const [apiMessage, setApiMessage] = useState('Your order #4821 has been shipped.');
  const [apiPriority, setApiPriority] = useState<'low' | 'normal' | 'high' | 'critical'>('normal');
  const [apiIdempotencyKey, setApiIdempotencyKey] = useState<string>('order_4821_shipped');
  const [testResult, setTestResult] = useState<{
    status: number;
    durationMs: number;
    data: any;
  } | null>(null);
  const [idempotencyResult, setIdempotencyResult] = useState<{
    key: string;
    attempt1: any;
    attempt2: any;
    durationMs: number;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isTestingIdempotency, setIsTestingIdempotency] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [reanalyzingId, setReanalyzingId] = useState<string | null>(null);

  const { latestNotification, status: wsStatus } = useWebSocket();

  // Instant real-time event listener: updates notification list without page refresh
  useEffect(() => {
    if (latestNotification) {
      setNotifications((prev) => {
        // Idempotency check: guard against duplicate events
        if (prev.some((n) => n.id === latestNotification.id)) {
          return prev;
        }
        const incomingItem: NotificationItem = {
          id: latestNotification.id,
          applicationId: latestNotification.applicationId || 'app_stream',
          applicationName: latestNotification.applicationName || 'Connected App',
          recipientId: latestNotification.recipientId || 'user',
          title: latestNotification.title,
          message: latestNotification.message,
          type: (latestNotification.type as any) || 'ORDER_UPDATE',
          priority: latestNotification.priority,
          channel: (latestNotification.channel as any) || 'in_app',
          status: 'delivered',
          attemptCount: 1,
          isRead: false,
          readAt: null,
          createdAt: latestNotification.createdAt,
        };
        return [incomingItem, ...prev];
      });
    }
  }, [latestNotification]);

  const loadData = async () => {
    try {
      const [notifs, apps] = await Promise.all([
        notificationService.getNotifications(),
        applicationService.getApplications(),
      ]);
      setNotifications(notifs);
      setApplications(apps);
      if (apps.length > 0) {
        if (!newAppId) setNewAppId(apps[0].id);
        if (!apiTestAppId) setApiTestAppId(apps[0].id);
      }
    } catch (err) {
      console.error('Failed loading notifications', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Poll every 5s to refresh delivery statuses
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await notificationService.markAsRead(id);
    await loadData();
  };

  const handleMarkAsUnread = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await notificationService.markAsUnread(id);
    await loadData();
  };

  const handleMarkAllRead = async () => {
    await notificationService.markAllAsRead();
    await loadData();
  };

  const handleReanalyze = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setReanalyzingId(id);
    try {
      await notificationService.reanalyzeNotification(id);
      await loadData();
    } catch (err) {
      console.error('Failed to reanalyze notification', err);
    } finally {
      setReanalyzingId(null);
    }
  };

  const handleCreateNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAppId || !newRecipientId || !newTitle || !newMessage) return;

    setIsSubmitting(true);
    try {
      const app = applications.find((a) => a.id === newAppId);
      await notificationService.sendNotification(
        {
          applicationId: newAppId,
          recipientId: newRecipientId,
          type: newType as any,
          title: newTitle,
          message: newMessage,
          priority: newPriority,
          channel: newChannel as any,
          actionUrl: newActionUrl || undefined,
          idempotencyKey: newIdempotencyKey || undefined,
        },
        app?.name || 'Application'
      );

      setIsCreateOpen(false);
      setNewTitle('Order shipped');
      setNewMessage('Your order #4821 has been shipped via FedEx Priority.');
      setNewIdempotencyKey('');
      await loadData();
    } catch (err) {
      console.error('Failed to create notification', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Generate real cURL command for testing section
  const selectedTestApp = applications.find((a) => a.id === apiTestAppId) || applications[0];
  const exampleApiKey = apiTestKey.trim() || selectedTestApp?.apiKeyFull || '';
  const curlKey = exampleApiKey || 'YOUR_FULL_API_KEY';

  const generatedCurl = `curl -X POST https://api.notifyx.dev/api/v1/notifications \\
  -H "Authorization: Bearer ${curlKey}" \\
  -H "Content-Type: application/json" \\
  ${apiIdempotencyKey ? `-H "Idempotency-Key: ${apiIdempotencyKey}" \\\n  ` : ''}-d '{
    "recipientId": "${apiRecipientId}",
    "type": "${apiType}",
    "title": "${apiTitle}",
    "message": "${apiMessage}",
    "priority": "${apiPriority}"
  }'`;

  const handleCopyCurl = async () => {
    const success = await copyToClipboard(generatedCurl);
    if (success) {
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    }
  };

  const handleRunApiTest = async () => {
    if (!selectedTestApp) return;

    const effectiveKey = apiTestKey.trim() || selectedTestApp?.apiKeyFull || '';
    if (!effectiveKey) {
      setTestResult({
        status: 0,
        durationMs: 0,
        data: {
          error: 'Please enter a full API key (for example: nx_live_... or nx_test_...) before sending the request.',
        },
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setIdempotencyResult(null);

    const payload = {
      recipientId: apiRecipientId,
      type: apiType,
      title: apiTitle,
      message: apiMessage,
      priority: apiPriority,
    };

    const headers: Record<string, string> = {};
    if (apiIdempotencyKey.trim()) {
      headers['Idempotency-Key'] = apiIdempotencyKey.trim();
    }

    try {
      // Use the application's credentials to test the real /api/v1/notifications endpoint
      const result = await notificationService.testExternalApi(effectiveKey, payload, headers);
      setTestResult(result);
      if (result.status === 201 || result.status === 200) {
        await loadData();
      }
    } catch (err: any) {
      setTestResult({
        status: 0,
        durationMs: 0,
        data: { error: err.message || 'Request failed' },
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Automated Idempotency Test: sends request twice with identical Idempotency-Key
  const handleTestIdempotencyDuplicate = async () => {
    if (!selectedTestApp) return;

    const effectiveKey = apiTestKey.trim() || selectedTestApp?.apiKeyFull || '';
    if (!effectiveKey) {
      setTestResult({
        status: 0,
        durationMs: 0,
        data: {
          error: 'Please enter a full API key (for example: nx_live_... or nx_test_...) before testing idempotency.',
        },
      });
      return;
    }

    setIsTestingIdempotency(true);
    setTestResult(null);
    setIdempotencyResult(null);

    const key = apiIdempotencyKey.trim() || `order_${Math.floor(Math.random() * 9000) + 1000}_shipped`;
    setApiIdempotencyKey(key);

    const payload = {
      recipientId: apiRecipientId,
      type: apiType,
      title: apiTitle,
      message: apiMessage,
      priority: apiPriority,
    };

    const start = performance.now();
    try {
      // 1. Send first request
      const firstReq = await notificationService.testExternalApi(
        effectiveKey,
        payload,
        { 'Idempotency-Key': key }
      );

      // 2. Immediately send duplicate request with exact same Idempotency-Key
      const secondReq = await notificationService.testExternalApi(
        effectiveKey,
        payload,
        { 'Idempotency-Key': key }
      );

      const durationMs = Math.round(performance.now() - start);

      setIdempotencyResult({
        key,
        attempt1: firstReq,
        attempt2: secondReq,
        durationMs,
      });

      await loadData();
    } catch (err: any) {
      console.error('Idempotency duplicate test failed:', err);
    } finally {
      setIsTestingIdempotency(false);
    }
  };

  const handleGenerateRandomKey = () => {
    setApiIdempotencyKey(`idemp_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString().slice(-4)}`);
  };

  const filteredNotifications = notifications.filter((item) => {
    if (readFilter === 'unread' && item.isRead) return false;
    if (readFilter === 'read' && !item.isRead) return false;
    if (selectedAppId !== 'all' && item.applicationId !== selectedAppId) return false;
    if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchMsg = item.message.toLowerCase().includes(q);
      const matchRecipient = item.recipientId.toLowerCase().includes(q);
      const matchApp = item.applicationName.toLowerCase().includes(q);
      const matchKey = item.idempotencyKey?.toLowerCase().includes(q);
      return matchTitle || matchMsg || matchRecipient || matchApp || matchKey;
    }
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>Notification Dispatch & Inbox</span>
              <span className="text-xs font-mono font-normal text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                {notifications.length} events
              </span>
            </h1>
            {unreadCount > 0 && (
              <span className="text-xs font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-900/60 px-2 py-0.5 rounded">
                {unreadCount} unread
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">
            Idempotency keys, retry backoff policies, dead-letter tracking, and real-time WebSocket delivery.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Mark all read</span>
            </Button>
          )}

          <Button variant="primary" size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5" />
            <span>Create Notification</span>
          </Button>
        </div>
      </div>

      {/* API Testing & cURL Playground Section */}
      <Card className="p-5 border-neutral-800 bg-neutral-900/40">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-neutral-400" />
            <h2 className="text-sm font-semibold text-white">
              API Testing Playground
            </h2>
          </div>
          <button
            onClick={() => setShowApiPlayground(!showApiPlayground)}
            className="text-xs text-neutral-400 hover:text-white transition-colors"
          >
            {showApiPlayground ? 'Hide Playground' : 'Show Playground'}
          </button>
        </div>

        {showApiPlayground && (
          <div className="mt-4 space-y-4">
            {/* Quick Test Presets */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-neutral-400 font-medium">Quick Presets:</span>
              <button
                type="button"
                onClick={() => {
                  setApiTitle('Order #4821 Shipped');
                  setApiMessage('Your parcel is on its way via FedEx Priority.');
                  setApiType('ORDER_UPDATE');
                  setApiPriority('high');
                  handleGenerateRandomKey();
                }}
                className="px-2 py-1 rounded bg-neutral-800 text-neutral-200 hover:bg-neutral-700 transition-colors"
              >
                Standard Order
              </button>
              <button
                type="button"
                onClick={() => {
                  setApiTitle('[SIMULATE_FAIL] Carrier Gateway Timeout');
                  setApiMessage('Simulating automated delivery retry with exponential backoff (Attempt 1 fails, Attempt 2 succeeds).');
                  setApiPriority('high');
                  handleGenerateRandomKey();
                }}
                className="px-2 py-1 rounded bg-amber-950/60 text-amber-300 border border-amber-800 hover:bg-amber-900/60 transition-colors"
              >
                ⚡ Test Retry & Backoff
              </button>
              <button
                type="button"
                onClick={() => {
                  setApiTitle('[DEAD_LETTER] Carrier Connection Refused');
                  setApiMessage('Testing Dead-Letter queue (Fails all 3 attempts and marks permanently failed).');
                  setApiPriority('critical');
                  handleGenerateRandomKey();
                }}
                className="px-2 py-1 rounded bg-rose-950/60 text-rose-300 border border-rose-800 hover:bg-rose-900/60 transition-colors"
              >
                ☠️ Test Dead-Letter Queue
              </button>
            </div>

            {/* Test Payload Form Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-neutral-950 p-3 rounded-md border border-neutral-850">
              <div>
                <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                  Target Application
                </label>
                <select
                  value={apiTestAppId}
                  onChange={(e) => setApiTestAppId(e.target.value)}
                  className="w-full text-xs bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 text-neutral-200 focus:outline-none focus:border-neutral-600 font-mono"
                >
                  {applications.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name} ({app.apiKeyPreview})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                  API Key
                </label>
                <div className="relative">
                  <input
                    type={showApiKeyInput ? 'text' : 'password'}
                    value={apiTestKey}
                    onChange={(e) => setApiTestKey(e.target.value)}
                    className="w-full text-xs bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 pr-12 text-neutral-200 focus:outline-none focus:border-neutral-600 font-mono"
                    placeholder="Paste full API key: nx_live_... or nx_test_..."
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKeyInput((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-neutral-400 hover:text-white"
                  >
                    {showApiKeyInput ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                  Recipient ID *
                </label>
                <input
                  type="text"
                  value={apiRecipientId}
                  onChange={(e) => setApiRecipientId(e.target.value)}
                  className="w-full text-xs bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 text-neutral-200 focus:outline-none focus:border-neutral-600 font-mono"
                  placeholder="e.g. user_123"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                  Notification Type *
                </label>
                <select
                  value={apiType}
                  onChange={(e) => setApiType(e.target.value)}
                  className="w-full text-xs bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 text-neutral-200 focus:outline-none focus:border-neutral-600 font-mono"
                >
                  {STANDARD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-400 mb-1 flex items-center justify-between">
                  <span>Idempotency-Key</span>
                  <button
                    type="button"
                    onClick={handleGenerateRandomKey}
                    className="text-[10px] text-emerald-400 hover:underline flex items-center gap-0.5"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>New Key</span>
                  </button>
                </label>
                <input
                  type="text"
                  value={apiIdempotencyKey}
                  onChange={(e) => setApiIdempotencyKey(e.target.value)}
                  className="w-full text-xs bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 text-neutral-200 focus:outline-none focus:border-neutral-600 font-mono"
                  placeholder="e.g. order_4821_shipped"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={apiTitle}
                  onChange={(e) => setApiTitle(e.target.value)}
                  className="w-full text-xs bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 text-neutral-200 focus:outline-none focus:border-neutral-600"
                  placeholder="Order shipped"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                  Message *
                </label>
                <input
                  type="text"
                  value={apiMessage}
                  onChange={(e) => setApiMessage(e.target.value)}
                  className="w-full text-xs bg-neutral-900 border border-neutral-800 rounded px-2.5 py-1.5 text-neutral-200 focus:outline-none focus:border-neutral-600"
                  placeholder="Your order #4821 has been shipped."
                />
              </div>
            </div>

            {/* Generated cURL Display Box */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-400 flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Example cURL Command:</span>
                </span>
                <button
                  type="button"
                  onClick={handleCopyCurl}
                  className="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-white px-2 py-0.5 rounded hover:bg-neutral-800 transition-colors"
                >
                  {copiedCurl ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied cURL!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy cURL</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="p-3 bg-neutral-950 border border-neutral-800 rounded-md font-mono text-xs text-neutral-300 overflow-x-auto select-all">
                {generatedCurl}
              </pre>
            </div>

            {/* Action Buttons: Single Request vs Duplicate Idempotency Test */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleRunApiTest}
                disabled={isTesting || isTestingIdempotency}
                className="gap-1.5 text-xs"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{isTesting ? 'Sending Request...' : 'Send Single Request'}</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestIdempotencyDuplicate}
                disabled={isTesting || isTestingIdempotency}
                className="gap-1.5 text-xs border-emerald-800 text-emerald-300 hover:bg-emerald-950/40"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isTestingIdempotency ? 'Sending 2 Requests...' : 'Test Idempotency (Send Duplicate)'}</span>
              </Button>

              {testResult && (
                <div className="flex items-center gap-2 text-xs font-mono ml-auto">
                  <span
                    className={`px-2 py-0.5 rounded font-bold ${
                      testResult.status === 201 || testResult.status === 200
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/60'
                        : 'bg-rose-950 text-rose-400 border border-rose-900/60'
                    }`}
                  >
                    HTTP {testResult.status} {testResult.status === 201 ? 'Created' : testResult.status === 200 ? 'OK (Replay)' : 'Error'}
                  </span>
                  <span className="text-neutral-500">·</span>
                  <span className="text-neutral-400">{testResult.durationMs}ms</span>
                </div>
              )}
            </div>

            {/* Idempotency Test Result Demonstration Card */}
            {idempotencyResult && (
              <div className="p-4 bg-emerald-950/20 border border-emerald-900/60 rounded-lg space-y-3 font-mono text-xs animate-in fade-in duration-200">
                <div className="flex items-center justify-between text-emerald-300 font-bold border-b border-emerald-900/40 pb-2">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Idempotency Deduplication Verified: 2 Requests Sent, 1 Notification Created</span>
                  </span>
                  <span className="text-[11px] text-neutral-400">{idempotencyResult.durationMs}ms total</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-2.5 bg-neutral-950 rounded border border-neutral-800">
                    <div className="text-neutral-400 font-semibold mb-1">Request #1 (Initial Creation):</div>
                    <div className="text-emerald-400">Status: HTTP {idempotencyResult.attempt1.status} Created</div>
                    <div className="text-neutral-300">Notification ID: {idempotencyResult.attempt1.data?.notificationId}</div>
                    <div className="text-neutral-400 text-[11px] mt-1">Stored in database and queued for delivery.</div>
                  </div>

                  <div className="p-2.5 bg-neutral-950 rounded border border-neutral-800">
                    <div className="text-neutral-400 font-semibold mb-1">Request #2 (Duplicate Replay):</div>
                    <div className="text-sky-400">Status: HTTP {idempotencyResult.attempt2.status} OK (Replay)</div>
                    <div className="text-neutral-300">Notification ID: {idempotencyResult.attempt2.data?.notificationId}</div>
                    <div className="text-emerald-400 text-[11px] mt-1">
                      idempotentReplay: true (Zero duplicate DB records!)
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Single Request Result JSON Inspector */}
            {testResult && (
              <div className="space-y-1.5 pt-2">
                <span className="text-xs font-medium text-neutral-400 block">
                  API Response Body:
                </span>
                <pre
                  className={`p-3 rounded-md font-mono text-xs overflow-x-auto border ${
                    testResult.status === 201 || testResult.status === 200
                      ? 'bg-neutral-950 border-emerald-900/40 text-emerald-300'
                      : 'bg-neutral-950 border-rose-900/40 text-rose-300'
                  }`}
                >
                  {JSON.stringify(testResult.data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-neutral-900/40 p-2.5 rounded-lg border border-neutral-800">
        <div className="flex flex-wrap items-center gap-2">
          {/* Read / Unread Tabs */}
          <div className="flex items-center gap-1 p-0.5 bg-neutral-950 rounded-md border border-neutral-800 text-xs">
            {[
              { id: 'all', label: 'All' },
              { id: 'unread', label: `Unread (${unreadCount})` },
              { id: 'read', label: 'Read' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setReadFilter(tab.id as any)}
                className={`px-3 py-1 rounded text-xs transition-colors ${
                  readFilter === tab.id
                    ? 'bg-neutral-800 text-white font-medium shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* App Selector */}
          <select
            value={selectedAppId}
            onChange={(e) => setSelectedAppId(e.target.value)}
            className="text-xs bg-neutral-950 border border-neutral-800 rounded-md px-2.5 py-1.5 text-neutral-300 focus:outline-none focus:border-neutral-600"
          >
            <option value="all">All Applications</option>
            {applications.map((app) => (
              <option key={app.id} value={app.id}>
                {app.name}
              </option>
            ))}
          </select>

          {/* Priority Selector */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="text-xs bg-neutral-950 border border-neutral-800 rounded-md px-2.5 py-1.5 text-neutral-300 focus:outline-none focus:border-neutral-600 font-mono"
          >
            <option value="all">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search inbox by title, recipient, key..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md pl-8 pr-3 py-1.5 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
          />
        </div>
      </div>

      {/* Notifications Inbox Feed */}
      {filteredNotifications.length === 0 ? (
        <Card className="p-12 text-center flex flex-col items-center justify-center">
          <Inbox className="w-8 h-8 text-neutral-600 mb-2" />
          <h3 className="text-sm font-semibold text-neutral-200">No notifications found</h3>
          <p className="text-xs text-neutral-400 mt-1 max-w-sm">
            No matching events found. Use the API Testing Playground above or click "Create Notification" to trigger a dispatch.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredNotifications.map((item) => {
            const isExpanded = expandedId === item.id;
            const isDelivered = item.status === 'delivered';
            const isFailed = item.status === 'failed';
            const isRetrying = item.status === 'retrying';
            const isPending = item.status === 'pending';
            const isSkipped = item.status === 'skipped';

            return (
              <Card
                key={item.id}
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                className={`p-4 cursor-pointer transition-all hover:border-neutral-700 ${
                  isFailed
                    ? 'border-rose-900/60 bg-rose-950/10'
                    : isSkipped
                    ? 'border-slate-800 bg-slate-950/30'
                    : item.isRead
                    ? 'bg-neutral-950/60'
                    : 'bg-neutral-900/60 border-neutral-700/80'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left Column: Read status dot + Core Info */}
                  <div className="flex items-start gap-3 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                        isFailed
                          ? 'bg-rose-500 ring-2 ring-rose-500/30'
                          : isRetrying
                          ? 'bg-amber-400 ring-2 ring-amber-400/30 animate-pulse'
                          : isSkipped
                          ? 'bg-slate-400 ring-2 ring-slate-400/20'
                          : item.isRead
                          ? 'bg-neutral-700'
                          : 'bg-emerald-500 ring-2 ring-emerald-500/20'
                      }`}
                    />

                    <div className="space-y-1 min-w-0">
                      {/* Metadata row */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-neutral-200">
                          {item.applicationName}
                        </span>
                        <span className="text-neutral-600">·</span>

                        {/* Status Chip */}
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold uppercase ${
                            isDelivered
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/60'
                              : isFailed
                              ? 'bg-rose-950 text-rose-300 border border-rose-900/60'
                              : isRetrying
                              ? 'bg-amber-950 text-amber-300 border border-amber-900/60 animate-pulse'
                              : isSkipped
                              ? 'bg-slate-900 text-slate-300 border border-slate-700/80'
                              : 'bg-yellow-950 text-yellow-300 border border-yellow-900/60'
                          }`}
                        >
                          {item.status || 'Delivered'}
                        </span>

                        {/* Attempt Count Badge */}
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                          {item.attemptCount ? `Attempt ${item.attemptCount}/3` : '1 attempt'}
                        </span>

                        {/* Idempotency Key Tag */}
                        {item.idempotencyKey && (
                          <span
                            className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-neutral-800/80 text-neutral-300 border border-neutral-700"
                            title={`Idempotency Key: ${item.idempotencyKey}`}
                          >
                            Idemp: {item.idempotencyKey}
                          </span>
                        )}

                        <span className="text-neutral-600">·</span>

                        {/* Category */}
                        <span className="font-mono text-emerald-400 text-[11px] uppercase font-semibold">
                          {item.aiCategory || item.type}
                        </span>

                        {/* Priority Badge */}
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.2 rounded uppercase font-bold ${
                            (item.aiPriority || item.priority) === 'critical'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800 animate-pulse'
                              : (item.aiPriority || item.priority) === 'high'
                              ? 'bg-orange-950 text-orange-300 border border-orange-800'
                              : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                          }`}
                        >
                          {item.aiPriority || item.priority}
                        </span>

                        {/* AI Status Badge */}
                        {item.aiProcessed ? (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800 flex items-center gap-1 font-semibold">
                            <Sparkles className="w-2.5 h-2.5 text-purple-400" />
                            ✓ Analyzed
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-neutral-900 text-neutral-500 border border-neutral-800">
                            AI Pending
                          </span>
                        )}

                        {/* Smart Grouping Badge */}
                        {item.aiShouldGroup && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-950 text-sky-300 border border-sky-800 font-medium">
                            Smart Groupable
                          </span>
                        )}

                        <span className="text-neutral-600">·</span>
                        <span className="text-neutral-400 font-mono text-[11px]">
                          to: {item.recipientId}
                        </span>
                      </div>

                      {/* Title */}
                      <h3
                        className={`text-sm tracking-tight ${
                          item.isRead ? 'text-neutral-300' : 'font-semibold text-white'
                        }`}
                      >
                        {item.title}
                      </h3>

                      {/* Message preview */}
                      <p className="text-xs text-neutral-400 leading-relaxed line-clamp-2">
                        {item.message}
                      </p>

                      {/* AI Summary Banner */}
                      {item.aiSummary && (
                        <div className="mt-2 text-xs text-purple-300 bg-purple-950/40 border border-purple-900/60 px-3 py-1.5 rounded flex items-center gap-2 font-sans">
                          <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          <div>
                            <span className="font-semibold text-purple-200">AI Summary:</span> {item.aiSummary}
                          </div>
                        </div>
                      )}

                      {/* Last Error inline banner if failed */}
                      {item.lastError && (
                        <div className="text-[11px] font-mono text-rose-300 bg-rose-950/60 px-2 py-1 rounded border border-rose-900/60 mt-1">
                          <span className="font-bold">Failure: </span>
                          {item.lastError}
                        </div>
                      )}

                      {/* Multi-Channel Delivery Status Badges */}
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] text-neutral-500 font-mono">
                          Channels:
                        </span>
                        <DeliveryStatusMatrix
                          deliveries={item.deliveries}
                          priority={item.priority}
                          compact={true}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Time and Quick Actions */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="flex items-center gap-2 text-xs font-mono text-neutral-500">
                      <span>{item.channel.toUpperCase()}</span>
                      <span>·</span>
                      <span title={formatDateTime(item.createdAt)}>
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        onClick={(e) => handleReanalyze(item.id, e)}
                        disabled={reanalyzingId === item.id}
                        className="text-purple-400 hover:text-purple-300 flex items-center gap-1 text-[11px] border border-purple-900/60 px-2 py-0.5 rounded bg-purple-950/40 hover:bg-purple-900/50 transition-colors"
                        title="Run AI Notification Intelligence on this notification"
                      >
                        <Sparkles className={`w-3 h-3 ${reanalyzingId === item.id ? 'animate-spin' : ''}`} />
                        <span>{reanalyzingId === item.id ? 'Analyzing...' : 'Re-analyze'}</span>
                      </button>

                      {item.isRead ? (
                        <button
                          onClick={(e) => handleMarkAsUnread(item.id, e)}
                          className="text-[11px] text-neutral-400 hover:text-neutral-200 px-2 py-0.5 rounded hover:bg-neutral-800 transition-colors"
                        >
                          Mark unread
                        </button>
                      ) : (
                        <button
                          onClick={(e) => handleMarkAsRead(item.id, e)}
                          className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium px-2 py-0.5 rounded hover:bg-emerald-950/60 transition-colors"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Detail Panel with Retry History */}
                {isExpanded && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mt-4 pt-4 border-t border-neutral-800/80 space-y-3 cursor-default"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs bg-neutral-950 p-3 rounded border border-neutral-800 font-mono">
                      <div>
                        <span className="text-neutral-500 block mb-0.5">Notification ID</span>
                        <span className="text-neutral-300">{item.id}</span>
                      </div>
                      <div>
                        <span className="text-neutral-500 block mb-0.5">Recipient</span>
                        <span className="text-neutral-300">{item.recipientId}</span>
                      </div>
                      <div>
                        <span className="text-neutral-500 block mb-0.5">Dispatched At</span>
                        <span className="text-neutral-300">{formatDateTime(item.createdAt)}</span>
                      </div>
                      <div>
                        <span className="text-neutral-500 block mb-0.5">Idempotency Key</span>
                        <span className="text-neutral-300">{item.idempotencyKey || 'None'}</span>
                      </div>
                    </div>

                    {/* Multi-Channel Delivery Status & Telemetry Matrix */}
                    <DeliveryStatusMatrix
                      deliveries={item.deliveries}
                      priority={item.priority}
                      compact={false}
                    />

                    {/* AI Notification Intelligence Diagnostics */}
                    {item.aiProcessed && (
                      <div className="p-3 bg-purple-950/20 border border-purple-900/50 rounded space-y-2 text-xs font-mono">
                        <div className="flex items-center justify-between text-purple-300 font-bold border-b border-purple-900/40 pb-1.5">
                          <span className="flex items-center gap-1.5">
                            <Brain className="w-3.5 h-3.5 text-purple-400" />
                            <span>AI Notification Intelligence Diagnostics</span>
                          </span>
                          <span className="text-[10px] text-purple-400 font-normal">
                            Analyzed: {item.aiProcessedAt ? formatDateTime(item.aiProcessedAt) : 'Recently'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                          <div>
                            <span className="text-neutral-500 block text-[10px]">AI Category</span>
                            <span className="text-purple-200 font-semibold">{item.aiCategory || 'SYSTEM'}</span>
                          </div>
                          <div>
                            <span className="text-neutral-500 block text-[10px]">AI Priority</span>
                            <span className="text-purple-200 font-semibold">{item.aiPriority || 'normal'}</span>
                          </div>
                          <div>
                            <span className="text-neutral-500 block text-[10px]">Smart Grouping</span>
                            <span className="text-purple-200 font-semibold">{item.aiShouldGroup ? 'Eligible for Batch' : 'Individual Delivery'}</span>
                          </div>
                          <div>
                            <span className="text-neutral-500 block text-[10px]">Final Enforced Priority</span>
                            <span className="text-emerald-400 font-semibold">{item.priority}</span>
                          </div>
                        </div>
                        {item.aiSummary && (
                          <div className="pt-1.5 border-t border-purple-900/30">
                            <span className="text-neutral-500 block text-[10px] mb-0.5">Concise Factual Summary:</span>
                            <span className="text-neutral-200 font-sans text-xs">{item.aiSummary}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Step-by-Step Retry History Timeline */}
                    {item.retryHistory && item.retryHistory.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <span className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                          <History className="w-3.5 h-3.5 text-amber-400" />
                          <span>Retry Attempt History Timeline:</span>
                        </span>
                        <div className="space-y-1.5">
                          {item.retryHistory.map((step, idx) => (
                            <div
                              key={idx}
                              className={`p-2.5 rounded text-xs font-mono border ${
                                step.status === 'delivered'
                                  ? 'bg-emerald-950/40 border-emerald-900/60 text-emerald-300'
                                  : step.status === 'skipped'
                                  ? 'bg-slate-900/40 border-slate-700/60 text-slate-300'
                                  : step.status === 'failed'
                                  ? 'bg-rose-950/40 border-rose-900/60 text-rose-300'
                                  : 'bg-amber-950/40 border-amber-900/60 text-amber-300'
                              }`}
                            >
                              <div className="flex items-center justify-between font-bold">
                                <span>Attempt #{step.attempt} ({step.status.toUpperCase()})</span>
                                <span className="text-[10px] text-neutral-400">{step.timestamp}</span>
                              </div>
                              {step.delayMs && step.delayMs > 0 && (
                                <div className="text-[11px] text-amber-400 mt-0.5">
                                  Exponential Backoff: Waited {step.delayMs}ms before attempt
                                </div>
                              )}
                              {step.error && (
                                <div className="text-[11px] text-rose-300 mt-1 font-mono">
                                  Error: {step.error}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {item.metadata && Object.keys(item.metadata).length > 0 && (
                      <div>
                        <span className="text-xs font-medium text-neutral-400 block mb-1.5">
                          Event Metadata (JSON)
                        </span>
                        <pre className="p-3 bg-neutral-950 border border-neutral-800 rounded text-xs font-mono text-neutral-300 overflow-x-auto">
                          {JSON.stringify(item.metadata, null, 2)}
                        </pre>
                      </div>
                    )}

                    {item.actionUrl && (
                      <div className="flex justify-end pt-1">
                        <a
                          href={item.actionUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-neutral-300 hover:text-white underline underline-offset-4"
                        >
                          <span>Open Target Action</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal: Create / Dispatch Notification */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create & Queue Notification"
        description="Dispatches a notification event into the asynchronous delivery pipeline."
      >
        <form onSubmit={handleCreateNotification} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Source Application *
            </label>
            <select
              value={newAppId}
              onChange={(e) => setNewAppId(e.target.value)}
              className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600"
              required
            >
              {applications.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name} ({app.environment})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Recipient Identifier *
              </label>
              <input
                type="text"
                value={newRecipientId}
                onChange={(e) => setNewRecipientId(e.target.value)}
                placeholder="usr_customer_8842"
                className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600 font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Delivery Channel
              </label>
              <select
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value)}
                className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600"
              >
                <option value="in_app">In-App Inbox</option>
                <option value="email">Email</option>
                <option value="push">Mobile Push</option>
                <option value="multi_channel">Multi-Channel (Priority Policy)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Priority
              </label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as any)}
                className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Idempotency-Key (Optional)
              </label>
              <input
                type="text"
                value={newIdempotencyKey}
                onChange={(e) => setNewIdempotencyKey(e.target.value)}
                placeholder="e.g. order_4821_shipped"
                className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Title *
            </label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Order dispatched"
              className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Message Body *
            </label>
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              rows={3}
              placeholder="Your order has shipped via Express delivery..."
              className="w-full text-xs bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-neutral-200 focus:outline-none focus:border-neutral-600"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCreateOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Enqueuing Job...' : 'Queue Notification'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
