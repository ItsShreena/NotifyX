import React, { useEffect, useState } from 'react';
import {
  Send,
  CheckCircle,
  AlertCircle,
  Clock,
  Radio,
  Layers,
  TrendingUp,
  ArrowUpRight,
  ExternalLink,
  Cpu,
  RotateCcw,
  Zap,
  Activity,
  Server,
  RefreshCw,
  Skull,
  History,
  X,
  ShieldCheck,
  AlertTriangle,
  Brain,
  Sparkles,
  Mail,
  Smartphone,
  Share2,
  Bell,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { analyticsService } from '../services/analyticsService';
import { notificationService } from '../services/notificationService';
import { queueService, QueueMetricsData, RedisHealthData, QueueJobItem } from '../services/queueService';
import { DashboardStats } from '../types/stats';
import { NotificationItem, AiAnalyticsStats, ChannelDeliveryStats } from '../types/notification';
import { formatNumber, formatPercent, formatRelativeTime, formatDateTime } from '../utils/formatters';
import { DeliveryStatusMatrix } from '../components/common/DeliveryStatusMatrix';
import { DeliveryActivityFlowChart } from '../components/dashboard/DeliveryActivityFlowChart';

export interface DashboardPageProps {
  onNavigateToNotifications: () => void;
  onNavigateToApplications: () => void;
  onNavigateToLogs: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onNavigateToNotifications,
  onNavigateToApplications,
  onNavigateToLogs,
}) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentNotifications, setRecentNotifications] = useState<NotificationItem[]>([]);
  const [queueMetrics, setQueueMetrics] = useState<QueueMetricsData | null>(null);
  const [redisHealth, setRedisHealth] = useState<RedisHealthData | null>(null);
  const [queueJobs, setQueueJobs] = useState<QueueJobItem[]>([]);
  const [deadLetterNotifications, setDeadLetterNotifications] = useState<any[]>([]);
  const [selectedNotificationForHistory, setSelectedNotificationForHistory] = useState<any | null>(null);
  const [aiStats, setAiStats] = useState<AiAnalyticsStats | null>(null);
  const [channelStats, setChannelStats] = useState<ChannelDeliveryStats | null>(null);
  const [reanalyzingId, setReanalyzingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRetryingJobs, setIsRetryingJobs] = useState(false);
  const [retrySuccessMsg, setRetrySuccessMsg] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [s, notifs, qData, jobs, dlNotifs, ai, chStats] = await Promise.all([
        analyticsService.getDashboardStats(),
        notificationService.getNotifications(),
        queueService.getMetrics().catch(() => ({
          metrics: { pending: 0, processing: 0, delivered: 0, failed: 0, retryCount: 0, delayed: 0 },
          redis: { connected: false, latencyMs: 0, host: '127.0.0.1', port: 6379 },
        })),
        queueService.getJobs(10).catch(() => []),
        queueService.getDeadLetterNotifications().catch(() => []),
        notificationService.getAiStats().catch(() => null),
        notificationService.getChannelStats().catch(() => null),
      ]);
      setStats(s);
      setRecentNotifications(notifs.slice(0, 5));
      setQueueMetrics(qData.metrics);
      setRedisHealth(qData.redis);
      setQueueJobs(jobs);
      setDeadLetterNotifications(dlNotifs);
      if (ai) setAiStats(ai);
      if (chStats) setChannelStats(chStats);
    } catch (err) {
      console.error('Failed to load dashboard metrics', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReanalyze = async (id: string) => {
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

  useEffect(() => {
    loadData();
    // Poll queue metrics every 4 seconds to observe real-time background worker progress
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleMarkAsRead = async (id: string) => {
    await notificationService.markAsRead(id);
    await loadData();
  };

  const handleRetryFailed = async () => {
    setIsRetryingJobs(true);
    setRetrySuccessMsg(null);
    try {
      const res = await queueService.retryFailedJobs();
      setRetrySuccessMsg(`Queued ${res.retriedCount} failed jobs for retry.`);
      setTimeout(() => setRetrySuccessMsg(null), 4000);
      await loadData();
    } catch (err) {
      console.error('Failed to retry jobs:', err);
    } finally {
      setIsRetryingJobs(false);
    }
  };

  if (loading || !stats) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-neutral-900 rounded w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-neutral-900/60 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-white">
              Notification Overview
            </h1>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-900/60 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Automated Pipeline Active
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">
            Real-time delivery tracking, automated retry scheduling, and multi-channel routing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onNavigateToNotifications}>
            <Send className="w-3.5 h-3.5 text-emerald-400" />
            <span>Dispatch & Inbox</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onNavigateToLogs}>
            <span>Event Logs</span>
            <ExternalLink className="w-3 h-3 text-neutral-500" />
          </Button>
          <Button variant="primary" size="sm" onClick={onNavigateToApplications}>
            <Layers className="w-3.5 h-3.5" />
            <span>Manage Apps</span>
          </Button>
        </div>
      </div>

      {/* Asynchronous Delivery Queue Infrastructure Strip */}
      <Card className="p-4 bg-neutral-900/40 border-neutral-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800/80">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                Delivery Pipeline & Queue Status
              </h2>
              <p className="text-[11px] text-neutral-400">
                Non-blocking asynchronous task pipeline with automated exponential backoff retries.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded bg-neutral-950 border border-neutral-800 text-neutral-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Pipeline: Operational</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded bg-neutral-950 border border-neutral-800 text-neutral-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Automated Retries: Enabled</span>
            </span>

            {queueMetrics && (queueMetrics.failed > 0 || deadLetterNotifications.length > 0) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetryFailed}
                disabled={isRetryingJobs}
                className="text-[11px] py-1 px-2 gap-1 text-amber-400 border-amber-900/60 hover:bg-amber-950/40"
              >
                <RotateCcw className={`w-3 h-3 ${isRetryingJobs ? 'animate-spin' : ''}`} />
                <span>Retry Failed ({deadLetterNotifications.length})</span>
              </Button>
            )}
          </div>
        </div>

        {retrySuccessMsg && (
          <div className="mt-2 text-xs font-mono text-emerald-400 bg-emerald-950/60 p-2 rounded border border-emerald-900/60">
            {retrySuccessMsg}
          </div>
        )}

        {/* 5 Core Queue Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
          {/* 1. Pending Jobs */}
          <div className="p-3 bg-neutral-950 rounded-md border border-neutral-850">
            <div className="flex items-center justify-between text-neutral-400 mb-1">
              <span className="text-[11px] font-medium">Queued Messages</span>
              <Clock className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-amber-400">
              {queueMetrics?.pending ?? 0}
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">
              Awaiting transmission
            </div>
          </div>

          {/* 2. Processing */}
          <div className="p-3 bg-neutral-950 rounded-md border border-neutral-850">
            <div className="flex items-center justify-between text-neutral-400 mb-1">
              <span className="text-[11px] font-medium">In Transit</span>
              <Activity className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-sky-400">
              {queueMetrics?.processing ?? 0}
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">
              Actively dispatching
            </div>
          </div>

          {/* 3. Delivered */}
          <div className="p-3 bg-neutral-950 rounded-md border border-neutral-850">
            <div className="flex items-center justify-between text-neutral-400 mb-1">
              <span className="text-[11px] font-medium">Delivered</span>
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-emerald-400">
              {queueMetrics ? formatNumber(queueMetrics.delivered) : '0'}
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">
              Delivered to recipients
            </div>
          </div>

          {/* 4. Failed */}
          <div className="p-3 bg-neutral-950 rounded-md border border-neutral-850">
            <div className="flex items-center justify-between text-neutral-400 mb-1">
              <span className="text-[11px] font-medium">Failed</span>
              <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-rose-400">
              {queueMetrics?.failed ?? 0}
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">
              Exhausted retries
            </div>
          </div>

          {/* 5. Retry Count */}
          <div className="p-3 bg-neutral-950 rounded-md border border-neutral-850">
            <div className="flex items-center justify-between text-neutral-400 mb-1">
              <span className="text-[11px] font-medium">Automated Retries</span>
              <RotateCcw className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-purple-400">
              {queueMetrics?.retryCount ?? 0}
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">
              Scheduled backoffs
            </div>
          </div>
        </div>
      </Card>

      {/* SECTION: AI NOTIFICATION INTELLIGENCE */}
      <Card className="p-5 border-purple-900/40 bg-purple-950/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-purple-950 text-purple-400 border border-purple-900/60">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">
                  AI Notification Intelligence
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 flex items-center gap-1 font-semibold">
                  <Sparkles className="w-3 h-3 text-purple-400" />
                  Neural Analyzer Active
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Automated category classification, priority intelligence, factual summaries, and smart batching decisions.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-neutral-400 bg-neutral-900 px-2.5 py-1 rounded border border-neutral-800">
              Model: <strong className="text-purple-300 font-bold">gemini-3.8-flash</strong>
            </span>
          </div>
        </div>

        {/* 6 AI Analytics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* 1. Analyzed */}
          <div className="p-3 bg-neutral-950 rounded-md border border-neutral-850">
            <div className="text-[11px] font-medium text-neutral-400 mb-1">
              AI Analyzed
            </div>
            <div className="text-xl font-bold font-mono text-purple-400 tabular-nums">
              {aiStats?.analyzed ?? 0}
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">
              Classified & verified
            </div>
          </div>

          {/* 2. Failures / Fallback */}
          <div className="p-3 bg-neutral-950 rounded-md border border-neutral-850">
            <div className="text-[11px] font-medium text-neutral-400 mb-1">
              AI Failures
            </div>
            <div className="text-xl font-bold font-mono text-amber-400 tabular-nums">
              {aiStats?.failures ?? 0}
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">
              Gracefully bypassed
            </div>
          </div>

          {/* 3. High Priority */}
          <div className="p-3 bg-neutral-950 rounded-md border border-neutral-850">
            <div className="text-[11px] font-medium text-neutral-400 mb-1">
              High Priority
            </div>
            <div className="text-xl font-bold font-mono text-orange-400 tabular-nums">
              {aiStats?.highPriority ?? 0}
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">
              Urgent actions
            </div>
          </div>

          {/* 4. Critical Priority */}
          <div className="p-3 bg-neutral-950 rounded-md border border-neutral-850">
            <div className="text-[11px] font-medium text-neutral-400 mb-1">
              Critical Priority
            </div>
            <div className="text-xl font-bold font-mono text-rose-400 tabular-nums">
              {aiStats?.criticalPriority ?? 0}
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">
              Emergency risks
            </div>
          </div>

          {/* 5. Grouped */}
          <div className="p-3 bg-neutral-950 rounded-md border border-neutral-850">
            <div className="text-[11px] font-medium text-neutral-400 mb-1">
              Smart Grouped
            </div>
            <div className="text-xl font-bold font-mono text-sky-400 tabular-nums">
              {aiStats?.grouped ?? 0}
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">
              Batch candidates
            </div>
          </div>

          {/* 6. Summarized */}
          <div className="p-3 bg-neutral-950 rounded-md border border-neutral-850">
            <div className="text-[11px] font-medium text-neutral-400 mb-1">
              Summarized
            </div>
            <div className="text-xl font-bold font-mono text-emerald-400 tabular-nums">
              {aiStats?.summarized ?? 0}
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">
              Factual summaries
            </div>
          </div>
        </div>
      </Card>

      {/* SECTION: MULTI-CHANNEL NOTIFICATION INFRASTRUCTURE & CHANNEL ANALYTICS */}
      <Card className="p-5 border-emerald-900/40 bg-emerald-950/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-900/60">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">
                  Multi-Channel Notification Infrastructure
                </h2>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1 font-semibold">
                  Multi-Channel Delivery Active
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Unified delivery across In-App, Email (Sandbox), and Push (Sandbox).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-neutral-400 bg-neutral-900 px-2.5 py-1 rounded border border-neutral-800">
              Total Notifications: <strong className="text-white font-bold">{channelStats?.totalNotifications ?? stats.totalNotifications}</strong>
            </span>
          </div>
        </div>

        {/* 3 Channel Cards (In-App, Email, Push) with Delivered, Failed, Skipped breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. In-App Channel */}
          <div className="p-4 bg-neutral-950 rounded-lg border border-neutral-850 space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">In-App Channel</span>
              </div>
              <span className="text-[10px] font-medium text-emerald-400 bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-900/60" title="Direct real-time notification stream">
                Active Gateway
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center font-mono">
              <div className="p-2 rounded bg-neutral-900 border border-neutral-800/80">
                <span className="text-[10px] text-neutral-400 block mb-0.5">Delivered</span>
                <span className="text-base font-bold text-emerald-400 tabular-nums">
                  {channelStats?.inApp.delivered ?? 0}
                </span>
              </div>
              <div className="p-2 rounded bg-neutral-900 border border-neutral-800/80">
                <span className="text-[10px] text-neutral-400 block mb-0.5">Failed</span>
                <span className="text-base font-bold text-rose-400 tabular-nums">
                  {channelStats?.inApp.failed ?? 0}
                </span>
              </div>
              <div className="p-2 rounded bg-neutral-900 border border-neutral-800/80">
                <span className="text-[10px] text-neutral-400 block mb-0.5">Skipped</span>
                <span className="text-base font-bold text-neutral-400 tabular-nums">
                  {channelStats?.inApp.skipped ?? 0}
                </span>
              </div>
            </div>
          </div>

          {/* 2. Email Channel */}
          <div className="p-4 bg-neutral-950 rounded-lg border border-neutral-850 space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">Email Channel</span>
              </div>
              <span className="text-[10px] font-medium text-sky-300 bg-sky-950 px-1.5 py-0.5 rounded border border-sky-900/60" title="Simulated delivery in development sandbox">
                Sandbox Provider
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center font-mono">
              <div className="p-2 rounded bg-neutral-900 border border-neutral-800/80">
                <span className="text-[10px] text-neutral-400 block mb-0.5">Delivered</span>
                <span className="text-base font-bold text-sky-400 tabular-nums">
                  {channelStats?.email.delivered ?? 0}
                </span>
              </div>
              <div className="p-2 rounded bg-neutral-900 border border-neutral-800/80">
                <span className="text-[10px] text-neutral-400 block mb-0.5">Failed</span>
                <span className="text-base font-bold text-rose-400 tabular-nums">
                  {channelStats?.email.failed ?? 0}
                </span>
              </div>
              <div className="p-2 rounded bg-neutral-900 border border-neutral-800/80">
                <span className="text-[10px] text-neutral-400 block mb-0.5">Skipped</span>
                <span className="text-base font-bold text-neutral-400 tabular-nums">
                  {channelStats?.email.skipped ?? 0}
                </span>
              </div>
            </div>
          </div>

          {/* 3. Push Channel */}
          <div className="p-4 bg-neutral-950 rounded-lg border border-neutral-850 space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">Push Channel</span>
              </div>
              <span className="text-[10px] font-medium text-purple-300 bg-purple-950 px-1.5 py-0.5 rounded border border-purple-900/60" title="Simulated push gateway in development sandbox">
                Sandbox Gateway
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center font-mono">
              <div className="p-2 rounded bg-neutral-900 border border-neutral-800/80">
                <span className="text-[10px] text-neutral-400 block mb-0.5">Delivered</span>
                <span className="text-base font-bold text-purple-400 tabular-nums">
                  {channelStats?.push.delivered ?? 0}
                </span>
              </div>
              <div className="p-2 rounded bg-neutral-900 border border-neutral-800/80">
                <span className="text-[10px] text-neutral-400 block mb-0.5">Failed</span>
                <span className="text-base font-bold text-rose-400 tabular-nums">
                  {channelStats?.push.failed ?? 0}
                </span>
              </div>
              <div className="p-2 rounded bg-neutral-900 border border-neutral-800/80">
                <span className="text-[10px] text-neutral-400 block mb-0.5">Skipped</span>
                <span className="text-base font-bold text-neutral-400 tabular-nums">
                  {channelStats?.push.skipped ?? 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Dead-Letter & Failure Inspector Section */}
      {deadLetterNotifications.length > 0 && (
        <Card className="p-5 border-rose-900/60 bg-rose-950/10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Skull className="w-4 h-4 text-rose-400" />
              <div>
                <h2 className="text-sm font-bold text-rose-200">
                  Dead-Letter Queue & Permanent Failures ({deadLetterNotifications.length})
                </h2>
                <p className="text-xs text-rose-300/70">
                  Jobs that failed all 3 attempts. Inspected here for debugging, root cause analysis, and replay.
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRetryFailed}
              disabled={isRetryingJobs}
              className="text-xs text-rose-300 border-rose-800 hover:bg-rose-950/50"
            >
              <RotateCcw className={`w-3.5 h-3.5 mr-1.5 ${isRetryingJobs ? 'animate-spin' : ''}`} />
              <span>Retry All Dead-Letter Jobs</span>
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-rose-900/40 text-rose-400/80 uppercase text-[10px]">
                  <th className="py-2 px-2">Notification ID</th>
                  <th className="py-2 px-2">Application / Title</th>
                  <th className="py-2 px-2">Recipient</th>
                  <th className="py-2 px-2">Attempt Count</th>
                  <th className="py-2 px-2">Current Status</th>
                  <th className="py-2 px-2">Last Error</th>
                  <th className="py-2 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-900/30">
                {deadLetterNotifications.map((notif) => (
                  <tr key={notif.id} className="hover:bg-rose-950/20 transition-colors">
                    <td className="py-2.5 px-2 text-rose-200 font-semibold">{notif.id}</td>
                    <td className="py-2.5 px-2">
                      <div className="text-white font-medium">{notif.title}</div>
                      <div className="text-[11px] text-neutral-400">{notif.application?.name || 'App'}</div>
                    </td>
                    <td className="py-2.5 px-2 text-neutral-300">{notif.recipientId}</td>
                    <td className="py-2.5 px-2">
                      <span className="px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-bold">
                        {notif.attemptCount || 3} of 3 (Max)
                      </span>
                    </td>
                    <td className="py-2.5 px-2">
                      <span className="px-1.5 py-0.5 rounded bg-rose-900 text-rose-100 font-bold text-[10px] uppercase">
                        {notif.status} (DLQ)
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-rose-300/90 max-w-xs truncate" title={notif.lastError || ''}>
                      {notif.lastError || 'Downstream carrier connection timeout'}
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <button
                        onClick={() => setSelectedNotificationForHistory(notif)}
                        className="text-[11px] text-rose-300 hover:text-white underline underline-offset-2 flex items-center gap-1 justify-end ml-auto"
                      >
                        <History className="w-3 h-3" />
                        <span>Retry History</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Main Grid: Delivery Activity Chart & Channel Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Delivery Activity Wave Flow Chart (8 cols) */}
        <Card className="lg:col-span-8 p-5">
          <DeliveryActivityFlowChart
            data={stats?.deliveryActivity || []}
            loading={loading}
            onRetry={loadData}
            onSendTest={onNavigateToNotifications}
          />
        </Card>

        {/* Channel Breakdown (4 cols) */}
        <Card className="lg:col-span-4 p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-neutral-200 mb-1">
              Channel Distribution
            </h2>
            <p className="text-xs text-neutral-400 mb-4">
              Dispatches segregated by notification transport.
            </p>

            <div className="space-y-3">
              {stats.channelBreakdown.map((item) => (
                <div key={item.channel} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-300">{item.label}</span>
                    <span className="font-mono text-neutral-400 tabular-nums">
                      {formatNumber(item.count)}{' '}
                      <span className="text-neutral-600">({item.percentage}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-neutral-200 rounded-full"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-neutral-800/80 flex items-center justify-between text-xs text-neutral-400">
            <span>Multi-channel routing</span>
            <span className="font-mono text-emerald-400">100% Active</span>
          </div>
        </Card>
      </div>

      {/* Live Delivery Queue Tasks Table */}
      {queueJobs.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-neutral-200">
                Recent Delivery Queue Tasks
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Real-time task dispatch states, execution durations, and attempt counts.
              </p>
            </div>
            <button
              onClick={loadData}
              className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh Queue</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-500 uppercase text-[10px]">
                  <th className="py-2 px-2">Job ID</th>
                  <th className="py-2 px-2">Notification ID</th>
                  <th className="py-2 px-2">Recipient</th>
                  <th className="py-2 px-2">Channel</th>
                  <th className="py-2 px-2">State</th>
                  <th className="py-2 px-2">Attempts</th>
                  <th className="py-2 px-2">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-850">
                {queueJobs.map((job) => {
                  const isCompleted = job.state === 'completed';
                  const isFailed = job.state === 'failed';
                  const isActive = job.state === 'active';
                  const isWaiting = job.state === 'waiting' || job.state === 'delayed';

                  return (
                    <tr key={job.id} className="hover:bg-neutral-900/40 transition-colors">
                      <td className="py-2.5 px-2 text-neutral-300 font-semibold">{job.id}</td>
                      <td className="py-2.5 px-2 text-neutral-400">{job.data.notificationId}</td>
                      <td className="py-2.5 px-2 text-neutral-300">{job.data.recipientId}</td>
                      <td className="py-2.5 px-2 uppercase text-[11px] text-neutral-400">{job.data.channel}</td>
                      <td className="py-2.5 px-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                            isCompleted
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/60'
                              : isFailed
                              ? 'bg-rose-950 text-rose-400 border border-rose-900/60'
                              : isActive
                              ? 'bg-sky-950 text-sky-400 border border-sky-900/60 animate-pulse'
                              : 'bg-amber-950 text-amber-400 border border-amber-900/60'
                          }`}
                        >
                          {job.state}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-neutral-300">
                        {job.attemptsMade} / {job.maxAttempts}
                      </td>
                      <td className="py-2.5 px-2 text-neutral-400">
                        {job.durationMs !== undefined ? `${job.durationMs}ms` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Recent Notifications Feed */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-neutral-200">
              Recent Application Events
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Live incoming notification triggers across e-commerce, SaaS, banking, and portals.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onNavigateToNotifications}
            className="text-xs text-neutral-300"
          >
            <span>View All Inbox Items</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="divide-y divide-neutral-800/80">
          {recentNotifications.map((notif) => (
            <div
              key={notif.id}
              className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-neutral-900/30 px-2 rounded-md transition-colors"
            >
              <div className="flex items-start gap-3">
                <span
                  className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                    notif.isRead ? 'bg-neutral-700' : 'bg-emerald-500 ring-2 ring-emerald-500/20'
                  }`}
                />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-neutral-100">{notif.title}</span>
                    <span className="text-neutral-500">·</span>
                    <span className="text-neutral-400 font-medium">{notif.applicationName}</span>

                    {/* Category */}
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-300 font-semibold uppercase">
                      {notif.aiCategory || notif.type}
                    </span>

                    {/* Priority */}
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase font-bold ${
                        (notif.aiPriority || notif.priority) === 'critical'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800 animate-pulse'
                          : (notif.aiPriority || notif.priority) === 'high'
                          ? 'bg-orange-950 text-orange-300 border border-orange-800'
                          : 'bg-neutral-900 text-neutral-400 border border-neutral-800'
                      }`}
                    >
                      {notif.aiPriority || notif.priority}
                    </span>

                    {/* AI Status Badge */}
                    {notif.aiProcessed ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 flex items-center gap-1 font-semibold">
                        <Sparkles className="w-2.5 h-2.5 text-purple-400" />
                        ✓ Analyzed
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-500 border border-neutral-800">
                        AI Pending
                      </span>
                    )}

                    {/* Smart Grouping Badge */}
                    {notif.aiShouldGroup && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 font-medium">
                        Smart Groupable
                      </span>
                    )}

                    {notif.idempotencyKey && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-300">
                        Idemp: {notif.idempotencyKey}
                      </span>
                    )}
                  </div>

                  <p className="text-neutral-400 mt-1 line-clamp-1">{notif.message}</p>

                  {/* AI Summary Display */}
                  {notif.aiSummary && (
                    <div className="mt-1.5 text-[11px] text-purple-300 bg-purple-950/30 border border-purple-900/50 px-2.5 py-0.5 rounded inline-flex items-center gap-1.5 font-sans">
                      <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
                      <span>
                        <strong className="font-semibold text-purple-200">AI Summary:</strong> {notif.aiSummary}
                      </span>
                    </div>
                  )}

                  {/* Multi-Channel Delivery Status */}
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="text-[10px] text-neutral-500 font-mono">
                      Delivery:
                    </span>
                    <DeliveryStatusMatrix
                      deliveries={notif.deliveries}
                      priority={notif.priority}
                      compact={true}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0 font-mono text-[11px] text-neutral-400 self-end sm:self-center">
                <button
                  onClick={() => handleReanalyze(notif.id)}
                  disabled={reanalyzingId === notif.id}
                  className="text-purple-400 hover:text-purple-300 flex items-center gap-1 text-[10px] border border-purple-900/60 px-2 py-0.5 rounded bg-purple-950/40 hover:bg-purple-900/50 transition-colors"
                  title="Run AI Notification Intelligence on this notification"
                >
                  <Sparkles className={`w-2.5 h-2.5 ${reanalyzingId === notif.id ? 'animate-spin' : ''}`} />
                  <span>{reanalyzingId === notif.id ? 'Analyzing...' : 'Re-analyze'}</span>
                </button>
                <span>{notif.channel.toUpperCase()}</span>
                <span className="text-neutral-600">/</span>
                <span className="tabular-nums">{formatRelativeTime(notif.createdAt)}</span>
                {!notif.isRead && (
                  <button
                    onClick={() => handleMarkAsRead(notif.id)}
                    className="text-neutral-300 hover:text-white underline underline-offset-2 ml-1"
                  >
                    Mark read
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Modal: Retry History Timeline */}
      {selectedNotificationForHistory && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg max-w-lg w-full p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">
                  Retry History & Timeline
                </h3>
              </div>
              <button
                onClick={() => setSelectedNotificationForHistory(null)}
                className="text-neutral-400 hover:text-white p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="p-3 bg-neutral-950 rounded border border-neutral-800">
                <div className="text-neutral-400">Notification ID: <span className="text-white font-bold">{selectedNotificationForHistory.id}</span></div>
                <div className="text-neutral-400">Title: <span className="text-white">{selectedNotificationForHistory.title}</span></div>
                <div className="text-neutral-400">Current Status: <span className="text-rose-400 font-bold uppercase">{selectedNotificationForHistory.status}</span></div>
                <div className="text-neutral-400">Total Attempts: <span className="text-amber-400 font-bold">{selectedNotificationForHistory.attemptCount || 3} of 3</span></div>
                {selectedNotificationForHistory.lastError && (
                  <div className="text-rose-400 mt-2 p-2 bg-rose-950/40 rounded border border-rose-900/60">
                    <span className="font-bold">Last Error: </span>
                    {selectedNotificationForHistory.lastError}
                  </div>
                )}
              </div>

              {/* Multi-Channel Delivery Status Breakdown */}
              <div className="pt-1">
                <DeliveryStatusMatrix
                  deliveries={selectedNotificationForHistory.deliveries}
                  priority={selectedNotificationForHistory.priority}
                  compact={false}
                />
              </div>

              <h4 className="text-xs font-semibold text-neutral-300 pt-2">Execution Step Timeline:</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {selectedNotificationForHistory.retryHistory && selectedNotificationForHistory.retryHistory.length > 0 ? (
                  selectedNotificationForHistory.retryHistory.map((step: any, index: number) => (
                    <div
                      key={index}
                      className={`p-2.5 rounded border ${
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
                        <span>Attempt {step.attempt} of {step.maxAttempts || 3}</span>
                        <span className="text-[10px] opacity-75">{step.timestamp}</span>
                      </div>
                      <div className="text-[11px] mt-1">Status: <span className="font-semibold uppercase">{step.status}</span></div>
                      {step.delayMs > 0 && (
                        <div className="text-[11px] text-amber-400">Backoff Delay Applied: {step.delayMs}ms</div>
                      )}
                      {step.error && (
                        <div className="text-[10px] text-rose-300 mt-1 font-mono">{step.error}</div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-3 bg-neutral-950 rounded text-neutral-500 text-center">
                    Initial attempt failed; retry history recorded in delivery pipeline.
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-neutral-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedNotificationForHistory(null)}
              >
                Close Timeline
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
